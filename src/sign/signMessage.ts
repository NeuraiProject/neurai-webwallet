import * as NeuraiMessage from "@neuraiproject/neurai-message";

export type SigningAddress = {
  address: string;
  /** Hex: secp256k1 key for Legacy / ECDSA witness, ML-DSA-44 secret key for PQ. */
  privateKey: string;
  /** Hex: required for PQ addresses, whose signature embeds the public key. */
  publicKey?: string;
};

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/**
 * Signs a message the way the node's `signmessage` does for the address type.
 *
 * The strict families (PQ v2 `pq1z…` and ECDSA v3 `nq1r…`) sign a hash bound to
 * the address, so a plain Legacy signature made with the same key would not
 * verify for them. Generic AuthScript v1 (`nc1p…`) signs the plain message hash
 * with the PQ key.
 *
 * @throws If the address type cannot sign messages or the key material is missing
 */
export function signMessage(message: string, addressObject: SigningAddress): string {
  const { address, privateKey, publicKey } = addressObject;
  if (!privateKey) {
    throw new Error(`No private key for ${address}`);
  }
  const decoded = NeuraiMessage.decodeAddress(address);
  switch (decoded.type) {
    case "p2pkh":
      return NeuraiMessage.sign(message, hexToBytes(privateKey));
    case "ecdsa":
      return NeuraiMessage.signECDSAWitnessMessage(message, hexToBytes(privateKey), address);
    case "authscript":
    case "pq":
      if (!publicKey) {
        throw new Error(`No public key for ${address}`);
      }
      return NeuraiMessage.signPQMessage(message, hexToBytes(privateKey), hexToBytes(publicKey), address);
    default:
      throw new Error(`Messages cannot be signed with ${address}`);
  }
}
