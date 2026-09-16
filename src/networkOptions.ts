import { isNetworkSelectable } from "./buildTarget";

export type NetworkOption = "xna" | "xna-legacy" | "xna-pq" | "xna-legacy-test" | "xna-pq-test";

// Keep the library identifiers stable: old saved wallets must still derive
// coin type 0, while new mainnet wallets default to Neurai's coin type 1900.
const ALL_NETWORK_OPTIONS: { value: NetworkOption; label: string }[] = [
  { value: "xna", label: "Mainnet Legacy" },
  { value: "xna-legacy", label: "Mainnet Old webwallet" },
  { value: "xna-pq", label: "Mainnet PQ" },
  { value: "xna-legacy-test", label: "Testnet Legacy" },
  { value: "xna-pq-test", label: "Testnet PQ" },
];

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
