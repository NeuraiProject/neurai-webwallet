import {
  normalizeAssetAmount,
  shortenAddress
} from "@/utils/formatting";

describe("normalizeAssetAmount", () => {
  it("keeps RPC decimal quantities in their documented units", () => {
    expect(normalizeAssetAmount(100000000)).toBe(100000000);
  });

  it("keeps small decimals unchanged", () => {
    expect(normalizeAssetAmount(0.5)).toBe(0.5);
  });

  it("handles invalid inputs", () => {
    expect(normalizeAssetAmount(NaN)).toBe(0);
    expect(normalizeAssetAmount(undefined)).toBe(0);
    expect(normalizeAssetAmount("invalid")).toBe(0);
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
