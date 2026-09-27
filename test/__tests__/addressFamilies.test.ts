/**
 * What each wallet network derives.
 *
 * jswallet 0.16 moved to neurai-key 5, which reuses some network names for
 * other address types. jswallet keeps its own names and derivations, so a seed
 * restored after the upgrade must land on the same addresses; if it did not,
 * the wallet would scan other addresses and show a zero balance with no error.
 *
 * The "before" vectors were produced with jswallet 0.15.3 / neurai-key 4.0.1.
 */

// The published CommonJS entry exposes `createInstance` on the module object.
const NeuraiWallet: typeof import("@neuraiproject/neurai-jswallet") = require("@neuraiproject/neurai-jswallet");
import { decodeAddress } from "@neuraiproject/neurai-create-transaction";
import { isOldAuthScriptAddress } from "@/utils/addressFormat";

const MNEMONIC = "salad hammer want used web finger comic gold trigger accident oblige pluck";

async function firstAddress(network: string) {
  const wallet = await NeuraiWallet.createInstance({
    mnemonic: MNEMONIC,
    network: network as import("@neuraiproject/neurai-jswallet").ChainType,
    offlineMode: true,
  });
  return wallet.getAddressObjects()[0];
}

/** Bech32m data between the version character and the checksum: the program. */
function programChars(address: string): string {
  return address.slice(address.lastIndexOf("1") + 2, -6);
}

describe("Legacy networks keep their 0.15 addresses", () => {
  it.each([
    ["xna", "NZCg1vAEJ9Cjsbqbo97eFquRo4spLXpLax", "m/44'/1900'/0'/0/0"],
    ["xna-legacy", "NaX4FgLSbydqJBqqCD4gxQehpjPkQWxdgV", "m/44'/0'/0'/0/0"],
    ["xna-test", "tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3", "m/44'/1'/0'/0/0"],
    ["xna-legacy-test", "tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3", "m/44'/1'/0'/0/0"],
  ])("%s", async (network, address, path) => {
    const derived = await firstAddress(network);
    expect(derived.address).toBe(address);
    expect(derived.path).toBe(path);
    expect(decodeAddress(derived.address).type).toBe("p2pkh");
  });
});

describe("PQ AuthScript networks keep their scriptPubKey under the new prefix", () => {
  it.each([
    [
      "xna-pq",
      "nq1pxxzhr0q0em4e3j6796mqtnldqhp0jwrt349pfvjd4yvx4x6qqyzsartndt",
      "nc1pxxzhr0q0em4e3j6796mqtnldqhp0jwrt349pfvjd4yvx4x6qqyzs0hj0yf",
    ],
    [
      "xna-pq-test",
      "tnq1pxzcfspt7dtyenk09k7xxk0hmp5pdj0whwdrpsg0ru5uenjz9hlqs86vv45",
      "tnc1pxzcfspt7dtyenk09k7xxk0hmp5pdj0whwdrpsg0ru5uenjz9hlqs4w4suk",
    ],
  ])("%s", async (network, before, after) => {
    const derived = await firstAddress(network);
    expect(derived.address).toBe(after);

    expect(decodeAddress(derived.address)).toMatchObject({ type: "authscript", witnessVersion: 1 });
    // Same witness version and the same program characters: only the prefix
    // and therefore the checksum changed, so funds sent to the old string sit
    // on exactly this scriptPubKey.
    expect(programChars(after)).toBe(programChars(before));

    // The old string is what the node now rejects.
    expect(isOldAuthScriptAddress(before)).toBe(true);
    expect(() => decodeAddress(before)).toThrow();
  });
});

describe("strict families", () => {
  it("xna-pq-strict-test derives strict PQ witness v2 on the PQ tree", async () => {
    const derived = await firstAddress("xna-pq-strict-test");
    expect(derived.address).toBe("tpq1zxu7utdtg4xxghu793rrpxd0whwfns2kaekgadnvk2l63f789a8ysrcg5fq");
    expect(derived.path).toBe("m_pq/100'/1'/0'/0'/0'");
    expect(derived.keyType).toBe("pq");
    expect(decodeAddress(derived.address)).toMatchObject({ type: "pq", witnessVersion: 2 });
  });

  it("xna-ecdsa-test derives strict ECDSA witness v3 under m/84'", async () => {
    const derived = await firstAddress("xna-ecdsa-test");
    expect(derived.address).toBe("tnq1rpqlhk9qucn28drzp33ugu2unxqf7y7qq887ll2q644739m49ph0sluj0re");
    expect(derived.path).toBe("m/84'/1'/0'/0/0");
    expect(derived.keyType).toBe("ecdsa");
    expect(decodeAddress(derived.address)).toMatchObject({ type: "ecdsa", witnessVersion: 3 });
  });
});
