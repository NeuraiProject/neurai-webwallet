/**
 * @jest-environment jsdom
 */

// The protocol-2 client's own responsibilities: ordering, challenge lifetime,
// cursor progress and refusing to send to an unknown group. The cryptography
// belongs to the library and is covered by its regtest e2e; what is pinned here
// is how this app drives it.

import { createDepinClient, DepinPoolProtocolError, readableMessages } from "@/depin/client";

const getDepinPoolInfo = jest.fn();
const createSoftwareIdentity = jest.fn();
const requestDepinChallenge = jest.fn();
const receiveDepinMessages = jest.fn();
const buildDepinMessageForPool = jest.fn();
const submitDepinMessage = jest.fn();
const clearDepinMessages = jest.fn();

jest.mock("@neuraiproject/neurai-depin-msg", () => ({
  __esModule: true,
  getDepinPoolInfo: (...a: unknown[]) => getDepinPoolInfo(...a),
  poolKeyFingerprint: (k: string) => `fp(${String(k).slice(0, 6)})`,
  createSoftwareIdentity: (...a: unknown[]) => createSoftwareIdentity(...a),
  requestDepinChallenge: (...a: unknown[]) => requestDepinChallenge(...a),
  receiveDepinMessages: (...a: unknown[]) => receiveDepinMessages(...a),
  buildDepinMessageForPool: (...a: unknown[]) => buildDepinMessageForPool(...a),
  submitDepinMessage: (...a: unknown[]) => submitDepinMessage(...a),
  clearDepinMessages: (...a: unknown[]) => clearDepinMessages(...a),
}));

const POOL_KEY = "02" + "a".repeat(64);
const TOKEN = "&DEPINTESTING";
const IDENTITY = { address: "tHOLDER", publicKey: "02" + "b".repeat(64) };

const makeClient = () =>
  createDepinClient({
    rpc: jest.fn(),
    chain: "xna-test",
    url: "https://rpc-testnet.neurai.org/rpc",
    wif: "cWIFPLACEHOLDER",
  });

const entry = (hash: string, over: Record<string, unknown> = {}) => ({
  ok: true,
  hash,
  plaintext: "hola",
  message: { sender: "tSENDER", timestamp: 1_700_000_000, messageType: "group" },
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  for (const m of [
    getDepinPoolInfo,
    createSoftwareIdentity,
    requestDepinChallenge,
    receiveDepinMessages,
    buildDepinMessageForPool,
    submitDepinMessage,
    clearDepinMessages,
  ]) {
    m.mockReset();
  }
  createSoftwareIdentity.mockResolvedValue(IDENTITY);
  getDepinPoolInfo.mockResolvedValue({
    info: { token: TOKEN, maxrecipients: 20, protocol: 2, depinpoolpkey: POOL_KEY },
    pin: { serviceId: "", poolRoot: TOKEN, poolPublicKey: POOL_KEY },
    trust: "tofu",
    fingerprint: POOL_KEY,
  });
  requestDepinChallenge.mockResolvedValue({ challenge: "c".repeat(64), expiresIn: 30 });
});

describe("receiving", () => {
  it("chains the challenge the reply hands back instead of asking again", async () => {
    receiveDepinMessages
      .mockResolvedValueOnce({
        messages: [entry("a".repeat(64))],
        hasMore: true,
        nextChallenge: "d".repeat(64),
        nextExpiresIn: 300,
      })
      .mockResolvedValueOnce({ messages: [entry("b".repeat(64))], hasMore: false });

    const page = await makeClient().receiveAll({ token: TOKEN, limit: 10 });

    expect(page.readable).toHaveLength(2);
    // Two pages, one `depinchallenge`: the chain did its job.
    expect(requestDepinChallenge).toHaveBeenCalledTimes(1);
    expect(receiveDepinMessages.mock.calls[1][0].challenge).toBe("d".repeat(64));
  });

  it("advances the cursor with the last entry returned, not the last shown", async () => {
    // A page of traffic for other holders is verified but unreadable. If the
    // cursor only followed what is displayed, it would be re-fetched forever.
    receiveDepinMessages
      .mockResolvedValueOnce({
        messages: [entry("a".repeat(64), { plaintext: null }), entry("e".repeat(64), { plaintext: null })],
        hasMore: true,
        nextChallenge: "d".repeat(64),
      })
      .mockResolvedValueOnce({ messages: [entry("b".repeat(64))], hasMore: false });

    const page = await makeClient().receiveAll({ token: TOKEN });

    expect(receiveDepinMessages.mock.calls[1][0].afterHash).toBe("e".repeat(64));
    expect(page.readable).toHaveLength(1);
  });

  it("stops when the pool claims more but sends nothing to continue with", async () => {
    receiveDepinMessages.mockResolvedValue({ messages: [], hasMore: true, nextChallenge: "d".repeat(64) });

    await expect(makeClient().receiveAll({ token: TOKEN })).rejects.toBeInstanceOf(DepinPoolProtocolError);
  });

  it("stops when the pool repeats the same page", async () => {
    receiveDepinMessages.mockResolvedValue({
      messages: [entry("a".repeat(64))],
      hasMore: true,
      nextChallenge: "d".repeat(64),
    });

    // Without this guard `has_more` alone would spin until the page cap.
    await expect(makeClient().receiveAll({ token: TOKEN })).rejects.toThrow(/repeating/i);
  });

  it("asks for a new challenge when the chained one expired", async () => {
    receiveDepinMessages
      .mockResolvedValueOnce({
        messages: [entry("a".repeat(64))],
        hasMore: false,
        nextChallenge: "d".repeat(64),
        nextExpiresIn: 0, // already expired by the time it arrives
      })
      .mockResolvedValueOnce({ messages: [], hasMore: false });

    const client = makeClient();
    await client.receiveAll({ token: TOKEN });
    await client.receiveAll({ token: TOKEN });

    expect(requestDepinChallenge).toHaveBeenCalledTimes(2);
  });

  it("never carries a nonce through a failure", async () => {
    // The node may have spent it before failing for another reason. Reusing it
    // would fail identically every time and stall the channel for good.
    receiveDepinMessages
      .mockRejectedValueOnce(new Error("Rate limited"))
      .mockResolvedValueOnce({ messages: [], hasMore: false });

    const client = makeClient();
    await expect(client.receiveAll({ token: TOKEN })).rejects.toThrow(/Rate limited/);
    await client.receiveAll({ token: TOKEN });

    expect(requestDepinChallenge).toHaveBeenCalledTimes(2);
  });
});

describe("ordering", () => {
  it("serialises operations so two reads cannot spend the same nonce", async () => {
    const order: string[] = [];
    let release: (() => void) | null = null;
    receiveDepinMessages
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            order.push("first:start");
            release = () => {
              order.push("first:end");
              resolve({ messages: [], hasMore: false });
            };
          }),
      )
      .mockImplementationOnce(async () => {
        order.push("second:start");
        return { messages: [], hasMore: false };
      });

    const client = makeClient();
    const first = client.receiveAll({ token: TOKEN });
    const second = client.receiveAll({ token: TOKEN });

    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["first:start"]);
    release!();
    await Promise.all([first, second]);

    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("keeps serving after an operation fails", async () => {
    receiveDepinMessages
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ messages: [], hasMore: false });

    const client = makeClient();
    const failed = client.receiveAll({ token: TOKEN });
    const next = client.receiveAll({ token: TOKEN });

    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toMatchObject({ readable: [] });
  });

  it("discards work queued before a reset", async () => {
    let release: (() => void) | null = null;
    receiveDepinMessages.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ messages: [], hasMore: false }); }),
    );

    const client = makeClient();
    const inFlight = client.receiveAll({ token: TOKEN });
    const queued = client.receiveAll({ token: TOKEN });
    await new Promise((r) => setTimeout(r, 0));
    client.reset();
    release!();

    await inFlight;
    // The queued one belonged to the previous configuration: a late reply from
    // it must not land in the new one.
    await expect(queued).rejects.toBeInstanceOf(DepinPoolProtocolError);
  });
});

describe("sending", () => {
  const complete = { noPubKeyComplete: true, restrictedComplete: true };

  it("builds through the pool so key-to-address binding is enforced", async () => {
    buildDepinMessageForPool.mockResolvedValue({
      hex: "aabb",
      messageHash: "h",
      recipientCount: 3,
      resolution: { skipped: complete },
    });
    submitDepinMessage.mockResolvedValue({ messageHash: "from-pool" });

    const result = await makeClient().send({ token: TOKEN, message: "hola", timestamp: 1 });

    const args = buildDepinMessageForPool.mock.calls[0][0];
    expect(args.poolRoot).toBe(TOKEN);
    expect(args.maxRecipients).toBe(20);
    // No recipient list is passed in: the library resolves and validates it.
    expect(args.recipientPubKeys).toBeUndefined();
    expect(result).toEqual({ messageHash: "from-pool", recipientCount: 3 });
  });

  it("REFUSES to send when holders were skipped without an exact count", async () => {
    buildDepinMessageForPool.mockResolvedValue({
      hex: "aabb",
      messageHash: "h",
      resolution: { skipped: { ...complete, noPubKeyComplete: false } },
    });

    await expect(makeClient().send({ token: TOKEN, message: "x", timestamp: 1 })).rejects.toThrow(
      /account for every holder/i,
    );
    expect(submitDepinMessage).not.toHaveBeenCalled();
  });

  it("treats a missing completeness flag as incomplete, not as permission", async () => {
    // An absence of information is not a smaller group, it is an unknown one.
    buildDepinMessageForPool.mockResolvedValue({
      hex: "aabb",
      messageHash: "h",
      resolution: { skipped: { noPubKeyComplete: null, restrictedComplete: null } },
    });

    await expect(makeClient().send({ token: TOKEN, message: "x", timestamp: 1 })).rejects.toThrow();
    expect(submitDepinMessage).not.toHaveBeenCalled();
  });

  it("sends normally when every holder is accounted for, skipped ones included", async () => {
    // Holders who never revealed a key can never receive anything; that is not
    // a reason to block the group.
    buildDepinMessageForPool.mockResolvedValue({
      hex: "aabb",
      messageHash: "h",
      recipientCount: 2,
      resolution: { skipped: { ...complete, noPubKey: 3 } },
    });
    submitDepinMessage.mockResolvedValue("hash-string");

    await expect(makeClient().send({ token: TOKEN, message: "x", timestamp: 1 })).resolves.toMatchObject({
      recipientCount: 2,
    });
  });
});

describe("clearing", () => {
  it("asks for its own admin challenge and never reuses a receive nonce", async () => {
    receiveDepinMessages.mockResolvedValue({
      messages: [],
      hasMore: false,
      nextChallenge: "d".repeat(64),
      nextExpiresIn: 300,
    });
    requestDepinChallenge
      .mockResolvedValueOnce({ challenge: "c".repeat(64), expiresIn: 30 })
      .mockResolvedValueOnce({ challenge: "f".repeat(64), expiresIn: 30 });
    clearDepinMessages.mockResolvedValue({ removed: 2 });

    const client = makeClient();
    await client.receiveAll({ token: TOKEN });
    await client.clear({ mode: "all" });

    expect(requestDepinChallenge.mock.calls[1][0].type).toBe("admin");
    expect(clearDepinMessages.mock.calls[0][0].challenge).toBe("f".repeat(64));
    expect(clearDepinMessages.mock.calls[0][0].poolRoot).toBe(TOKEN);
  });
});

describe("readableMessages", () => {
  it("keeps only what is authentic and readable", () => {
    expect(readableMessages([entry("a".repeat(64))])).toHaveLength(1);
  });

  it("drops an entry whose sender did not verify, readable or not", () => {
    // The dangerous case: a protocol-1 leftover decrypts perfectly and still
    // proves nothing about who sent it.
    expect(readableMessages([entry("a".repeat(64), { ok: false })])).toEqual([]);
  });

  it("skips traffic addressed to other holders", () => {
    expect(readableMessages([entry("a".repeat(64), { plaintext: null })])).toEqual([]);
  });
});
