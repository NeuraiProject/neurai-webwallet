// The published CommonJS entry exposes `createInstance` on the module object.
const Wallet: typeof import("@neuraiproject/neurai-jswallet") = require("@neuraiproject/neurai-jswallet");
import {
  ADDRESS_FAMILIES, defaultFamily, defaultLoginNetwork, describeNetwork, isChainAvailable,
  isChoiceAvailable,
  isWalletNetwork, NETWORK_OPTIONS, networkFor, networkLabel, selectLoginNetwork, WALLET_NETWORKS,
} from "@/networkOptions";
import { decodeAddress } from "@neuraiproject/neurai-create-transaction";

const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

test("offers modern mainnet first, then old webwallet recovery", () => {
  expect(NETWORK_OPTIONS.map(({ label }) => label)).toEqual([
    "Mainnet Legacy",
    "Mainnet Old webwallet",
    "Testnet Legacy",
    "Testnet PQ",
    "Testnet ECDSA witness",
  ]);
  expect(selectLoginNetwork(null)).toBe("xna");
  expect(selectLoginNetwork("invalid")).toBe("xna");
});

test("keeps existing saved wallets on their original derivation", () => {
  expect(selectLoginNetwork("xna-legacy")).toBe("xna-legacy");
  expect(networkLabel("xna-legacy")).toBe("Mainnet Old webwallet");
  expect(selectLoginNetwork("xna")).toBe("xna");
  expect(networkLabel("xna")).toBe("Mainnet Legacy");
  expect(selectLoginNetwork("xna-pq-strict-test")).toBe("xna-pq-strict-test");
  expect(networkLabel("xna-pq-strict-test")).toBe("Testnet PQ");
});

test("keeps the strict witness families off mainnet, where the node does not protect them yet", () => {
  for (const network of ["xna-pq-strict", "xna-ecdsa"]) {
    expect(NETWORK_OPTIONS.some(({ value }) => value === network)).toBe(false);
    expect(selectLoginNetwork(network)).toBe("xna");
  }
});

test("never offers PQ AuthScript, the contract address family, as a wallet", () => {
  for (const network of ["xna-pq", "xna-pq-test"]) {
    expect(NETWORK_OPTIONS.some(({ value }) => value === network)).toBe(false);
    // A selection saved by an older release falls back instead of reopening it.
    expect(selectLoginNetwork(network)).toBe("xna");
  }
  // Still named, for a session that was already open on it.
  expect(networkLabel("xna-pq-test")).toBe("Testnet PQ AuthScript");
});

test("the login picker's two axes map onto the library identifiers", () => {
  expect(networkFor("mainnet", "legacy")).toBe("xna");
  expect(networkFor("mainnet", "ecdsa")).toBe("xna-ecdsa");
  expect(networkFor("mainnet", "pq")).toBe("xna-pq-strict");
  expect(networkFor("testnet", "legacy")).toBe("xna-legacy-test");
  expect(networkFor("testnet", "ecdsa")).toBe("xna-ecdsa-test");
  expect(networkFor("testnet", "pq")).toBe("xna-pq-strict-test");
});

test("mainnet offers Legacy only; testnet offers all three and opens on ECDSA", () => {
  expect(isChoiceAvailable("mainnet", "legacy")).toBe(true);
  expect(isChoiceAvailable("mainnet", "ecdsa")).toBe(false);
  expect(isChoiceAvailable("mainnet", "pq")).toBe(false);
  for (const family of ["legacy", "ecdsa", "pq"] as const) {
    expect(isChoiceAvailable("testnet", family)).toBe(true);
  }
  expect(isChainAvailable("mainnet")).toBe(true);
  expect(isChainAvailable("testnet")).toBe(true);
  expect(defaultFamily("mainnet")).toBe("legacy");
  expect(defaultFamily("testnet")).toBe("ecdsa");
  expect(defaultLoginNetwork()).toBe("xna");
});

test("a saved identifier splits back into the pair the picker shows", () => {
  expect(describeNetwork("xna-ecdsa-test")).toEqual({
    kind: "testnet", family: "ecdsa", oldWebwallet: false,
  });
  // Same address type as Mainnet Legacy, on the previous web wallet's coin type.
  expect(describeNetwork("xna-legacy")).toEqual({
    kind: "mainnet", family: "legacy", oldWebwallet: true,
  });
  // The legacy `?network=xna-test` URL derives the Testnet Legacy addresses.
  expect(describeNetwork("xna-test")).toEqual({
    kind: "testnet", family: "legacy", oldWebwallet: false,
  });
  // Never offered as a wallet, so it falls back instead of pre-selecting PQ.
  expect(describeNetwork("xna-pq-test")).toEqual({
    kind: "mainnet", family: "legacy", oldWebwallet: false,
  });
});

test("each family shows a real address of its own, starting with the bold prefix", () => {
  for (const { label, prefix, sample } of ADDRESS_FAMILIES) {
    for (const kind of ["mainnet", "testnet"] as const) {
      const address = sample[kind];
      // A sample whose bold start were not its real start would teach the
      // wrong shape, and one that does not decode would teach a wrong format.
      expect(`${label}/${kind}: ${address.startsWith(prefix[kind])}`).toBe(
        `${label}/${kind}: true`
      );
      expect(() => decodeAddress(address)).not.toThrow();
    }
  }
});

test("knows every network jswallet can open, and nothing else", () => {
  expect([...WALLET_NETWORKS].sort()).toEqual([
    "xna",
    "xna-ecdsa",
    "xna-ecdsa-test",
    "xna-legacy",
    "xna-legacy-test",
    "xna-pq",
    "xna-pq-strict",
    "xna-pq-strict-test",
    "xna-pq-test",
    "xna-test",
  ]);
  expect(isWalletNetwork("xna-ecdsa-test")).toBe(true);
  expect(isWalletNetwork("xna-future-test")).toBe(false);
  expect(isWalletNetwork(null)).toBe(false);
});

test("the actual wallet derives coin type 1900 for Mainnet Legacy and 0 for Old webwallet", async () => {
  const modernNetwork = NETWORK_OPTIONS.find(({ label }) => label === "Mainnet Legacy")!.value;
  const oldNetwork = NETWORK_OPTIONS.find(({ label }) => label === "Mainnet Old webwallet")!.value;
  const modern = await Wallet.createInstance({ mnemonic, network: modernNetwork, offlineMode: true });
  const old = await Wallet.createInstance({ mnemonic, network: oldNetwork, offlineMode: true });
  expect(modern.getAddressObjects()[0].path).toBe("m/44'/1900'/0'/0/0");
  expect(old.getAddressObjects()[0].path).toBe("m/44'/0'/0'/0/0");
  expect(modern.getAddresses()[0]).not.toBe(old.getAddresses()[0]);
  const recovered = await Wallet.createInstance({
    mnemonic, network: selectLoginNetwork("xna-legacy"), offlineMode: true,
  });
  expect(recovered.getAddresses()[0]).toBe(old.getAddresses()[0]);
});
