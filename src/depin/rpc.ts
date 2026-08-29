/**
 * The seam between the wallet's RPC and the library's expected client.
 *
 * Deliberately thin. Every protocol-2 rule — verifying `poolsig` before
 * decoding, challenge chaining, binding public keys to addresses — lives in
 * `@neuraiproject/neurai-depin-msg`, which is validated against the node's own
 * test vectors. Re-implementing any of it here would create a second source of
 * truth for the same rules.
 */

/** What the wallet exposes: `wallet.rpc(method, params)`. */
export type WalletRpc = (method: string, params: unknown[]) => Promise<unknown>;

/** What the library expects. */
export interface DepinRpc {
  call<T = unknown>(method: string, params?: unknown[]): Promise<T>;
}

/**
 * @param rpc - The wallet's RPC function
 * @returns An adapter usable as `{ rpc }` in every protocol-2 call
 */
export function createDepinRpc(rpc: WalletRpc): DepinRpc {
  if (typeof rpc !== 'function') {
    throw new Error('createDepinRpc needs a wallet rpc(method, params) function');
  }
  return {
    call: <T>(method: string, params: unknown[] = []) => rpc(method, params) as Promise<T>,
  };
}
