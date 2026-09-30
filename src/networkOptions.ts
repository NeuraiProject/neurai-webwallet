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

/* ---------------------------------------------------------------------------
 * The login picker: one chain, one address family
 *
 * The identifiers above pair a chain with an address type in a single string,
 * which is what the wallet library wants but not how someone chooses: first
 * "which network", then "which kind of address". These two axes, plus the table
 * that maps a pair back to a library identifier, keep that split in one place.
 * ------------------------------------------------------------------------- */

export type ChainKind = "mainnet" | "testnet";

export type AddressFamily = "legacy" | "ecdsa" | "pq";

export const CHAIN_KINDS: readonly {
  value: ChainKind;
  label: string;
  summary: string;
}[] = [
  { value: "mainnet", label: "Mainnet", summary: "Official network. Real funds." },
  { value: "testnet", label: "Testnet", summary: "Test network. Coins have no value." },
];

export const ADDRESS_FAMILIES: readonly {
  value: AddressFamily;
  label: string;
  summary: string;
  /** How an address of this family starts. The picker prints it in bold. */
  prefix: Record<ChainKind, string>;
  /** A real address of this family, to show the shape. Starts with `prefix`. */
  sample: Record<ChainKind, string>;
}[] = [
  {
    value: "legacy",
    label: "Legacy",
    summary: "Base58 addresses, supported by every Neurai release.",
    prefix: { mainnet: "N", testnet: "t" },
    sample: {
      mainnet: "NZCg1vAEJ9Cjsbqbo97eFquRo4spLXpLax",
      testnet: "tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3",
    },
  },
  {
    value: "ecdsa",
    label: "ECDSA",
    summary: "Bech32m witness v3. Smaller signatures, lower fees.",
    prefix: { mainnet: "nq1r", testnet: "tnq1r" },
    sample: {
      mainnet: "nq1rut29h39kfgek5r4fz2y8c0sg66lpvmszt7l58qw47hhxehgq5xwqnwmrj8",
      testnet: "tnq1rpqlhk9qucn28drzp33ugu2unxqf7y7qq887ll2q644739m49ph0sluj0re",
    },
  },
  {
    value: "pq",
    label: "PQ",
    summary: "Bech32m witness v2, with post-quantum ML-DSA-44 keys.",
    prefix: { mainnet: "pq1z", testnet: "tpq1z" },
    sample: {
      mainnet: "pq1z5ruu6wgf98pra84y7etr7qdnlfellpe2pmw5t3esw5dv2e50m6uqvtv3mc",
      testnet: "tpq1zxu7utdtg4xxghu793rrpxd0whwfns2kaekgadnvk2l63f789a8ysrcg5fq",
    },
  },
];

const NETWORK_BY_CHOICE: Record<ChainKind, Record<AddressFamily, NetworkOption>> = {
  mainnet: { legacy: "xna", ecdsa: "xna-ecdsa", pq: "xna-pq-strict" },
  testnet: { legacy: "xna-legacy-test", ecdsa: "xna-ecdsa-test", pq: "xna-pq-strict-test" },
};

/**
 * Mainnet Legacy has a second derivation: wallets made in the previous web
 * wallet sit on coin type 0 instead of 1900. Same address type, so the picker
 * offers it as a variant of Legacy rather than as a family of its own.
 */
export const OLD_WEBWALLET_NETWORK: NetworkOption = "xna-legacy";

export interface NetworkChoice {
  kind: ChainKind;
  family: AddressFamily;
  /** Mainnet Legacy on the old coin type 0 derivation. */
  oldWebwallet: boolean;
}

const CHOICE_BY_NETWORK: ReadonlyMap<string, NetworkChoice> = new Map([
  ["xna", { kind: "mainnet", family: "legacy", oldWebwallet: false }],
  [OLD_WEBWALLET_NETWORK, { kind: "mainnet", family: "legacy", oldWebwallet: true }],
  ["xna-ecdsa", { kind: "mainnet", family: "ecdsa", oldWebwallet: false }],
  ["xna-pq-strict", { kind: "mainnet", family: "pq", oldWebwallet: false }],
  ["xna-legacy-test", { kind: "testnet", family: "legacy", oldWebwallet: false }],
  // Reached only through the legacy `?network=xna-test` URL; same addresses.
  ["xna-test", { kind: "testnet", family: "legacy", oldWebwallet: false }],
  ["xna-ecdsa-test", { kind: "testnet", family: "ecdsa", oldWebwallet: false }],
  ["xna-pq-strict-test", { kind: "testnet", family: "pq", oldWebwallet: false }],
] as [string, NetworkChoice][]);

/** Which family each chain opens on before the user touches the picker. */
const PREFERRED_FAMILY: Record<ChainKind, AddressFamily> = {
  mainnet: "legacy",
  testnet: "ecdsa",
};

export function networkFor(kind: ChainKind, family: AddressFamily): NetworkOption {
  return NETWORK_BY_CHOICE[kind][family];
}

/** True when this build offers the pair and the network actually works. */
export function isChoiceAvailable(kind: ChainKind, family: AddressFamily): boolean {
  return isNetworkSelectable(networkFor(kind, family));
}

export function isChainAvailable(kind: ChainKind): boolean {
  return ADDRESS_FAMILIES.some(({ value }) => isChoiceAvailable(kind, value));
}

export function defaultFamily(kind: ChainKind): AddressFamily {
  const preferred = PREFERRED_FAMILY[kind];
  if (isChoiceAvailable(kind, preferred)) return preferred;
  return ADDRESS_FAMILIES.find(({ value }) => isChoiceAvailable(kind, value))?.value ?? preferred;
}

export function defaultChain(): ChainKind {
  return CHAIN_KINDS.find(({ value }) => isChainAvailable(value))?.value ?? "mainnet";
}

/** The pair the login form starts on: the first usable chain on its default family. */
export function defaultLoginNetwork(): NetworkOption {
  const kind = defaultChain();
  return networkFor(kind, defaultFamily(kind));
}

/** Split a library identifier back into the two axes the picker shows. */
export function describeNetwork(network: string): NetworkChoice {
  const choice = CHOICE_BY_NETWORK.get(network);
  if (choice) return choice;
  const kind = defaultChain();
  return { kind, family: defaultFamily(kind), oldWebwallet: false };
}

export function selectLoginNetwork(saved: string | null): NetworkOption {
  return NETWORK_OPTIONS.find((option) => option.value === saved)?.value ?? defaultLoginNetwork();
}

export function networkLabel(network: string): string {
  return ALL_NETWORK_OPTIONS.find((option) => option.value === network)?.label ??
    (network === "xna-test" ? "Testnet" : network);
}
