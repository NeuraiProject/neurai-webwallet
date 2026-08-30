import { isNetworkEnabled, isNetworkSelectable } from "@/buildTarget";

// Two different questions, deliberately kept apart: which networks a build is
// FOR, and which ones actually work. Post-quantum mainnet is derivable and was
// offered in the picker, but it is not enabled — choosing it handed someone a
// wallet that could not do anything.
describe("isNetworkEnabled", () => {
  it("refuses post-quantum mainnet", () => {
    expect(isNetworkEnabled("xna-pq")).toBe(false);
  });

  it("allows post-quantum testnet, which is where it is being tried", () => {
    expect(isNetworkEnabled("xna-pq-test")).toBe(true);
  });

  it("allows the legacy chains", () => {
    for (const chain of ["xna", "xna-test", "xna-legacy", "xna-legacy-test"]) {
      expect(isNetworkEnabled(chain)).toBe(true);
    }
  });
});

describe("isNetworkSelectable", () => {
  it("keeps post-quantum mainnet out of the picker", () => {
    expect(isNetworkSelectable("xna-pq")).toBe(false);
  });

  it("lets the enabled ones through", () => {
    expect(isNetworkSelectable("xna-legacy")).toBe(true);
    expect(isNetworkSelectable("xna-legacy-test")).toBe(true);
  });
});
