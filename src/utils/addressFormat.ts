/**
 * Generic AuthScript v1 (the post-quantum address of older releases) used to be
 * written `nq1p…` / `tnq1p…`. The node now reserves the `nq` / `tnq` prefix for
 * strict ECDSA witness v3 and writes the same destination (same scriptPubKey)
 * as `nc1p…` / `tnc1p…`, so the old string is rejected instead of being paid.
 *
 * In Bech32m the character after the `1` separator is the witness version, and
 * `p` is version 1. A 32-byte program leaves 58 more characters after it.
 */
const OLD_AUTHSCRIPT_ADDRESS = /^t?nq1p[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/;

export function isOldAuthScriptAddress(address: string): boolean {
  return OLD_AUTHSCRIPT_ADDRESS.test(String(address ?? "").trim().toLowerCase());
}

/**
 * What to tell the user when the node rejects a recipient address.
 *
 * The old post-quantum format gets its own explanation: it used to be valid,
 * so "not a valid address" alone would look like a wallet bug. The address is
 * never rewritten on the user's behalf; the recipient has to confirm it.
 */
export function invalidAddressMessage(address: string): string {
  if (isOldAuthScriptAddress(address)) {
    return (
      `${address} is an old-format post-quantum address (nq1p… / tnq1p…), which the network no longer accepts. ` +
      "The same destination is now written nc1p… / tnc1p…: ask the recipient for their current address."
    );
  }
  return address + " does not seem to be a valid address";
}
