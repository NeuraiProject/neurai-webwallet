// The published CommonJS entry exposes `createInstance` on the module object.
const Wallet: typeof import("@neuraiproject/neurai-jswallet") = require("@neuraiproject/neurai-jswallet");
import { isWalletNetwork, NETWORK_OPTIONS, networkLabel, selectLoginNetwork, WALLET_NETWORKS } from "@/networkOptions";

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
