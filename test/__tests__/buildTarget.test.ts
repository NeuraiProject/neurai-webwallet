import { isNetworkEnabled, isNetworkSelectable } from "@/buildTarget";

// Two different questions, deliberately kept apart: which networks a build is
// FOR, and which ones actually work. The strict witness families are derivable
// on mainnet and post-quantum mainnet was offered in the picker, but they are
// not enabled — choosing one handed someone a wallet that could not do anything.
describe("isNetworkEnabled", () => {
  it("refuses the strict witness families on mainnet", () => {
    for (const chain of ["xna-pq-strict", "xna-ecdsa"]) {
      expect(isNetworkEnabled(chain)).toBe(false);
    }
  });

  it("allows the strict witness families on testnet, which is where they are being tried", () => {
    for (const chain of ["xna-pq-strict-test", "xna-ecdsa-test"]) {
      expect(isNetworkEnabled(chain)).toBe(true);
    }
  });

  it("refuses PQ AuthScript on every chain: it is for contracts, not coin wallets", () => {
    for (const chain of ["xna-pq", "xna-pq-test"]) {
      expect(isNetworkEnabled(chain)).toBe(false);
    }
  });

  it("allows the legacy chains", () => {
    for (const chain of ["xna", "xna-test", "xna-legacy", "xna-legacy-test"]) {
      expect(isNetworkEnabled(chain)).toBe(true);
    }
  });
});

describe("isNetworkSelectable", () => {
  it("keeps the mainnet witness families and PQ AuthScript out of the picker", () => {
    expect(isNetworkSelectable("xna-pq")).toBe(false);
    expect(isNetworkSelectable("xna-pq-test")).toBe(false);
    expect(isNetworkSelectable("xna-pq-strict")).toBe(false);
    expect(isNetworkSelectable("xna-ecdsa")).toBe(false);
  });

  it("lets the enabled ones through", () => {
    expect(isNetworkSelectable("xna-legacy")).toBe(true);
    expect(isNetworkSelectable("xna-legacy-test")).toBe(true);
  });
});
