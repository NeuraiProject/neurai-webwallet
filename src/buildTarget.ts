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
