import { assetEligibility, isEligible, type EligibilityContext } from "@/depin/eligibility";

// The product rule: the chat is for DePIN tokens and nothing else. Before this
// existed, any asset with a positive balance appeared in the chat picker, so a
// user could select a token that could never send a message.

const READY: EligibilityContext = {
  chain: "xna-test",
  poolRoot: "&DEPINTESTING",
  pubkeyRevealed: true,
};

const VALID = { has_asset: true, amount: 5, valid: 1, blocked: false };

const decide = (
  name: string,
  amount = 5,
  context: Partial<EligibilityContext> = {},
  validity: Parameters<typeof assetEligibility>[3] = VALID,
) => assetEligibility(name, amount, { ...READY, ...context }, validity);

describe("assetEligibility", () => {
  it("accepts the pool's own root token", () => {
    const decision = decide("&DEPINTESTING");
    expect(isEligible(decision)).toBe(true);
    expect(decision.message).toBe("");
  });

  it("accepts a sub-token inside the pool scope", () => {
    expect(isEligible(decide("&DEPINTESTING/SENSORS"))).toBe(true);
  });

  it("rejects a DePIN token from another tree", () => {
    // Component-wise: a prefix match is not membership.
    const decision = decide("&DEPINTESTINGX");
    expect(decision.reason).toBe("outside-pool-scope");
    expect(decision.selectable).toBe(false);
  });

  it("rejects `&TEST` against a `&TESTING` pool", () => {
    expect(decide("&TEST", 5, { poolRoot: "&TESTING" }).reason).toBe("outside-pool-scope");
  });

  it("rejects a plain asset and a qualifier", () => {
    expect(decide("MYTOKEN").reason).toBe("not-depin-token");
    expect(decide("#VERIFIED").reason).toBe("not-depin-token");
  });

  it("rejects a malformed DePIN name before it can become an RPC argument", () => {
    expect(decide("&").reason).toBe("invalid-depin-token");
    expect(decide("&lowercase").reason).toBe("invalid-depin-token");
  });

  it("rejects a zero balance", () => {
    expect(decide("&DEPINTESTING", 0).reason).toBe("no-balance");
  });

  it("rejects a blocked holder even though the token is right", () => {
    const decision = decide("&DEPINTESTING", 5, {}, { ...VALID, blocked: true });
    expect(decision.reason).toBe("blocked-holder");
    expect(decision.message).toMatch(/blocked/i);
  });

  it("rejects a revoked holding", () => {
    expect(decide("&DEPINTESTING", 5, {}, { has_asset: true, valid: 0 }).reason).toBe(
      "invalid-holder",
    );
    expect(decide("&DEPINTESTING", 5, {}, { has_asset: false, valid: 1 }).reason).toBe(
      "invalid-holder",
    );
  });

  it("waits rather than guessing while the pool is unverified", () => {
    // Scope cannot be judged without the verified root, and guessing would mean
    // trusting an unauthenticated answer for exactly the decision that matters.
    expect(decide("&DEPINTESTING", 5, { poolRoot: null }).reason).toBe("pool-not-ready");
    expect(decide("&DEPINTESTING", 5, {}, null).reason).toBe("pool-not-ready");
  });

  it("explains an address whose public key the chain has never seen", () => {
    const decision = decide("&DEPINTESTING", 5, { pubkeyRevealed: false });
    expect(decision.reason).toBe("pubkey-unrevealed");
    expect(decision.message).toMatch(/never sent a transaction/i);
  });

  it("refuses everything on a chain without DePIN, before any other check", () => {
    // Cheapest check first, and the one that must never be bypassed: on mainnet
    // there is no eligible token at all.
    for (const chain of ["xna", "xna-legacy", "xna-pq"]) {
      expect(decide("&DEPINTESTING", 5, { chain }).reason).toBe("chat-unavailable-here");
    }
  });

  it("always carries a reason the UI can show", () => {
    const refusals = [
      decide("MYTOKEN"),
      decide("&DEPINTESTING", 0),
      decide("&OTHER"),
      decide("&DEPINTESTING", 5, { pubkeyRevealed: false }),
    ];
    for (const decision of refusals) {
      expect(decision.selectable).toBe(false);
      expect(decision.message.length).toBeGreaterThan(0);
    }
  });
});
