import { chatAvailability, depinNetworkFor, isChatAvailable } from "@/depin/network";

// The table is the product policy. These tests are what makes "when mainnet
// gets DePIN, change one entry" true rather than aspirational.
describe("chat availability by chain", () => {
  it("offers the chat on both testnet derivations", () => {
    for (const chain of ["xna-test", "xna-legacy-test"]) {
      expect(chatAvailability(chain)).toEqual({ available: true, network: "test" });
    }
  });

  it("refuses mainnet because DePIN is not there yet, not because of the node", () => {
    for (const chain of ["xna", "xna-legacy"]) {
      const availability = chatAvailability(chain);
      expect(availability.available).toBe(false);
      if (availability.available) throw new Error("unreachable");
      expect(availability.reason).toBe("no-depin-on-chain");
      expect(availability.message).toMatch(/mainnet/i);
    }
  });

  it("refuses PQ chains for a different reason: no BIP44 path", () => {
    for (const chain of ["xna-pq", "xna-pq-test"]) {
      const availability = chatAvailability(chain);
      expect(availability.available).toBe(false);
      if (availability.available) throw new Error("unreachable");
      expect(availability.reason).toBe("no-bip44-derivation");
    }
  });

  it("refuses an unknown chain instead of guessing", () => {
    // A chain nobody considered must not inherit "available" from a prefix
    // match. Refusing is visible; guessing would not be.
    const availability = chatAvailability("xna-future-test");
    expect(availability.available).toBe(false);
    expect(isChatAvailable("xna-future-test")).toBe(false);
  });
});

describe("depinNetworkFor", () => {
  it("maps the supported chains to the library's names", () => {
    expect(depinNetworkFor("xna-test")).toBe("test");
    expect(depinNetworkFor("xna-legacy-test")).toBe("test");
  });

  it("throws where the chat is not offered", () => {
    // Reaching this is a bug: every protocol-2 call is gated on availability
    // first. Returning a plausible network would derive addresses for a chain
    // the user is not on.
    expect(() => depinNetworkFor("xna")).toThrow(/mainnet/i);
    expect(() => depinNetworkFor("xna-pq")).toThrow(/post-quantum/i);
    expect(() => depinNetworkFor("nonsense")).toThrow();
  });
});
