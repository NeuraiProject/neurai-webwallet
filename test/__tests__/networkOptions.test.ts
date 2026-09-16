// The published CommonJS entry exports the wallet constructor directly.
const Wallet: typeof import("@neuraiproject/neurai-jswallet").Wallet = require("@neuraiproject/neurai-jswallet");
import { NETWORK_OPTIONS, networkLabel, selectLoginNetwork } from "@/networkOptions";

const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

test("offers modern mainnet first, then old webwallet recovery", () => {
  expect(NETWORK_OPTIONS.map(({ label }) => label)).toEqual([
    "Mainnet Legacy", "Mainnet Old webwallet", "Testnet Legacy", "Testnet PQ",
  ]);
  expect(selectLoginNetwork(null)).toBe("xna");
  expect(selectLoginNetwork("invalid")).toBe("xna");
});

test("keeps existing saved wallets on their original derivation", () => {
  expect(selectLoginNetwork("xna-legacy")).toBe("xna-legacy");
  expect(networkLabel("xna-legacy")).toBe("Mainnet Old webwallet");
  expect(selectLoginNetwork("xna")).toBe("xna");
  expect(networkLabel("xna")).toBe("Mainnet Legacy");
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
