import { parsePubkeyMaybe, parsePubkeyRevealedMaybe } from "../../../src/utils/cryptoUtils";

describe("parsePubkeyMaybe", () => {
  it("accepts compressed pubkeys (66 hex chars)", () => {
    const compressed = "02" + "a".repeat(64);
    expect(parsePubkeyMaybe(compressed)).toBe(compressed);
    expect(parsePubkeyMaybe({ pubkey: compressed })).toBe(compressed);
    expect(parsePubkeyMaybe({ result: { pubkey: compressed } })).toBe(compressed);
  });

  it("accepts uncompressed pubkeys (130 hex chars)", () => {
    const uncompressed = "04" + "b".repeat(128);
    expect(parsePubkeyMaybe(uncompressed)).toBe(uncompressed);
  });

  it("rejects invalid values", () => {
    expect(parsePubkeyMaybe("xyz")).toBeNull();
    expect(parsePubkeyMaybe({ pubkey: "not-hex" })).toBeNull();
    expect(parsePubkeyMaybe(null)).toBeNull();
  });
});

describe("parsePubkeyRevealedMaybe", () => {
  it("parses boolean revealed flags", () => {
    expect(parsePubkeyRevealedMaybe({ revealed: true })).toBe(true);
    expect(parsePubkeyRevealedMaybe({ revealed: false })).toBe(false);
  });

  it("parses numeric revealed flags", () => {
    expect(parsePubkeyRevealedMaybe({ revealed: 1 })).toBe(true);
    expect(parsePubkeyRevealedMaybe({ revealed: 0 })).toBe(false);
  });

  it("returns null when missing", () => {
    expect(parsePubkeyRevealedMaybe({})).toBeNull();
    expect(parsePubkeyRevealedMaybe(null)).toBeNull();
  });
});
