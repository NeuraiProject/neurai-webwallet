import {
  getAssetType,
  getAssetTypeLabel,
  isValidMessagingAsset
} from "../../../src/utils/assetUtils";

describe("getAssetType", () => {
  it("identifies DePIN assets", () => {
    expect(getAssetType("&TESTDEPIN")).toBe("depin");
  });

  it("identifies qualifier assets", () => {
    expect(getAssetType("#VERIFIED")).toBe("qualifier");
  });

  it("identifies normal assets", () => {
    expect(getAssetType("MY_TOKEN")).toBe("normal");
  });
});

describe("getAssetTypeLabel", () => {
  it("returns a readable label", () => {
    expect(getAssetTypeLabel("&TESTDEPIN")).toBe("DePIN");
    expect(getAssetTypeLabel("#VERIFIED")).toBe("Qualifier");
    expect(getAssetTypeLabel("MY_TOKEN")).toBe("Asset");
  });
});

describe("isValidMessagingAsset", () => {
  it("returns true for assets with balance", () => {
    expect(isValidMessagingAsset("&TESTDEPIN", { "&TESTDEPIN": 1.5 })).toBe(true);
  });

  it("returns false for assets with zero balance", () => {
    expect(isValidMessagingAsset("&TESTDEPIN", { "&TESTDEPIN": 0 })).toBe(false);
  });

  it("returns false for missing assets", () => {
    expect(isValidMessagingAsset("&TESTDEPIN", {})).toBe(false);
  });
});
