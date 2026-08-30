import { subtitleFor } from "@/home/assetSubtitle";

// The line under an asset name. An owner token is the one that lets you
// administer the asset, so that is what it must say — before, and instead of,
// whatever kind of asset it belongs to.
describe("subtitleFor", () => {
  it("calls an owner token what it is, and names what it governs", () => {
    expect(subtitleFor("FORNT78!")).toBe("Asset Master · FORNT78");
  });

  it("wins over the asset kind: a DePIN owner token is still a master", () => {
    // `&TRAIN!` used to read "DePIN token", which is the one thing it is not:
    // it is the key to &TRAIN, not a holding of it.
    expect(subtitleFor("&TRAIN!")).toBe("Asset Master · &TRAIN");
  });

  it("wins over IPFS metadata too", () => {
    expect(subtitleFor("FORNT78!", { has_ipfs: 1, ipfs_hash: "QmZ4abcd1234" })).toBe("Asset Master · FORNT78");
  });

  it("names the other kinds", () => {
    expect(subtitleFor("&TRAIN")).toBe("DePIN token");
    expect(subtitleFor("#VERIFIED")).toBe("Qualifier");
    expect(subtitleFor("PLAIN")).toBe("Asset");
  });

  it("names the parent of a sub-asset", () => {
    expect(subtitleFor("SENSOR/BATCH01")).toBe("Sub-asset of SENSOR");
  });

  it("shows IPFS when there is some and it is not an owner token", () => {
    expect(subtitleFor("PLAIN", { has_ipfs: 1, ipfs_hash: "QmZ4abcd1234" })).toBe("IPFS · QmZ4ab…1234");
  });
});
