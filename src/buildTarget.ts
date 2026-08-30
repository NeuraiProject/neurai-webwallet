// Build-time target. Parcel inlines `process.env.WALLET_BUILD` at compile
// time, so the bundle ships with a literal string and dead-branch DCE applies.
//
//   npm start                       → "all"      (default; both networks)
//   WALLET_BUILD=mainnet npm start  → "mainnet"  (mainnet picks only)
//   WALLET_BUILD=testnet npm start  → "testnet"  (testnet picks only)
export type WalletBuild = "mainnet" | "testnet" | "all";

const raw = process.env.WALLET_BUILD;
export const WALLET_BUILD: WalletBuild =
  raw === "mainnet" || raw === "testnet" ? raw : "all";

export function isTestnetChain(network: string): boolean {
  return network.endsWith("-test");
}

export function isAllowedNetwork(network: string): boolean {
  if (WALLET_BUILD === "all") return true;
  return WALLET_BUILD === "testnet" ? isTestnetChain(network) : !isTestnetChain(network);
}

/**
 * Networks that exist in the code but are not ready to be used.
 *
 * Separate from the build target on purpose: that decides which networks a
 * given build is *for*, this decides which ones work at all. Post-quantum
 * mainnet is derivable and selectable but not enabled, so offering it hands
 * someone a wallet that cannot do anything.
 */
const NOT_YET_ENABLED: readonly string[] = ["xna-pq"];

export function isNetworkEnabled(network: string): boolean {
  return !NOT_YET_ENABLED.includes(network);
}

/** Both gates: the build is for this network, and the network works. */
export function isNetworkSelectable(network: string): boolean {
  return isAllowedNetwork(network) && isNetworkEnabled(network);
}
