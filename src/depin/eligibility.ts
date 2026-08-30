/**
 * Which of the wallet's assets can actually open a DePIN chat.
 *
 * The chat is for DePIN tokens, and only for those. It is not an asset chat
 * that happens to support DePIN: the pool is configured on one root token,
 * membership is checked on chain, and the message is encrypted to that token's
 * holders. A regular asset has none of that, so offering it is offering
 * something that cannot work.
 *
 * Four conditions, cheapest first, and each one has its own reason so the UI
 * can say *why* rather than just refusing:
 *
 *   1. The chain offers the chat at all (see `network.ts`).
 *   2. The name is a well-formed DePIN token — the library's validator, not a
 *      `startsWith('&')`, which is only good enough for an icon.
 *   3. It is inside the pool's root scope. The node serves ONE root and its
 *      descendants; holding a DePIN token from another tree does not open this
 *      pool. Comparison is component-wise, so `&TEST` never matches `&TESTING`.
 *   4. The holding is valid on chain: present, not revoked, not blocked.
 *
 * Everything here is pure. The chain lookups happen elsewhere and are passed in,
 * so the decision itself is testable as a table.
 */
import { isDepinTokenInScope, validateDepinSectionToken } from '@neuraiproject/neurai-depin-msg';

import { chatAvailability } from './network';

export type EligibilityReason =
  | 'eligible'
  | 'chat-unavailable-here'
  | 'not-depin-token'
  | 'invalid-depin-token'
  | 'outside-pool-scope'
  | 'no-balance'
  | 'invalid-holder'
  | 'blocked-holder'
  | 'pubkey-unrevealed'
  | 'pool-not-ready'
  | 'checking-holding';

export interface AssetEligibility {
  assetName: string;
  amount: number;
  selectable: boolean;
  reason: EligibilityReason;
  /** Ready to show next to the asset. Empty when it is selectable. */
  message: string;
}

/** What `checkdepinvalidity` reports for one holder. */
export interface HolderValidity {
  has_asset?: boolean;
  amount?: number;
  valid?: number;
  blocked?: boolean;
}

export interface EligibilityContext {
  chain: string;
  /** Root token the pool serves, from the VERIFIED pool info. Null until it is known. */
  poolRoot: string | null;
  /** Whether the chat identity's public key is known to the chain. */
  pubkeyRevealed: boolean;
}

const MESSAGES: Record<Exclude<EligibilityReason, 'eligible'>, string> = {
  'chat-unavailable-here': 'DePIN messaging is not available on this network.',
  'not-depin-token': 'Only DePIN tokens can be used for messaging.',
  'invalid-depin-token': 'This token name is not a valid DePIN token.',
  'outside-pool-scope': 'This token belongs to a different DePIN pool.',
  'no-balance': 'You do not hold any of this token.',
  'invalid-holder': 'This holding is not valid on chain.',
  'blocked-holder': 'This holding has been blocked by the token issuer.',
  'pubkey-unrevealed':
    'This address has never sent a transaction, so the network does not know its public key and cannot deliver messages to it.',
  'pool-not-ready': 'Waiting for the DePIN server to be verified.',
  'checking-holding': 'Checking this holding on chain…',
};

function refuse(assetName: string, amount: number, reason: Exclude<EligibilityReason, 'eligible'>): AssetEligibility {
  return { assetName, amount, selectable: false, reason, message: MESSAGES[reason] };
}

/**
 * Decides whether one held asset can open the chat.
 *
 * @param assetName - Asset name as held, e.g. `&DEPINTESTING`
 * @param amount - Balance at the chat address
 * @param context - Chain, verified pool root and identity state
 * @param validity - `checkdepinvalidity` for this asset, or null if not checked yet
 */
export function assetEligibility(
  assetName: string,
  amount: number,
  context: EligibilityContext,
  validity: HolderValidity | null,
): AssetEligibility {
  if (!chatAvailability(context.chain).available) {
    return refuse(assetName, amount, 'chat-unavailable-here');
  }

  // Cheap shape check first: a name that is not even DePIN-looking must never
  // become an RPC argument.
  if (!assetName.startsWith('&')) {
    return refuse(assetName, amount, 'not-depin-token');
  }
  if (!validateDepinSectionToken(assetName).valid) {
    return refuse(assetName, amount, 'invalid-depin-token');
  }

  if (!(amount > 0)) {
    return refuse(assetName, amount, 'no-balance');
  }

  if (!context.poolRoot) {
    return refuse(assetName, amount, 'pool-not-ready');
  }
  if (!isDepinTokenInScope(assetName, context.poolRoot)) {
    return refuse(assetName, amount, 'outside-pool-scope');
  }

  if (!validity) {
    return refuse(assetName, amount, 'checking-holding');
  }
  if (validity.blocked === true) {
    return refuse(assetName, amount, 'blocked-holder');
  }
  if (validity.has_asset !== true || validity.valid !== 1) {
    return refuse(assetName, amount, 'invalid-holder');
  }

  // Last, because it is about the identity rather than the token: without a
  // public key on chain the pool cannot encrypt anything to this address.
  if (!context.pubkeyRevealed) {
    return refuse(assetName, amount, 'pubkey-unrevealed');
  }

  return { assetName, amount, selectable: true, reason: 'eligible', message: '' };
}

/** True only for a decision that permits a protocol-2 call. */
export function isEligible(decision: AssetEligibility): boolean {
  return decision.selectable && decision.reason === 'eligible';
}
