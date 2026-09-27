import { deriveDepinChatIdentity, isDepinChatSupportedNetwork } from "@/utils/depinChatIdentity";
import { legacyKeyNetworkFor } from "@/utils/keyNetwork";

/**
 * The chat identity is the P2PKH address at BIP44 account 100. Its key is what
 * the pool encrypts messages to, so it must survive library upgrades: a new
 * identity would lose every conversation and every token parked on the old one.
 *
 * neurai-key 5 reads `xna` / `xna-test` as ECDSA witness v3 and `xna-legacy` as
 * coin type 1900. Passing the wallet network through unchanged would turn the
 * testnet identity into a `tnq1r…` address, which DePIN does not serve.
 *
 * Vectors produced with neurai-key 4.0.1, the version the wallet used before.
 */
const MNEMONIC = "salad hammer want used web finger comic gold trigger accident oblige pluck";

const MAINNET_1900 = {
  address: "Ne3xwuBfNgry4rUhXoHvb4yY7xijcC5NSj",
  publicKey: "03000e6d3b7285b5449a33a5ae19082d54d7646f10fdbe46c32cc7d1c2c9292229",
  wif: "KwhX6ZymzqtWsJvtiyUWdHZSiqPWwfLnx5Jk1Gv2LgVqPbZgt6mn",
  path: "m/44'/1900'/100'/0/0",
  coinType: 1900,
};
const MAINNET_0 = {
  address: "NRo2jpLEwSZATcq9quXGVuVmk3rUPNpBfs",
  publicKey: "02863653bd6930658259d6ec917fe68926e633cc006a4da50553edf74ea9826f2c",
  wif: "L4wH69bFa9zUzAbn8qRFQBaip7fehLofnkKcrVj5ScsbDTYEfEME",
  path: "m/44'/0'/100'/0/0",
  coinType: 0,
};
const TESTNET = {
  address: "t7CU1GKcLNWejeJUSN4KuxXgHz9qHy9hgd",
  publicKey: "0245eb630c00827e31d7ae36c8471226cae50bc8616bff488044d8008bde3dd1af",
  wif: "cNK9gYy4mduEqHVJBExVxJBmd37NaVXCLyJnkPBYjLsWahsoNzyw",
  path: "m/44'/1'/100'/0/0",
  coinType: 1,
};

describe("deriveDepinChatIdentity", () => {
  it.each([
    ["xna", MAINNET_1900],
    ["xna-legacy", MAINNET_0],
    ["xna-test", TESTNET],
    ["xna-legacy-test", TESTNET],
  ] as const)("keeps the %s identity it had before neurai-key 5", (network, expected) => {
    expect(deriveDepinChatIdentity({ network, mnemonic: MNEMONIC })).toEqual({
      ...expected,
      account: 100,
      index: 0,
    });
  });

  it.each([
    ["xna-ecdsa", MAINNET_1900],
    ["xna-ecdsa-test", TESTNET],
  ] as const)("gives an %s wallet the same P2PKH identity as its Legacy wallet", (network, expected) => {
    expect(deriveDepinChatIdentity({ network, mnemonic: MNEMONIC })).toMatchObject(expected);
  });
});

describe("isDepinChatSupportedNetwork", () => {
  it("accepts every network with a secp256k1 tree", () => {
    for (const network of ["xna", "xna-test", "xna-legacy", "xna-legacy-test", "xna-ecdsa", "xna-ecdsa-test"]) {
      expect(isDepinChatSupportedNetwork(network)).toBe(true);
    }
  });

  it("refuses the PQ networks and unknown names", () => {
    for (const network of ["xna-pq", "xna-pq-test", "xna-pq-strict", "xna-pq-strict-test", "xna-future-test"]) {
      expect(isDepinChatSupportedNetwork(network)).toBe(false);
      expect(legacyKeyNetworkFor(network)).toBeNull();
    }
  });
});
