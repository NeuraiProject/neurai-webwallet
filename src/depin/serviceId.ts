/**
 * A stable name for "where this answer came from".
 *
 * The pool key is pinned against this identifier, so it has to name the
 * endpoint and nothing else. Two failures matter, in opposite directions:
 *
 *   Too loose, and two different endpoints share an id — the pin of one server
 *   would be applied to another.
 *
 *   Too specific, and the id changes when nothing did — credentials rotate,
 *   fragments come and go — which drops the pin and silently restarts TOFU,
 *   losing exactly the protection it exists for.
 *
 * The network is part of the identity: the same URL on a different chain is a
 * different service, and a pin must never cross chains.
 */

/** Bumped if the derivation ever changes, so old pins are ignored rather than misread. */
const SERVICE_ID_VERSION = 'v1';

export class DepinRpcUrlNotSupportedError extends Error {
  readonly url: string;

  constructor(url: string, detail: string) {
    super(`This RPC URL cannot be used for DePIN messaging: ${detail}`);
    this.name = 'DepinRpcUrlNotSupportedError';
    this.url = url;
  }
}

/**
 * Derives the identifier a pool pin is stored under.
 *
 * Credentials are stripped: they rotate without the endpoint changing, and they
 * must never reach persisted state. A query string is **rejected** rather than
 * represented — see below.
 *
 * @param network - Wallet chain
 * @param url - The RPC URL actually in use (default or user-configured)
 * @returns A stable identifier
 * @throws {DepinRpcUrlNotSupportedError} If the URL is unusable or carries a query
 */
export function depinServiceId(network: string, url: string): string {
  const raw = String(url ?? '').trim();
  if (!raw) {
    throw new DepinRpcUrlNotSupportedError(raw, 'the URL is empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DepinRpcUrlNotSupportedError(raw, 'it is not a valid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DepinRpcUrlNotSupportedError(raw, `unsupported scheme '${parsed.protocol}'`);
  }

  // A query cannot be ignored: two endpoints differing only there would share a
  // pin. It cannot be included either: the identifier is persisted, and a query
  // may carry a routing token or a credential, which must never be stored. So
  // it is refused, visibly, instead of being represented.
  if (parsed.search) {
    throw new DepinRpcUrlNotSupportedError(
      raw,
      'it has a query string, which cannot be stored safely (it may carry a token). Configure the RPC endpoint without one.',
    );
  }

  // Credentials never reach the identifier.
  parsed.username = '';
  parsed.password = '';
  // A fragment is never sent to the server, so it is not part of the identity.
  parsed.hash = '';

  // Trailing slashes are not a distinction the server makes.
  const path = parsed.pathname.replace(/\/+$/, '');

  return `${SERVICE_ID_VERSION}|${String(network)}|${parsed.origin.toLowerCase()}${path}`;
}
