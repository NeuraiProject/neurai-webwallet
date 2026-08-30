/**
 * DePIN chat, protocol 2.
 *
 * Every call is authenticated and every answer is verified before anything is
 * decrypted. The ordering that makes this work — one operation at a time, a
 * single-use nonce chained from each reply — lives in `src/depin/client.ts`;
 * this hook is the React adapter around it and owns nothing but state.
 *
 * ## Private messages are not available in this delivery
 *
 * A private message needs the recipient's public key, and it has to be a key
 * the client can trust. Under protocol 2 the only authenticated source of
 * recipient keys is the pool's resolution, and the published API surfaces it as
 * a bare list of keys — the addresses each one belongs to are verified inside
 * the library and then dropped. So there is no supported way to ask "the key
 * for THIS address" without re-implementing the pubkey-to-address binding the
 * library exists to enforce.
 *
 * The old path asked the messaging server with `getpubkey` and used whatever it
 * answered, which is precisely the substitution a hostile endpoint would make.
 * Nothing is lost by removing it: that path stopped working the moment the node
 * moved to protocol 2. Private messaging returns when the library exposes the
 * verified address/key pairs it already checks.
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
}

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

/**
 * Kept in the surface while private messaging is disabled (see the note at the
 * top of this file), so the conversation UI stays in place for the day the
 * library exposes verified address/key pairs. It is always empty today.
 */
export interface PrivateConversation {
  address: string;
  displayName: string;
  unreadCount: number;
  lastMessageTime: number;
  messages: DePINMessage[];
}

/** Why the private path is closed, in the words the UI should use. */
export const PRIVATE_MESSAGES_UNAVAILABLE =
  'Private messages are unavailable for now: there is no verified way to obtain a specific recipient\'s public key under the new protocol. Group messages work normally.';

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

function toMessage(entry: DepinPlainMessage): DePINMessage {
  return {
    sender: entry.sender,
    message: entry.plaintext,
    timestamp: entry.timestamp,
    date: new Date(entry.timestamp * 1000).toLocaleString(),
    messageHash: entry.hash,
  };
}

export function useDePINChat(params: UseDePINChatParams) {
  const { wallet, chain, rpcUrl, selectedAsset, chatAddress, identity } = params;

  const [groupMessages, setGroupMessages] = useState<DePINMessage[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [pool, setPool] = useState<VerifiedPool | null>(null);

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

  // Changing channel or identity invalidates everything already fetched.
  useEffect(() => {
    seenHashesRef.current = new Set();
    consecutiveFailuresRef.current = 0;
    setGroupMessages([]);
    setError(null);
    setLastPoll(null);
    setPool(null);
    return () => {
      client?.reset();
    };
  }, [client, selectedAsset, chatAddress]);

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

  const ingest = useCallback((entries: DepinPlainMessage[]) => {
    if (entries.length === 0) return;
    const seen = seenHashesRef.current;
    const fresh: DePINMessage[] = [];
    for (const entry of entries) {
      if (seen.has(entry.hash)) continue;
      seen.add(entry.hash);
      fresh.push(toMessage(entry));
    }
    if (fresh.length === 0) return;
    setGroupMessages((prev) => [...prev, ...fresh].sort((a, b) => a.timestamp - b.timestamp));
  }, []);

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

  const sendMessage = useCallback(
    async (message: string): Promise<string | null> => {
      if (!client || !selectedAsset) {
        setError('DePIN messaging is not available for this wallet.');
        return null;
      }
      const cleaned = message.trim();
      if (!cleaned) return null;

      try {
        const sent = await client.send({
          token: selectedAsset,
          message: cleaned,
          timestamp: Math.floor(Date.now() / 1000),
        });
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

  /** Always empty: private messaging is disabled in this delivery. */
  const privateConversations = useMemo(() => new Map<string, PrivateConversation>(), []);

  // Signature kept so the call sites survive unchanged for the day private
  // messaging returns; today it only explains why nothing happened.
  const createPrivateConversation = useCallback((_address: string) => {
    setError(PRIVATE_MESSAGES_UNAVAILABLE);
  }, []);

  return {
    groupMessages,
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
