/**
 * DePIN chat, protocol 2.
 *
 * Every call is authenticated and every answer is verified before anything is
 * decrypted. The ordering that makes this work — one operation at a time, a
 * single-use nonce chained from each reply — lives in `src/depin/client.ts`;
 * this hook is the React adapter around it and owns nothing but state.
 *
 * ## Private messages
 *
 * A private message is encrypted to exactly two keys: the recipient's and the
 * sender's. Leaving the sender out would mean losing your own outgoing messages
 * — the pool keeps them, but you could not open them from another device.
 * `buildDepinMessage` adds the sender's key itself, so only the recipient's is
 * supplied. The wire format marks the kind with a byte (`0x01` private, `0x02`
 * group), surfaced by the node as `message_type`.
 *
 * The recipient's key comes from the pool's signed recipient list, with the
 * library's own check that each key hashes to the address it is offered for.
 * The old path asked the server with `getpubkey` and believed the answer, which
 * is precisely the substitution that check exists to prevent.
 *
 * One thing the envelope does NOT carry is the recipient: it names the sender
 * only. So a sender cannot tell, from the message alone, which conversation one
 * of their own messages belongs to. The plaintext therefore starts with
 * `@<address> ` on private messages — the convention the mobile wallet already
 * uses — which travels inside the encryption and makes sent messages readable
 * and routable from any device. It is stripped before display.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Wallet } from '@neuraiproject/neurai-jswallet';

import { createDepinClient, type DepinClient, type DepinPlainMessage } from '../depin/client';
import { chatAvailability } from '../depin/network';
import { DepinPoolPinMismatchError, type VerifiedPool } from '../depin/poolTrust';
import { formatRpcError } from '../utils/rpcError';
import type { DepinChatIdentity } from '../utils/depinChatIdentity';

const POLL_INTERVAL_MS = 5_000;
/** Consecutive failures before polling gives up, so a broken endpoint is not hammered. */
const MAX_CONSECUTIVE_FAILURES = 5;

export interface DePINMessage {
  sender: string;
  message: string;
  timestamp: number;
  date: string;
  messageHash: string;
  messageType: 'private' | 'group';
  /** The other party, for a private message. Undefined for group traffic. */
  contactAddress?: string;
}

/** `@<address> text` — carries the recipient inside the encrypted payload. */
const PRIVATE_PREFIX = /^@([A-Za-z0-9]{26,40})\s+([\s\S]*)$/;

export interface PoolStats {
  enabled?: boolean;
  token?: string;
  total_messages?: number;
  total_size_bytes?: number;
  memory_usage_bytes?: number;
  oldest_message?: string;
  newest_message?: string;
  unique_senders?: number;
  avg_message_size?: number;
  expiring_in_24h?: number;
  messageexpiryhours?: number;
  [key: string]: unknown;
}

export interface PrivateConversation {
  address: string;
  displayName: string;
  unreadCount: number;
  lastMessageTime: number;
  messages: DePINMessage[];
}

export interface AssetValidity {
  has_asset?: boolean;
  amount?: number;
  valid?: number;
  blocked?: boolean;
}

export interface UseDePINChatParams {
  wallet: Wallet;
  /** Wallet chain, for availability and for the pin's identity. */
  chain: string;
  /** The RPC URL actually in use. Propagated from where it is chosen, never inferred. */
  rpcUrl: string;
  selectedAsset: string | null;
  /** Address of the DePIN chat identity. */
  chatAddress: string | null;
  identity: DepinChatIdentity | null;
}

/**
 * Maps one decrypted entry to what the UI renders, resolving which conversation
 * it belongs to.
 *
 * @param me - The chat identity's address, to tell an echo of our own message
 *   from one addressed to us
 */
export function toMessage(entry: DepinPlainMessage, me: string): DePINMessage {
  const base = {
    sender: entry.sender,
    timestamp: entry.timestamp,
    date: new Date(entry.timestamp * 1000).toLocaleString(),
    messageHash: entry.hash,
  };

  // The tag decides, not `message_type` alone. Routing is what the tag is for,
  // and a message that carries one must never be shown to the whole token just
  // because the kind byte said otherwise. The cost is that a group message whose
  // text genuinely begins with `@<address> ` would be read as private; that is
  // the trade of a text convention, and it is the one the other clients make.
  const tagged = entry.plaintext.match(PRIVATE_PREFIX);
  const isPrivate = Boolean(tagged) || entry.messageType === 'private';

  if (!isPrivate) {
    return { ...base, message: entry.plaintext, messageType: 'group' };
  }

  const message = tagged ? tagged[2] : entry.plaintext;
  // Ours: the tag names who we wrote to. Theirs: the sender is the other party.
  const contactAddress = entry.sender === me ? tagged?.[1] : entry.sender;

  return { ...base, message, messageType: 'private', contactAddress };
}

export function useDePINChat(params: UseDePINChatParams) {
  const { wallet, chain, rpcUrl, selectedAsset, chatAddress, identity } = params;

  const [groupMessages, setGroupMessages] = useState<DePINMessage[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [pool, setPool] = useState<VerifiedPool | null>(null);
  const [privateConversations, setPrivateConversations] = useState<Map<string, PrivateConversation>>(new Map());

  const seenHashesRef = useRef<Set<string>>(new Set());
  const consecutiveFailuresRef = useRef(0);
  const pollInFlightRef = useRef(false);

  const available = chatAvailability(chain).available;

  /**
   * One client per identity+endpoint. Rebuilding it on any of those changing is
   * what keeps a reply from the previous configuration out of the new one.
   */
  const client: DepinClient | null = useMemo(() => {
    if (!available || !identity?.wif || !rpcUrl) return null;
    try {
      return createDepinClient({
        rpc: (method, rpcParams) => wallet.rpc(method, rpcParams as never[]),
        chain,
        url: rpcUrl,
        wif: identity.wif,
      });
    } catch (err) {
      // A malformed endpoint (a query string, say) is a configuration problem,
      // not a transient failure: there is nothing to retry.
      console.warn('useDePINChat: cannot start DePIN client', err);
      return null;
    }
  }, [available, wallet, chain, rpcUrl, identity?.wif]);

  // Switching channel drops the conversation and the challenge, but NOT the
  // verified pool: that belongs to the endpoint, and the asset picker needs it
  // to judge which tokens are in scope before any channel exists.
  useEffect(() => {
    seenHashesRef.current = new Set();
    consecutiveFailuresRef.current = 0;
    setGroupMessages([]);
    setPrivateConversations(new Map());
    setError(null);
    setLastPoll(null);
    client?.resetChannel();
  }, [client, selectedAsset, chatAddress]);

  // A new client means a new endpoint or identity: everything goes.
  useEffect(() => {
    return () => {
      client?.reset();
      setPool(null);
    };
  }, [client]);

  /**
   * Verify and pin the pool as soon as there is a client, not when polling
   * starts.
   *
   * The pool is a property of the endpoint, not of the channel, and everything
   * downstream needs it first: deciding which tokens are in scope is what the
   * asset picker does BEFORE any asset is selected. Fetching it inside the poll
   * meant the picker waited for a pool that waited for a selection.
   */
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const verified = await client.pool();
        if (!cancelled) setPool(verified);
      } catch (err) {
        if (cancelled) return;
        // A pin mismatch or an unreachable endpoint has to be visible here:
        // without a pool nothing in the chat can be offered.
        setPool(null);
        setError(describeRef.current(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  /** Turns a failure into something the user can act on. */
  const describe = useCallback((err: unknown): string => {
    if (err instanceof DepinPoolPinMismatchError) {
      return `${err.message} Expected key ${err.expectedFingerprint}, server offered ${err.seenFingerprint}.`;
    }
    const text = formatRpcError(err);
    // The node's own wording for a state polling cannot escape.
    if (/has not revealed its public key/i.test(text)) {
      return 'This address has never sent a transaction, so the network does not know its public key yet and cannot deliver messages to it. Send any amount from this address once, then reopen the chat.';
    }
    return text;
  }, []);

  const describeRef = useRef(describe);
  useEffect(() => {
    describeRef.current = describe;
  }, [describe]);

  const ingest = useCallback(
    (entries: DepinPlainMessage[]) => {
      if (entries.length === 0 || !chatAddress) return;
      const seen = seenHashesRef.current;
      const group: DePINMessage[] = [];
      const byContact = new Map<string, DePINMessage[]>();

      for (const entry of entries) {
        if (seen.has(entry.hash)) continue;
        seen.add(entry.hash);
        const message = toMessage(entry, chatAddress);
        if (message.messageType === 'private') {
          // A private message we cannot place — an old one of ours without the
          // tag — is dropped rather than shown in the group, where everyone
          // would see a conversation that was meant for one person.
          if (!message.contactAddress) continue;
          const bucket = byContact.get(message.contactAddress) ?? [];
          bucket.push(message);
          byContact.set(message.contactAddress, bucket);
        } else {
          group.push(message);
        }
      }

      if (group.length > 0) {
        setGroupMessages((prev) => [...prev, ...group].sort((a, b) => a.timestamp - b.timestamp));
      }
      if (byContact.size > 0) {
        setPrivateConversations((prev) => {
          const updated = new Map(prev);
          for (const [address, messages] of byContact) {
            const existing = updated.get(address);
            const all = [...(existing?.messages ?? []), ...messages].sort((a, b) => a.timestamp - b.timestamp);
            updated.set(address, {
              address,
              displayName: address === chatAddress ? 'Me' : address,
              unreadCount: (existing?.unreadCount ?? 0) + messages.filter((m) => m.sender !== chatAddress).length,
              lastMessageTime: all[all.length - 1]?.timestamp ?? 0,
              messages: all,
            });
          }
          return updated;
        });
      }
    },
    [chatAddress],
  );

  const pollOnce = useCallback(async () => {
    if (!client || !selectedAsset) return;
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const verified = await client.pool();
      setPool(verified);
      const page = await client.receiveAll({ token: selectedAsset });
      ingest(page.readable);
      consecutiveFailuresRef.current = 0;
      setError(null);
      setLastPoll(new Date());
    } catch (err) {
      consecutiveFailuresRef.current += 1;
      const message = describe(err);
      // A pin mismatch or a misconfigured endpoint never recovers by retrying:
      // surface it at once and stop, instead of counting failures in silence.
      const fatal = err instanceof DepinPoolPinMismatchError;
      if (fatal || consecutiveFailuresRef.current >= 2) setError(message);
      if (fatal || consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) setIsPolling(false);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [client, selectedAsset, ingest, describe]);

  useEffect(() => {
    if (!isPolling || !client || !selectedAsset) return;
    let active = true;
    void pollOnce();
    const timer = setInterval(() => {
      if (active) void pollOnce();
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isPolling, client, selectedAsset, pollOnce]);

  const refreshMessages = useCallback(async () => {
    await pollOnce();
  }, [pollOnce]);

  /**
   * @param toAddress - Send privately to this holder. Omitted sends to the group.
   * @param at - Unix seconds to stamp. Passed in so an optimistic copy on screen
   *   and the message that comes back carry the same timestamp; deriving it
   *   twice left them a second apart and the copy never cleared.
   */
  const sendMessage = useCallback(
    async (message: string, toAddress?: string, at?: number): Promise<string | null> => {
      if (!client || !selectedAsset) {
        setError('DePIN messaging is not available for this wallet.');
        return null;
      }
      const cleaned = message.trim();
      if (!cleaned) return null;
      const timestamp = at ?? Math.floor(Date.now() / 1000);

      try {
        const sent = toAddress
          ? await client.sendPrivate({
              token: selectedAsset,
              toAddress,
              // The recipient rides inside the encryption so this message can be
              // placed in its conversation from any device, not just the one
              // that sent it.
              message: `@${toAddress} ${cleaned}`,
              timestamp,
            })
          : await client.send({ token: selectedAsset, message: cleaned, timestamp });
        setError(null);
        return sent.messageHash;
      } catch (err) {
        setError(describe(err));
        throw err;
      }
    },
    [client, selectedAsset, describe],
  );

  /**
   * Pool statistics, read through their signed envelope.
   *
   * Protocol 2 wrapped this reply too. Reading `total_messages` straight off the
   * result — as the protocol-1 code did — yields `undefined` against an updated
   * node, silently.
   */
  const fetchStats = useCallback(async (): Promise<PoolStats | null> => {
    if (!client) return null;
    try {
      const verified = await client.pool();
      setPool(verified);
      const body = (await client.poolStats()) as PoolStats;
      setStats(body);
      return body;
    } catch (err) {
      console.debug('useDePINChat: pool stats unavailable', err);
      return null;
    }
  }, [client]);

  const checkAssetValidity = useCallback(
    async (assetName: string, address: string): Promise<AssetValidity | null> => {
      try {
        return (await wallet.rpc('checkdepinvalidity', [assetName, address])) as AssetValidity;
      } catch (err) {
        console.debug('useDePINChat: checkdepinvalidity failed', err);
        return null;
      }
    },
    [wallet],
  );

  /**
   * Clears the pool. The node authorises this against the signature over a
   * fresh `admin` challenge — the UI only decides whether to offer it.
   */
  const clearMessages = useCallback(
    async (mode?: 'all' | number) => {
      if (!client) return null;
      try {
        return await client.clear(mode !== undefined ? { mode } : {});
      } catch (err) {
        setError(describe(err));
        throw err;
      }
    },
    [client, describe],
  );

  /**
   * Holders of the token with a verified public key: exactly the people a
   * message can reach. Refreshed with the channel, not on every poll — the set
   * changes with on-chain transfers, not with traffic.
   */
  const [contacts, setContacts] = useState<Array<{ address: string; pubkey: string }>>([]);

  useEffect(() => {
    if (!client || !selectedAsset || !pool) {
      setContacts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pairs = await client.recipients(selectedAsset);
        if (!cancelled) setContacts(pairs);
      } catch (err) {
        // Not fatal for the group chat: it only means the contact list stays
        // empty, and the reason belongs in the log rather than over the chat.
        console.debug('useDePINChat: could not resolve verified recipients', err);
        if (!cancelled) setContacts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, selectedAsset, pool]);

  const createPrivateConversation = useCallback((address: string) => {
    setPrivateConversations((prev) => {
      if (prev.has(address)) return prev;
      const updated = new Map(prev);
      updated.set(address, {
        address,
        displayName: address,
        unreadCount: 0,
        lastMessageTime: Math.floor(Date.now() / 1000),
        messages: [],
      });
      return updated;
    });
  }, []);

  return {
    groupMessages,
    contacts,
    privateConversations,
    createPrivateConversation,
    isPolling,
    setIsPolling,
    error,
    stats,
    lastPoll,
    /** The verified pool, once known. Carries the fingerprint the UI shows. */
    pool,
    sendMessage,
    refreshMessages,
    fetchStats,
    checkAssetValidity,
    clearMessages,
  };
}
