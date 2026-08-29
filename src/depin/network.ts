/**
 * Which chains the DePIN chat runs on, and how the library names them.
 *
 * Two different questions live here and they must not be conflated:
 *
 *   *Can* an identity be derived? BIP44 account 100, so any legacy chain. The
 *   PQ chains use NIP-022 derivation and have no BIP44 path at all.
 *
 *   *Should* the chat be offered? A product decision. DePIN tokens exist on
 *   testnet and not on mainnet, and a chat with no possible token is not a
 *   degraded chat, it is a dead end. So mainnet is off until DePIN ships there.
 *
 * A table rather than `endsWith('-test')`: when mainnet gets DePIN this is one
 * entry and one test, and in the meantime a chain added to `ChainType` cannot
 * quietly inherit an answer it was never considered for.
 */
import type { Wallet } from '@neuraiproject/neurai-jswallet';

export type ChainType = Wallet['network'];

/** The two names `@neuraiproject/neurai-depin-msg` accepts. */
export type DepinNetwork = 'mainnet' | 'test';

export type ChatUnavailableReason = 'no-depin-on-chain' | 'no-bip44-derivation';

export type ChatAvailability =
  | { available: true; network: DepinNetwork }
  | { available: false; reason: ChatUnavailableReason; message: string };

const UNAVAILABLE_MESSAGE: Record<ChatUnavailableReason, string> = {
  'no-depin-on-chain': 'DePIN messaging is not available on mainnet yet.',
  'no-bip44-derivation': 'DePIN messaging is not available on post-quantum wallets yet.',
};

/**
 * Exhaustive by construction: a new `ChainType` member fails to compile until
 * it is given an answer here.
 */
const CHAT_BY_CHAIN: Record<ChainType, ChatAvailability> = {
  'xna-test': { available: true, network: 'test' },
  'xna-legacy-test': { available: true, network: 'test' },
  xna: { available: false, reason: 'no-depin-on-chain', message: UNAVAILABLE_MESSAGE['no-depin-on-chain'] },
  'xna-legacy': {
    available: false,
    reason: 'no-depin-on-chain',
    message: UNAVAILABLE_MESSAGE['no-depin-on-chain'],
  },
  'xna-pq': {
    available: false,
    reason: 'no-bip44-derivation',
    message: UNAVAILABLE_MESSAGE['no-bip44-derivation'],
  },
  'xna-pq-test': {
    available: false,
    reason: 'no-bip44-derivation',
    message: UNAVAILABLE_MESSAGE['no-bip44-derivation'],
  },
};

/**
 * Whether the chat is offered on a chain, and why not when it is not.
 *
 * @param chain - Wallet network
 * @returns Availability, carrying the library's network name when available
 */
export function chatAvailability(chain: string): ChatAvailability {
  const known = CHAT_BY_CHAIN[chain as ChainType];
  if (known) return known;
  // An unknown chain is not "probably fine": refusing is the only safe answer,
  // and it is visible rather than silent.
  return {
    available: false,
    reason: 'no-depin-on-chain',
    message: `DePIN messaging is not available on '${String(chain)}'.`,
  };
}

/** Convenience for call sites that only need the yes/no. */
export function isChatAvailable(chain: string): boolean {
  return chatAvailability(chain).available;
}

/**
 * The library's name for a chain.
 *
 * @throws If the chat is not available there — every protocol-2 call is gated
 *   on availability, so reaching this with an unsupported chain is a bug, and
 *   guessing a network would derive addresses for the wrong chain.
 */
export function depinNetworkFor(chain: string): DepinNetwork {
  const availability = chatAvailability(chain);
  if (!availability.available) {
    throw new Error(`No DePIN network for chain '${String(chain)}': ${availability.message}`);
  }
  return availability.network;
}
