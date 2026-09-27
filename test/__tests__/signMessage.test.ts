/**
 * Message signing per address type.
 *
 * The Sign page used to call the Legacy `sign` for every wallet. The strict
 * families sign a hash bound to the address, and PQ keys are not secp256k1 at
 * all, so that call either threw or produced a signature nothing accepts. The
 * node's `verifymessage` follows the same rules as `verifyMessage` here.
 */

// The published CommonJS entry exposes `createInstance` on the module object.
const NeuraiWallet: typeof import("@neuraiproject/neurai-jswallet") = require("@neuraiproject/neurai-jswallet");
import * as NeuraiMessage from "@neuraiproject/neurai-message";
import { signMessage } from "@/sign/signMessage";

const MNEMONIC = "salad hammer want used web finger comic gold trigger accident oblige pluck";
const MESSAGE = "Neurai message signing";

async function firstAddressObject(network: string) {
  const wallet = await NeuraiWallet.createInstance({
    mnemonic: MNEMONIC,
    network: network as import("@neuraiproject/neurai-jswallet").ChainType,
    offlineMode: true,
  });
  const { address, privateKey, publicKey } = wallet.getAddressObjects()[0];
  return { address, privateKey: String(privateKey), publicKey: String(publicKey) };
}

describe("signMessage", () => {
  it.each([
    ["xna-test", /^t/],
    ["xna-pq-test", /^tnc1p/],
    ["xna-pq-strict-test", /^tpq1z/],
    ["xna-ecdsa-test", /^tnq1r/],
  ])("signs for a %s address what verifyMessage accepts", async (network, prefix) => {
    const addressObject = await firstAddressObject(network);
    expect(addressObject.address).toMatch(prefix);

    const signature = signMessage(MESSAGE, addressObject);

    expect(NeuraiMessage.verifyMessage(MESSAGE, addressObject.address, signature)).toBe(true);
    expect(NeuraiMessage.verifyMessage(MESSAGE + "!", addressObject.address, signature)).toBe(false);
  });

  it("an ECDSA witness address needs the address-bound signature, not the Legacy one", async () => {
    const addressObject = await firstAddressObject("xna-ecdsa-test");
    const legacyStyle = NeuraiMessage.sign(MESSAGE, Buffer.from(addressObject.privateKey, "hex"));

    expect(NeuraiMessage.verifyMessage(MESSAGE, addressObject.address, legacyStyle)).toBe(false);
  });

  it("a strict PQ address needs the address-bound signature, not the AuthScript v1 one", async () => {
    const addressObject = await firstAddressObject("xna-pq-strict-test");
    const v1Style = NeuraiMessage.signPQMessage(
      MESSAGE,
      Buffer.from(addressObject.privateKey, "hex"),
      Buffer.from(addressObject.publicKey, "hex"),
    );

    expect(NeuraiMessage.verifyMessage(MESSAGE, addressObject.address, v1Style)).toBe(false);
  });

  it("refuses without key material instead of signing something unverifiable", async () => {
    const addressObject = await firstAddressObject("xna-pq-strict-test");
    expect(() => signMessage(MESSAGE, { ...addressObject, publicKey: "" })).toThrow(/public key/);
    expect(() => signMessage(MESSAGE, { ...addressObject, privateKey: "" })).toThrow(/private key/);
  });
});
