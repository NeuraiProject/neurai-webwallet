/**
 * @jest-environment jsdom
 */

// Pinning the DePIN pool key.
//
// The key that verifies a `poolsig` travels inside the very body being
// verified, so verification alone proves self-consistency, not identity. What
// is pinned here is the behaviour that makes it mean something: remember the
// key seen first, and refuse a later change instead of adopting it.
//
// What this deliberately does NOT claim: that the first contact is safe.

import {
  DepinPoolPinMismatchError,
  fingerprint,
  forgetPin,
  getVerifiedPool,
  loadPin,
} from "@/depin/poolTrust";

const getDepinPoolInfo = jest.fn();
jest.mock("@neuraiproject/neurai-depin-msg", () => ({
  __esModule: true,
  getDepinPoolInfo: (...args: unknown[]) => getDepinPoolInfo(...args),
  poolKeyFingerprint: (key: string) => `fp(${String(key).slice(0, 6)})`,
}));

const URL_A = "https://rpc-testnet.neurai.org/rpc";
const KEY_A = "02" + "a".repeat(64);
const KEY_B = "03" + "b".repeat(64);

const answerWith = (poolPublicKey: string) => ({
  info: { token: "&DEPINTESTING", maxrecipients: 20, protocol: 2, depinpoolpkey: poolPublicKey },
  pin: { serviceId: "", poolRoot: "&DEPINTESTING", poolPublicKey },
  trust: "tofu",
  fingerprint: poolPublicKey,
});

const rpc = jest.fn();
const connect = () => getVerifiedPool({ rpc, chain: "xna-test", url: URL_A, network: "test" });

beforeEach(() => {
  localStorage.clear();
  getDepinPoolInfo.mockReset();
});

describe("first contact", () => {
  it("pins the key it saw and says it was the first time", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));

    const pool = await connect();

    expect(pool.firstContact).toBe(true);
    expect(pool.info.depinpoolpkey).toBe(KEY_A);
    // Option A: pinned without asking. The fingerprint is surfaced for the UI
    // to show, not for a dialog to gate on.
    expect(pool.fingerprint).toBe("fp(02aaaa)");
    expect(getDepinPoolInfo.mock.calls[0][0].trust).toEqual({ mode: "tofu" });
  });

  it("uses the stored pin on later contacts instead of trusting again", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    await connect();
    getDepinPoolInfo.mockClear();
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));

    const pool = await connect();

    expect(pool.firstContact).toBe(false);
    expect(getDepinPoolInfo.mock.calls[0][0].trust.mode).toBe("pinned");
  });
});

describe("key rotation", () => {
  it("REFUSES a changed key instead of adopting it", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    await connect();
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_B));

    await expect(connect()).rejects.toBeInstanceOf(DepinPoolPinMismatchError);
  });

  it("carries both fingerprints so they can be compared", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    await connect();
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_B));

    await expect(connect()).rejects.toMatchObject({
      expectedFingerprint: "fp(02aaaa)",
      seenFingerprint: "fp(03bbbb)",
    });
  });

  it("keeps the old pin: a rotation must not overwrite what we trusted", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    const { serviceId } = await connect();
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_B));
    await expect(connect()).rejects.toThrow();

    expect(loadPin(serviceId)?.poolPublicKey).toBe(KEY_A);
  });

  it("only an explicit forget lets a new key be trusted", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    const { serviceId } = await connect();
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_B));
    await expect(connect()).rejects.toThrow();

    forgetPin(serviceId);
    const pool = await connect();

    expect(pool.firstContact).toBe(true);
    expect(pool.info.depinpoolpkey).toBe(KEY_B);
  });

  it("translates the library's own pinned rejection", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    await connect();
    getDepinPoolInfo.mockRejectedValue(new Error("poolsig does not verify against the pinned pool key"));

    await expect(connect()).rejects.toBeInstanceOf(DepinPoolPinMismatchError);
  });

  it("does not swallow an unrelated failure as a mismatch", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    await connect();
    getDepinPoolInfo.mockRejectedValue(new Error("Pool announces protocol 1"));

    await expect(connect()).rejects.toThrow(/protocol 1/);
  });
});

describe("stored pins", () => {
  it("never crosses networks", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    await connect();
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_B));

    // Same URL, other chain: a different service, so no mismatch and a new pin.
    const other = await getVerifiedPool({ rpc, chain: "xna-legacy-test", url: URL_A, network: "test" });
    expect(other.firstContact).toBe(true);
  });

  it("stores only the pin fields, never credentials", async () => {
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));
    await getVerifiedPool({
      rpc,
      chain: "xna-test",
      url: "https://user:secret@rpc-testnet.neurai.org/rpc",
      network: "test",
    });

    const raw = localStorage.getItem("depin_pool_pins") ?? "";
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("user");
    expect(JSON.parse(raw).version).toBe(1);
  });

  it("treats a malformed store as no pin rather than misreading it", async () => {
    localStorage.setItem("depin_pool_pins", "{ not json");
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));

    const pool = await connect();

    expect(pool.firstContact).toBe(true);
  });

  it("ignores a record written by a future version", async () => {
    localStorage.setItem("depin_pool_pins", JSON.stringify({ version: 99, pins: { x: {} } }));
    getDepinPoolInfo.mockResolvedValue(answerWith(KEY_A));

    await expect(connect()).resolves.toMatchObject({ firstContact: true });
  });
});

describe("fingerprint", () => {
  it("uses the library digest so it matches other clients", () => {
    expect(fingerprint(KEY_A)).toBe("fp(02aaaa)");
  });

  it("still shows something for a key it cannot digest", () => {
    expect(fingerprint("")).toBe("");
  });
});
