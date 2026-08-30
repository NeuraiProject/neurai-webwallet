import {
  getAssetType,
  getAssetTypeLabel,
} from "@/utils/assetUtils";

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
