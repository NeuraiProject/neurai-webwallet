import { toMessage } from "@/hooks/useDePINChat";

// Which conversation a message belongs to, and what text is shown.
//
// The envelope names the SENDER only, never the recipient, so a sender cannot
// tell from the message alone which of their own conversations it belongs to.
// The `@<address> ` tag rides inside the encryption to solve that, and it is a
// routing marker: it must never reach the screen.

const ME = "tMEMEMEMEMEMEMEMEMEMEMEMEMEMEMEMEME";
const THEM = "tHagDpjbQjA54Ss3t3tRDSio3MQPMpF1ov";

const entry = (over: Partial<Parameters<typeof toMessage>[0]> = {}) => ({
  hash: "a".repeat(64),
  sender: THEM,
  timestamp: 1_700_000_000,
  messageType: "group" as const,
  plaintext: "hola",
  ...over,
});

describe("toMessage", () => {
  it("leaves group traffic alone", () => {
    const msg = toMessage(entry(), ME);
    expect(msg.messageType).toBe("group");
    expect(msg.message).toBe("hola");
    expect(msg.contactAddress).toBeUndefined();
  });

  it("strips the routing tag from what is displayed", () => {
    // The bug this pins: the tag was reaching the screen, and because the
    // optimistic copy was keyed on the clean text it never matched the
    // confirmed one and stayed on screen forever.
    const msg = toMessage(entry({ sender: ME, plaintext: `@${THEM} Prueba privado` }), ME);
    expect(msg.message).toBe("Prueba privado");
  });

  it("places our own message in the conversation the tag names", () => {
    const msg = toMessage(entry({ sender: ME, plaintext: `@${THEM} hola` }), ME);
    expect(msg.messageType).toBe("private");
    expect(msg.contactAddress).toBe(THEM);
  });

  it("places their message in the conversation with them", () => {
    const msg = toMessage(entry({ messageType: "private", plaintext: "hola" }), ME);
    expect(msg.contactAddress).toBe(THEM);
  });

  it("routes on the tag even when the kind byte says group", () => {
    // Routing is what the tag is for. A tagged message must not fall into the
    // group chat, where the whole token would read something meant for one.
    const msg = toMessage(entry({ sender: ME, messageType: "group", plaintext: `@${THEM} secreto` }), ME);
    expect(msg.messageType).toBe("private");
    expect(msg.message).toBe("secreto");
  });

  it("does not invent a conversation for an untagged message of our own", () => {
    // An old private message of ours with no tag: unplaceable. The caller drops
    // it rather than showing it to everyone.
    const msg = toMessage(entry({ sender: ME, messageType: "private", plaintext: "hola" }), ME);
    expect(msg.contactAddress).toBeUndefined();
  });

  it("keeps a lone @ that is not an address in the text", () => {
    const msg = toMessage(entry({ plaintext: "@todos hola" }), ME);
    expect(msg.messageType).toBe("group");
    expect(msg.message).toBe("@todos hola");
  });
});
