import type { Wallet } from "@neuraiproject/neurai-jswallet";
import { isNetworkSelectable } from "./buildTarget";

type ChainType = Wallet["network"];

export type NetworkOption = Exclude<ChainType, "xna-test">;

// Keep the library identifiers stable: old saved wallets must still derive
// coin type 0, while new mainnet wallets default to Neurai's coin type 1900.
//
// The witness families follow the node's address types:
//   PQ             strict PQ witness v2                  pq1z… / tpq1z…
//   ECDSA witness  strict ECDSA witness v3               nq1r… / tnq1r…
//   PQ AuthScript  generic AuthScript v1, ML-DSA-44 key  nc1p… / tnc1p…
//                  (the "PQ" wallet of older releases, then written
//                  nq1p… / tnq1p…). It is the contract family, so the picker
//                  never offers it (see buildTarget.ts); it stays listed for
//                  its label only.
const ALL_NETWORK_OPTIONS: { value: NetworkOption; label: string }[] = [
  { value: "xna", label: "Mainnet Legacy" },
  { value: "xna-legacy", label: "Mainnet Old webwallet" },
  { value: "xna-pq-strict", label: "Mainnet PQ" },
  { value: "xna-ecdsa", label: "Mainnet ECDSA witness" },
  { value: "xna-pq", label: "Mainnet PQ AuthScript" },
  { value: "xna-legacy-test", label: "Testnet Legacy" },
  { value: "xna-pq-strict-test", label: "Testnet PQ" },
  { value: "xna-ecdsa-test", label: "Testnet ECDSA witness" },
  { value: "xna-pq-test", label: "Testnet PQ AuthScript" },
];

/**
 * Every network jswallet can open a wallet on, whether or not the picker
 * offers it. `xna-test` is not in the picker: it is only reached through the
 * legacy `?network=xna-test` URL.
 */
export const WALLET_NETWORKS: readonly ChainType[] = [
  ...ALL_NETWORK_OPTIONS.map((option) => option.value),
  "xna-test",
];

export function isWalletNetwork(value: string | null | undefined): value is ChainType {
  return !!value && (WALLET_NETWORKS as readonly string[]).includes(value);
}

export const NETWORK_OPTIONS = ALL_NETWORK_OPTIONS.filter((option) =>
  isNetworkSelectable(option.value)
);

export function selectLoginNetwork(saved: string | null): NetworkOption {
  return NETWORK_OPTIONS.find((option) => option.value === saved)?.value ??
    NETWORK_OPTIONS[0].value;
}

export function networkLabel(network: string): string {
  return ALL_NETWORK_OPTIONS.find((option) => option.value === network)?.label ??
    (network === "xna-test" ? "Testnet" : network);
}
