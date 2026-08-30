/**
 * The protocol-2 client: one place that owns the identity, the verified pool
 * and the ordering of operations.
 *
 * ## Why operations are serialised
 *
 * Reading requires proving control of the address with a single-use nonce that
 * expires in 30 seconds. Every authenticated reply hands back the next one
 * (valid 300 s), so a poll chains them instead of asking again each time. That
 * chain only works if it is strictly serial: two overlapping reads would spend
 * the same nonce and the second would be rejected. Automatic polling, a manual
 * refresh and an admin clear are three entry points to the same chain, so they
 * queue behind one another here rather than racing.
 *
 * ## Why there is a generation counter
 *
 * Changing chain, endpoint, identity or token invalidates everything in flight.
 * A late reply from the previous configuration must not land in the new one, so
 * each reset bumps a generation and stale results are dropped.
 */
import {
  buildDepinMessage,
  clearDepinMessages,
  createSoftwareIdentity,
  decodeDepinRecipients,
  decodePlainReply,
  verifyDepinReply,
  type SenderIdentity,
  buildDepinMessageForPool,
  receiveDepinMessages,
  requestDepinChallenge,
  submitDepinMessage,
} from '@neuraiproject/neurai-depin-msg';

import { depinNetworkFor } from './network';
import { getVerifiedPool, type VerifiedPool } from './poolTrust';
import { createDepinRpc, type WalletRpc } from './rpc';

/** Discarded this long before the stated expiry, so a slow round trip cannot race it. */
const EXPIRY_MARGIN_MS = 5_000;
/** Protocol defaults, used only when the authenticated reply omits the value. */
const CHALLENGE_TTL_S = 30;
const CHAINED_TTL_S = 300;
/** A hostile or broken pool can keep saying `has_more`; this bounds one poll. */
const MAX_PAGES_PER_POLL = 20;

interface ChallengeState {
  challenge: string;
  expiresAtMs: number;
}

export interface DepinPlainMessage {
  hash: string;
  sender: string;
  timestamp: number;
  messageType: 'private' | 'group';
  plaintext: string;
}

export interface DepinReceivePage {
  /** Every entry the pool returned, verified. Includes traffic for other holders. */
  entries: Array<Record<string, unknown>>;
  /** Only what is both authentic and readable by this identity. */
  readable: DepinPlainMessage[];
  hasMore: boolean;
}

export interface DepinSendResult {
  messageHash: string;
  recipientCount: number;
}

/**
 * Keeps the entries that are both authentic and readable.
 *
 * `ok` and a non-empty `plaintext` are different questions and both matter.
 * `ok === false` is a message that must never be displayed — an unverifiable
 * sender, or a protocol-1 leftover the node still holds, which decrypts
 * perfectly and still proves nothing. `ok === true` with no plaintext is
 * ordinary group traffic addressed to other holders: routine, not an error.
 */
export function readableMessages(entries: Array<Record<string, unknown>>): DepinPlainMessage[] {
  const out: DepinPlainMessage[] = [];
  for (const entry of entries ?? []) {
    if (!entry || entry.ok !== true) continue;
    const plaintext = entry.plaintext;
    if (typeof plaintext !== 'string' || plaintext.length === 0) continue;
    const hash = typeof entry.hash === 'string' ? entry.hash : '';
    if (!hash) continue;
    const meta = (entry.message ?? {}) as { sender?: unknown; timestamp?: unknown; messageType?: unknown };
    out.push({
      hash,
      sender: typeof meta.sender === 'string' ? meta.sender : '',
      timestamp: typeof meta.timestamp === 'number' ? meta.timestamp : Math.floor(Date.now() / 1000),
      messageType: meta.messageType === 'private' ? 'private' : 'group',
      plaintext,
    });
  }
  return out;
}

/** One holder of the token, with a public key that has been verified against it. */
export interface VerifiedRecipient {
  address: string;
  pubkey: string;
}

export class DepinPoolProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DepinPoolProtocolError';
  }
}

export interface DepinClientOptions {
  rpc: WalletRpc;
  chain: string;
  /** The RPC URL actually in use, propagated from where it is chosen. */
  url: string;
  /** WIF of the DePIN chat identity (BIP44 account 100). Never persisted. */
  wif: string;
}

export function createDepinClient(options: DepinClientOptions) {
  const network = depinNetworkFor(options.chain);
  const rpc = createDepinRpc(options.rpc);

  let generation = 0;
  type ChatIdentity = SenderIdentity & { network: 'mainnet' | 'test' };
  let identityPromise: Promise<ChatIdentity> | null = null;
  let poolPromise: Promise<VerifiedPool> | null = null;
  let challenge: ChallengeState | null = null;
  /** Tail of the operation queue; every call chains onto it. */
  let queue: Promise<unknown> = Promise.resolve();

  /** Serialises an operation and drops its result if the session moved on. */
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const startedAt = generation;
    const run = queue.then(async () => {
      if (startedAt !== generation) {
        throw new DepinPoolProtocolError('The DePIN session changed while this operation was queued.');
      }
      return work();
    });
    // The queue must not stop on a failure, so it swallows the rejection while
    // the caller still receives it.
    queue = run.catch(() => undefined);
    return run;
  }

  function identity(): Promise<ChatIdentity> {
    if (!identityPromise) {
      identityPromise = createSoftwareIdentity({ privateKey: options.wif, network });
    }
    return identityPromise;
  }

  function pool(): Promise<VerifiedPool> {
    if (!poolPromise) {
      poolPromise = getVerifiedPool({ rpc: options.rpc, chain: options.chain, url: options.url, network }).catch(
        (err) => {
          // Do not cache a failure: the next attempt must ask again rather than
          // repeat a stale error forever.
          poolPromise = null;
          throw err;
        },
      );
    }
    return poolPromise;
  }

  function usableChallenge(nowMs: number): ChallengeState | null {
    if (!challenge) return null;
    return nowMs + EXPIRY_MARGIN_MS < challenge.expiresAtMs ? challenge : null;
  }

  async function ensureChallenge(token: string, poolPublicKey: string, nowMs: number): Promise<string> {
    const reusable = usableChallenge(nowMs);
    if (reusable) return reusable.challenge;

    const id = await identity();
    const issued = (await requestDepinChallenge({
      rpc,
      identity: id,
      token,
      poolPublicKey,
      type: 'receive',
    })) as { challenge: string; expiresIn?: number | null };

    // The authenticated reply carries the lifetime; the protocol default is a
    // fallback for when it does not, never the primary source.
    const ttl = typeof issued.expiresIn === 'number' ? issued.expiresIn : CHALLENGE_TTL_S;
    challenge = { challenge: issued.challenge, expiresAtMs: nowMs + ttl * 1000 };
    return challenge.challenge;
  }

  /**
   * Reads one page.
   *
   * @throws If the pool claims more pages but gives nothing to advance with.
   */
  async function receivePage(params: {
    token: string;
    afterHash?: string;
    limit?: number;
    nowMs?: number;
  }): Promise<DepinReceivePage> {
    const now = params.nowMs ?? Date.now();
    const verified = await pool();
    const poolPublicKey = verified.info.depinpoolpkey;
    const id = await identity();

    let current: string;
    try {
      current = await ensureChallenge(params.token, poolPublicKey, now);
    } catch (err) {
      challenge = null;
      throw err;
    }

    let page;
    try {
      page = await receiveDepinMessages({
        rpc,
        identity: id,
        token: params.token,
        challenge: current,
        poolPublicKey,
        network,
        ...(params.afterHash ? { afterHash: params.afterHash } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
      });
    } catch (err) {
      // Never carry a nonce through a failure: the node may already have spent
      // it, and a rejected reuse fails the same way every time — the channel
      // would stall for good instead of recovering on the next poll.
      challenge = null;
      throw err;
    }

    challenge = page.nextChallenge
      ? {
          challenge: page.nextChallenge,
          expiresAtMs:
            now + (typeof page.nextExpiresIn === 'number' ? page.nextExpiresIn : CHAINED_TTL_S) * 1000,
        }
      : null;

    const entries = (page.messages ?? []) as unknown as Array<Record<string, unknown>>;
    return { entries, readable: readableMessages(entries), hasMore: Boolean(page.hasMore) };
  }

  /**
   * The token's holders with their public keys, verified.
   *
   * Runs the library's own pipeline for the recipient list, composed from its
   * published pieces: verify the `poolsig`, decode only what the verifier
   * branded, then hand the body to `decodeDepinRecipients` — which throws if the
   * list is truncated, if the token or root do not match, or if ANY public key
   * does not hash to the address it is offered for.
   *
   * Only once that returns are the `{address, pubkey}` pairs read from the same
   * body, so they are not the server's word but what the library just finished
   * checking. `resolveDepinRecipients` does exactly this yet surfaces the keys
   * without their addresses, which is why the pipeline is assembled here.
   */
  async function verifiedRecipients(
    token: string,
    senderPubKey: string,
    verified: VerifiedPool,
  ): Promise<VerifiedRecipient[]> {
    const poolRoot = verified.info.token;
    const maxRecipients = verified.info.maxrecipients;

    // One above the limit, so "at the limit" and "over it" stay distinct.
    const reply = await options.rpc('depingetancestorrecipients', [token, maxRecipients + 1, poolRoot]);
    const branded = verifyDepinReply({
      reply,
      method: 'depingetancestorrecipients',
      token,
      poolPublicKey: verified.info.depinpoolpkey,
    });
    const body = decodePlainReply(branded) as { recipients?: Array<{ address?: unknown; pubkey?: unknown }> };

    // Throws on truncation, scope mismatch or a key that does not belong to its
    // address. Nothing below runs unless it passed.
    await decodeDepinRecipients(body, { token, poolRoot, maxRecipients, senderPubKey, network });

    const pairs: VerifiedRecipient[] = [];
    for (const entry of body.recipients ?? []) {
      if (typeof entry?.address === 'string' && typeof entry?.pubkey === 'string') {
        pairs.push({ address: entry.address, pubkey: entry.pubkey });
      }
    }
    return pairs;
  }

  return {
    get generation() {
      return generation;
    },

    /**
     * Invalidates everything: identity, pool, challenge and anything in flight.
     * For a change of endpoint or identity.
     */
    reset(): void {
      generation += 1;
      identityPromise = null;
      poolPromise = null;
      challenge = null;
    },

    /**
     * Drops only what belongs to the current channel.
     *
     * A challenge is bound to token and address, so switching token invalidates
     * it. The identity and the verified pool are properties of the endpoint and
     * survive: re-fetching the pool on every channel change would leave the
     * asset picker — which needs the pool to judge scope — waiting again each
     * time the user looks at a different token.
     */
    resetChannel(): void {
      challenge = null;
    },

    pool: () => enqueue(() => pool()),

    identity: () => enqueue(() => identity()),

    /**
     * Walks every page of a poll.
     *
     * The cursor advances with the last entry the page RETURNED, not the last
     * one shown: in a group most messages are addressed to other holders and
     * arrive verified but unreadable, and advancing only on what is displayed
     * would re-download that traffic on every poll, forever.
     */
    receiveAll(params: { token: string; limit?: number }): Promise<DepinReceivePage> {
      return enqueue(async () => {
        const entries: Array<Record<string, unknown>> = [];
        const readable: DepinPlainMessage[] = [];
        let cursor = '';
        let hasMore = false;

        for (let page = 0; page < MAX_PAGES_PER_POLL; page++) {
          const result = await receivePage({
            token: params.token,
            ...(cursor ? { afterHash: cursor } : {}),
            ...(params.limit ? { limit: params.limit } : {}),
          });
          entries.push(...result.entries);
          readable.push(...result.readable);
          hasMore = result.hasMore;

          if (!result.hasMore) break;

          // `has_more` is the server's word, so it cannot be the only stopping
          // condition. Anything that would not advance ends the loop loudly.
          if (result.entries.length === 0) {
            throw new DepinPoolProtocolError('The DePIN server reports more messages but returned an empty page.');
          }
          const last = result.entries[result.entries.length - 1];
          const next = typeof last?.hash === 'string' ? last.hash : '';
          if (!next) {
            throw new DepinPoolProtocolError('The DePIN server reports more messages but gave no cursor to continue.');
          }
          if (next === cursor) {
            throw new DepinPoolProtocolError('The DePIN server is repeating the same page.');
          }
          cursor = next;
        }

        return { entries, readable, hasMore };
      });
    },

    /**
     * Sends a group message to the token's holders.
     *
     * The recipient set is resolved and validated by the library, which refuses
     * any entry whose public key does not hash to its address — the check the
     * old `getpubkey` path did not have, and the reason this path exists.
     */
    send(params: { token: string; message: string; timestamp: number }): Promise<DepinSendResult> {
      return enqueue(async () => {
        const verified = await pool();
        const id = await identity();

        const built = (await buildDepinMessageForPool({
          rpc,
          token: params.token,
          poolRoot: verified.info.token,
          maxRecipients: verified.info.maxrecipients,
          poolPublicKey: verified.info.depinpoolpkey,
          network,
          identity: id,
          message: params.message,
          timestamp: params.timestamp,
          messageType: 'group',
        })) as {
          hex: string;
          messageHash: string;
          recipientCount?: number;
          resolution?: {
            skipped?: {
              noPubKeyComplete?: boolean | null;
              restrictedComplete?: boolean | null;
            };
          };
        };

        // The library refuses a truncated list. It only REPORTS the skip
        // accounting, and an incomplete count is just as unusable: it means the
        // pool left holders out and cannot say how many. That is not a smaller
        // group, it is an unknown one. `null` counts as incomplete — an absence
        // of information is not permission to send.
        const skipped = built.resolution?.skipped;
        if (skipped && (skipped.noPubKeyComplete !== true || skipped.restrictedComplete !== true)) {
          throw new DepinPoolProtocolError(
            'The DePIN server could not account for every holder of this token, so some would silently miss the message. Nothing was sent.',
          );
        }

        const receipt = (await submitDepinMessage({
          rpc,
          identity: id,
          messageHex: built.hex,
          poolPublicKey: verified.info.depinpoolpkey,
        })) as { messageHash?: string } | string;

        const messageHash =
          typeof receipt === 'object' && receipt?.messageHash ? receipt.messageHash : built.messageHash;
        return { messageHash, recipientCount: built.recipientCount ?? 0 };
      });
    },

    /** The token's holders with verified public keys. See `verifiedRecipients`. */
    recipients(token: string): Promise<VerifiedRecipient[]> {
      return enqueue(async () => {
        const verified = await pool();
        const id = await identity();
        return verifiedRecipients(token, id.publicKey, verified);
      });
    },

    /**
     * Pool statistics, through their signed envelope.
     *
     * Protocol 2 wrapped this reply too: it arrives as `{ body, poolsig }` and
     * reading a field straight off it yields `undefined`. The library has no
     * flow of its own for this call, so the envelope is verified here with the
     * same primitives its flows use. The signature binds the pool ROOT token —
     * established against the live testnet node, which does not verify unbound
     * — and only a value branded by the verifier can be decoded.
     */
    poolStats(): Promise<Record<string, unknown>> {
      return enqueue(async () => {
        const verified = await pool();
        const reply = await options.rpc('depinpoolstats', []);
        const branded = verifyDepinReply({
          reply,
          method: 'depinpoolstats',
          token: verified.info.token,
          poolPublicKey: verified.info.depinpoolpkey,
        });
        return (decodePlainReply(branded) ?? {}) as Record<string, unknown>;
      });
    },

    /**
     * Sends a message to one holder only.
     *
     * The node's wire format distinguishes the two kinds with a byte —
     * `0x01` private, `0x02` group, surfaced as `message_type` — and a private
     * message is encrypted to exactly two keys: the recipient's and the
     * sender's. `buildDepinMessage` adds the sender's itself (deduplicated by
     * curve point), so only the recipient's is passed in.
     *
     * The address is resolved to a key HERE rather than accepted from the UI:
     * the key has to be one the library verified against that address, and a
     * caller passing a key would be exactly the substitution the verification
     * exists to prevent.
     */
    sendPrivate(params: {
      token: string;
      toAddress: string;
      message: string;
      timestamp: number;
    }): Promise<DepinSendResult> {
      return enqueue(async () => {
        const verified = await pool();
        const id = await identity();
        const pairs = await verifiedRecipients(params.token, id.publicKey, verified);
        const match = pairs.find((entry) => entry.address === params.toAddress);
        if (!match) {
          throw new DepinPoolProtocolError(
            'That address is not a holder of this token with a published public key, so nothing can be encrypted to it.',
          );
        }

        const built = await buildDepinMessage({
          token: params.token,
          senderAddress: id.address,
          senderPubKey: id.publicKey,
          privateKey: options.wif,
          timestamp: params.timestamp,
          message: params.message,
          recipientPubKeys: [match.pubkey],
          messageType: 'private',
        });

        const receipt = (await submitDepinMessage({
          rpc,
          identity: id,
          messageHex: built.hex,
          poolPublicKey: verified.info.depinpoolpkey,
        })) as { messageHash?: string } | string;

        const messageHash =
          typeof receipt === 'object' && receipt?.messageHash ? receipt.messageHash : built.messageHash;
        return { messageHash, recipientCount: built.recipientCount ?? 2 };
      });
    },

    /**
     * Clears the pool. An owner operation: the node authorises it against the
     * signature over a fresh `admin` challenge, not against anything the UI
     * decided.
     */
    clear(params: { scope?: string; mode?: 'all' | number } = {}): Promise<unknown> {
      return enqueue(async () => {
        const verified = await pool();
        const id = await identity();

        // A receive nonce must never be reused here: this asks for its own.
        const issued = (await requestDepinChallenge({
          rpc,
          identity: id,
          token: verified.info.token,
          poolPublicKey: verified.info.depinpoolpkey,
          type: 'admin',
        })) as { challenge: string };

        return clearDepinMessages({
          rpc,
          identity: id,
          scope: params.scope ?? '',
          poolRoot: verified.info.token,
          challenge: issued.challenge,
          poolPublicKey: verified.info.depinpoolpkey,
          ...(params.mode !== undefined ? { mode: params.mode } : {}),
        });
      });
    },
  };
}

export type DepinClient = ReturnType<typeof createDepinClient>;
