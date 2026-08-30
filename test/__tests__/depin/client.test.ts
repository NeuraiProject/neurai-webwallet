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
const verifyDepinReply = jest.fn();
const decodePlainReply = jest.fn();
const decodeDepinRecipients = jest.fn();
const buildDepinMessage = jest.fn();

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
  verifyDepinReply: (...a: unknown[]) => verifyDepinReply(...a),
  decodePlainReply: (...a: unknown[]) => decodePlainReply(...a),
  decodeDepinRecipients: (...a: unknown[]) => decodeDepinRecipients(...a),
  buildDepinMessage: (...a: unknown[]) => buildDepinMessage(...a),
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
    buildDepinMessage,
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

describe("session scope", () => {
  it("keeps the verified pool across a channel change", async () => {
    // The pool belongs to the endpoint, not to the token. Re-fetching it every
    // time the user looks at another asset left the picker — which needs the
    // pool to judge scope — waiting again on each glance.
    receiveDepinMessages.mockResolvedValue({ messages: [], hasMore: false });
    const client = makeClient();

    await client.pool();
    client.resetChannel();
    await client.pool();

    expect(getDepinPoolInfo).toHaveBeenCalledTimes(1);
  });

  it("drops the challenge on a channel change, because it is bound to the token", async () => {
    receiveDepinMessages.mockResolvedValue({
      messages: [],
      hasMore: false,
      nextChallenge: "d".repeat(64),
      nextExpiresIn: 300,
    });
    const client = makeClient();

    await client.receiveAll({ token: TOKEN });
    client.resetChannel();
    await client.receiveAll({ token: "&OTHER" });

    // Without the drop, the second read would reuse a nonce bound to the first
    // token and be rejected.
    expect(requestDepinChallenge).toHaveBeenCalledTimes(2);
  });

  it("a new endpoint or identity invalidates the pool too", async () => {
    const client = makeClient();
    await client.pool();
    client.reset();
    await client.pool();

    expect(getDepinPoolInfo).toHaveBeenCalledTimes(2);
  });
});

describe("verified recipients", () => {
  const body = {
    token: TOKEN,
    recipients: [
      { address: "tONE", pubkey: "02" + "1".repeat(64) },
      { address: "tTWO", pubkey: "02" + "2".repeat(64) },
    ],
  };

  beforeEach(() => {
    verifyDepinReply.mockReturnValue({ branded: true });
    decodePlainReply.mockReturnValue(body);
    decodeDepinRecipients.mockResolvedValue({ recipientPubKeys: [], recipientCount: 2, skipped: {} });
  });

  it("returns the address/key pairs the library just validated", async () => {
    const pairs = await makeClient().recipients(TOKEN);

    expect(pairs).toEqual([
      { address: "tONE", pubkey: "02" + "1".repeat(64) },
      { address: "tTWO", pubkey: "02" + "2".repeat(64) },
    ]);
  });

  it("verifies the envelope before decoding anything", async () => {
    await makeClient().recipients(TOKEN);

    expect(verifyDepinReply).toHaveBeenCalledWith(
      expect.objectContaining({ method: "depingetancestorrecipients", poolPublicKey: POOL_KEY }),
    );
    // Only a value the verifier branded may be decoded.
    expect(decodePlainReply).toHaveBeenCalledWith({ branded: true });
  });

  it("refuses the whole list when the library rejects the body", async () => {
    // A truncated list, a scope mismatch or a key that does not hash to its
    // address must take every pair down with it — a partially trustworthy list
    // is not a smaller list, it is an unknown one.
    decodeDepinRecipients.mockRejectedValue(new Error("Recipient pubkey does not match its address"));

    await expect(makeClient().recipients(TOKEN)).rejects.toThrow(/does not match its address/);
  });

  it("asks for one more than the pool limit, so 'at' and 'over' stay distinct", async () => {
    const rpc = jest.fn().mockResolvedValue({});
    const client = createDepinClient({
      rpc,
      chain: "xna-test",
      url: "https://rpc-testnet.neurai.org/rpc",
      wif: "cWIFPLACEHOLDER",
    });
    await client.recipients(TOKEN);

    expect(rpc).toHaveBeenCalledWith("depingetancestorrecipients", [TOKEN, 21, TOKEN]);
  });
});

describe("private messages", () => {
  beforeEach(() => {
    verifyDepinReply.mockReturnValue({ branded: true });
    decodePlainReply.mockReturnValue({
      token: TOKEN,
      recipients: [
        { address: "tTHEM", pubkey: "02" + "1".repeat(64) },
        { address: "tHOLDER", pubkey: IDENTITY.publicKey },
      ],
    });
    decodeDepinRecipients.mockResolvedValue({ recipientPubKeys: [], recipientCount: 2, skipped: {} });
    buildDepinMessage.mockResolvedValue({ hex: "ccdd", messageHash: "priv", recipientCount: 2 });
    submitDepinMessage.mockResolvedValue({ messageHash: "priv-from-pool" });
  });

  it("encrypts to the recipient only, letting the library add the sender", async () => {
    // Two keys, not one: without the sender's own, the sender could never read
    // their outgoing messages back from the pool on another device.
    await makeClient().sendPrivate({ token: TOKEN, toAddress: "tTHEM", message: "hola", timestamp: 1 });

    const args = buildDepinMessage.mock.calls[0][0];
    expect(args.recipientPubKeys).toEqual(["02" + "1".repeat(64)]);
    expect(args.messageType).toBe("private");
  });

  it("takes the key from the verified list, never from the caller", async () => {
    await makeClient().sendPrivate({ token: TOKEN, toAddress: "tTHEM", message: "hola", timestamp: 1 });

    // The address was resolved through the pipeline that checks each key
    // against its address; a caller-supplied key would be the substitution that
    // check exists to prevent.
    expect(verifyDepinReply).toHaveBeenCalledWith(
      expect.objectContaining({ method: "depingetancestorrecipients" }),
    );
  });

  it("refuses an address that is not a holder with a published key", async () => {
    await expect(
      makeClient().sendPrivate({ token: TOKEN, toAddress: "tSTRANGER", message: "hola", timestamp: 1 }),
    ).rejects.toThrow(/not a holder/i);
    expect(buildDepinMessage).not.toHaveBeenCalled();
  });

  it("submits through the verifying helper like any other message", async () => {
    const result = await makeClient().sendPrivate({
      token: TOKEN,
      toAddress: "tTHEM",
      message: "hola",
      timestamp: 1,
    });

    expect(submitDepinMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageHex: "ccdd", poolPublicKey: POOL_KEY }),
    );
    expect(result.messageHash).toBe("priv-from-pool");
  });
});
