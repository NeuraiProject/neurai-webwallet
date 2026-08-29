/**
 * Trusting the DePIN pool's key.
 *
 * Under protocol 2 the node answers `depingetmsginfo` as `{ body, poolsig }`:
 * the content plus a signature made with the pool key. The catch is that the
 * key used to verify that signature travels INSIDE the body being verified, so
 * verifying it against itself proves the answer is self-consistent, not who
 * produced it. A substituted key arrives with a matching signature and passes.
 *
 * The pin is what makes it mean something. First contact records the key seen;
 * any later change is refused rather than adopted.
 *
 * ## What this protects, and what it does not
 *
 * It does NOT protect the first contact: an endpoint that is already hostile
 * when the pin is created gets pinned. That is why the fingerprint is exposed
 * for the UI to show. It DOES stop an attacker who appears afterwards, which is
 * automatic and needs nothing from the user.
 *
 * First contact is therefore pinned without asking. A confirmation dialog at
 * that moment would demand a decision the user has nothing to check against,
 * and the only thing it reliably teaches is to click through. The hard block is
 * reserved for a key rotation, where there is something real to judge.
 *
 * ## What is persisted
 *
 * Only `{ serviceId, poolRoot, poolPublicKey }`, keyed by the service id.
 * Never credentials: they rotate without the endpoint changing and must not
 * reach storage.
 */
import { getDepinPoolInfo, poolKeyFingerprint } from '@neuraiproject/neurai-depin-msg';

import { createDepinRpc, type WalletRpc } from './rpc';
import { depinServiceId } from './serviceId';

const STORAGE_KEY = 'depin_pool_pins';
const STORAGE_VERSION = 1;

export interface PoolPin {
  serviceId: string;
  poolRoot: string;
  poolPublicKey: string;
}

interface PinRecord {
  version: number;
  pins: Record<string, PoolPin>;
}

/** Raised when the endpoint answers with a different pool key than the pinned one. */
export class DepinPoolPinMismatchError extends Error {
  readonly serviceId: string;
  readonly expectedFingerprint: string;
  readonly seenFingerprint: string;

  constructor(serviceId: string, expectedFingerprint: string, seenFingerprint: string) {
    super(
      'The DePIN server is answering with a different pool key than the one this wallet pinned. ' +
        'Messaging is blocked until this is resolved.',
    );
    this.name = 'DepinPoolPinMismatchError';
    this.serviceId = serviceId;
    this.expectedFingerprint = expectedFingerprint;
    this.seenFingerprint = seenFingerprint;
  }
}

/**
 * The pool key's fingerprint, for a human to compare out of band.
 *
 * Delegated to the library rather than abbreviated locally: a fingerprint is
 * only useful if it matches what another client shows for the same pool.
 */
export function fingerprint(poolPublicKey: string): string {
  const key = String(poolPublicKey || '');
  if (!key) return key;
  try {
    return poolKeyFingerprint(key);
  } catch {
    // Not a parseable key (an unknown counterpart in a mismatch): show what we
    // have rather than hiding the difference the user is being asked about.
    return key.length < 16 ? key : `${key.slice(0, 8)}…${key.slice(-8)}`;
  }
}

function readRecord(): PinRecord {
  const empty: PinRecord = { version: STORAGE_VERSION, pins: {} };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode, blocked): behave as if there were no
    // pins rather than failing the chat outright.
    return empty;
  }
  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as Partial<PinRecord> | null;
    if (!parsed || parsed.version !== STORAGE_VERSION || !parsed.pins || typeof parsed.pins !== 'object') {
      // Unknown or malformed: treat as "no pin" instead of guessing. TOFU will
      // record a fresh one, which is safe; misreading a pin would not be.
      return empty;
    }
    const pins: Record<string, PoolPin> = {};
    for (const [key, value] of Object.entries(parsed.pins)) {
      const pin = value as Partial<PoolPin>;
      if (
        typeof pin?.serviceId === 'string' &&
        typeof pin?.poolRoot === 'string' &&
        typeof pin?.poolPublicKey === 'string' &&
        pin.poolPublicKey.length > 0
      ) {
        pins[key] = { serviceId: pin.serviceId, poolRoot: pin.poolRoot, poolPublicKey: pin.poolPublicKey };
      }
    }
    return { version: STORAGE_VERSION, pins };
  } catch {
    return empty;
  }
}

function writeRecord(record: PinRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A pin we cannot persist still protects this session; losing it only means
    // the next visit starts at first contact again.
  }
}

export function loadPin(serviceId: string): PoolPin | null {
  return readRecord().pins[serviceId] ?? null;
}

export function savePin(pin: PoolPin): void {
  const record = readRecord();
  record.pins[pin.serviceId] = pin;
  writeRecord(record);
}

/** Explicit user action after a mismatch. Never call this automatically. */
export function forgetPin(serviceId: string): void {
  const record = readRecord();
  delete record.pins[serviceId];
  writeRecord(record);
}

export interface VerifiedPool {
  /** The pool's own description, from the body whose signature verified. */
  info: {
    token: string;
    maxrecipients: number;
    protocol: number;
    depinpoolpkey: string;
    [key: string]: unknown;
  };
  pin: PoolPin;
  serviceId: string;
  /** True when this contact created the pin, i.e. the key was taken on trust. */
  firstContact: boolean;
  /** Short form of the pool key, for the UI to show. */
  fingerprint: string;
}

/**
 * Fetches `depingetmsginfo`, verifies its `poolsig` and enforces the pin.
 *
 * @param params.rpc - The wallet's RPC function
 * @param params.chain - Wallet network, part of the pin's identity
 * @param params.url - The RPC URL actually in use
 * @param params.network - The library's name for the chain
 * @throws {DepinPoolPinMismatchError} If the endpoint answers with another key
 */
export async function getVerifiedPool(params: {
  rpc: WalletRpc;
  chain: string;
  url: string;
  network: 'mainnet' | 'test';
}): Promise<VerifiedPool> {
  const serviceId = depinServiceId(params.chain, params.url);
  const stored = loadPin(serviceId);
  const rpc = createDepinRpc(params.rpc);

  let result;
  try {
    result = await getDepinPoolInfo({
      rpc,
      serviceId,
      trust: stored ? { mode: 'pinned', pin: stored } : { mode: 'tofu' },
      network: params.network,
    });
  } catch (err) {
    // The library rejects a pinned mismatch; translate it into something the UI
    // can act on, keeping the fingerprint the user already knows.
    if (stored && /pin|mismatch|poolPublicKey/i.test(String((err as Error)?.message ?? ''))) {
      throw new DepinPoolPinMismatchError(serviceId, fingerprint(stored.poolPublicKey), 'unknown');
    }
    throw err;
  }

  const seenKey = result.pin?.poolPublicKey ?? result.info?.depinpoolpkey ?? '';
  if (stored && seenKey && seenKey !== stored.poolPublicKey) {
    throw new DepinPoolPinMismatchError(
      serviceId,
      fingerprint(stored.poolPublicKey),
      fingerprint(seenKey),
    );
  }

  // Keyed by OUR identifier, never by whatever the answer echoes back: the pin
  // has to be found again by the same derivation that looked it up.
  const pin: PoolPin = {
    serviceId,
    poolRoot: String(result.pin?.poolRoot ?? result.info?.token ?? ''),
    poolPublicKey: seenKey,
  };

  // Option A: first contact is pinned automatically. The UI shows the
  // fingerprint; it does not ask a question the user cannot answer.
  if (!stored && pin.poolPublicKey) savePin(pin);

  return {
    info: result.info as VerifiedPool['info'],
    pin: stored ?? pin,
    serviceId,
    firstContact: !stored,
    fingerprint: fingerprint(seenKey),
  };
}
