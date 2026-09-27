import { invalidAddressMessage, isOldAuthScriptAddress } from "@/utils/addressFormat";

// First PQ address of a test mnemonic as jswallet 0.15 wrote it, and as the
// node writes the same scriptPubKey now.
const OLD_TESTNET = "tnq1pxzcfspt7dtyenk09k7xxk0hmp5pdj0whwdrpsg0ru5uenjz9hlqs86vv45";
const NEW_TESTNET = "tnc1pxzcfspt7dtyenk09k7xxk0hmp5pdj0whwdrpsg0ru5uenjz9hlqs4w4suk";
const OLD_MAINNET = "nq1pxxzhr0q0em4e3j6796mqtnldqhp0jwrt349pfvjd4yvx4x6qqyzsartndt";

describe("isOldAuthScriptAddress", () => {
  it("recognises the old nq1p… / tnq1p… encoding, in either case", () => {
    expect(isOldAuthScriptAddress(OLD_TESTNET)).toBe(true);
    expect(isOldAuthScriptAddress(OLD_MAINNET)).toBe(true);
    expect(isOldAuthScriptAddress(` ${OLD_TESTNET.toUpperCase()} `)).toBe(true);
  });

  it("does not flag the current families", () => {
    for (const address of [
      NEW_TESTNET,
      "tpq1zxu7utdtg4xxghu793rrpxd0whwfns2kaekgadnvk2l63f789a8ysrcg5fq",
      // ECDSA witness v3 shares the nq / tnq prefix, with version r (3).
      "tnq1rpqlhk9qucn28drzp33ugu2unxqf7y7qq887ll2q644739m49ph0sluj0re",
      "tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3",
      "tnq1p",
      "",
    ]) {
      expect(isOldAuthScriptAddress(address)).toBe(false);
    }
  });
});

describe("invalidAddressMessage", () => {
  it("explains the old post-quantum format without rewriting the address", () => {
    const message = invalidAddressMessage(OLD_TESTNET);
    expect(message).toMatch(/old-format post-quantum address/);
    expect(message).toMatch(/tnc1p/);
    expect(message).not.toContain(NEW_TESTNET);
  });

  it("keeps the generic message for anything else", () => {
    expect(invalidAddressMessage("nonsense")).toBe("nonsense does not seem to be a valid address");
  });
});
