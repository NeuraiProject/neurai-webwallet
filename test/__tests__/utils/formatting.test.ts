import {
  normalizeAssetAmountMaybe,
  shortenAddress
} from "@/utils/formatting";

describe("normalizeAssetAmountMaybe", () => {
  it("converts large integers from satoshis to decimal", () => {
    expect(normalizeAssetAmountMaybe(100000000)).toBe(1);
  });

  it("keeps small decimals unchanged", () => {
    expect(normalizeAssetAmountMaybe(0.5)).toBe(0.5);
  });

  it("handles invalid inputs", () => {
    expect(normalizeAssetAmountMaybe(NaN)).toBe(0);
    expect(normalizeAssetAmountMaybe(undefined)).toBe(0);
    expect(normalizeAssetAmountMaybe("invalid")).toBe(0);
  });
});

describe("shortenAddress", () => {
  it("shortens long addresses", () => {
    expect(shortenAddress("NXYZabcdefghijklmnop")).toBe("NXYZ...mnop");
  });

  it("keeps short addresses unchanged", () => {
    expect(shortenAddress("NXYZ")).toBe("NXYZ");
  });
});
