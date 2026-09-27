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
 * given build is *for*, this decides which ones work at all. The strict witness
 * families (PQ v2 and ECDSA witness v3) are derivable on mainnet, but the node
 * does not protect them there until they activate, so offering them hands
 * someone a wallet that cannot do anything safely.
 */
const NOT_YET_ENABLED: readonly string[] = ["xna-pq-strict", "xna-ecdsa"];

/**
 * Networks that are not coin wallets on any chain. Generic AuthScript v1
 * (`nc1p…` / `tnc1p…`) is the address family for contracts, not for holding
 * coins; the post-quantum coin address is strict PQ v2 (`pq1z…` / `tpq1z…`).
 */
const NOT_A_WALLET: readonly string[] = ["xna-pq", "xna-pq-test"];

export function isNetworkEnabled(network: string): boolean {
  return !NOT_YET_ENABLED.includes(network) && !NOT_A_WALLET.includes(network);
}

/** Both gates: the build is for this network, and the network works. */
export function isNetworkSelectable(network: string): boolean {
  return isAllowedNetwork(network) && isNetworkEnabled(network);
}
