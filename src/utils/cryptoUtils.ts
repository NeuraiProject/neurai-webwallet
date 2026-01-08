/**
 * Cryptography utilities for the Neurai WebWallet
 * Functions for parsing and validating cryptographic data from RPC responses
 */

import { PubkeyResponse } from "../types/rpc";

type PubkeyResult = PubkeyResponse | string | null | undefined;

/**
 * Extracts and validates a public key from an RPC response
 *
 * Handles various RPC response formats and validates that the pubkey is
 * a valid compressed (33 bytes) or uncompressed (65 bytes) hex string.
 *
 * @param pubkeyResult - RPC response object or string containing pubkey data
 * @returns Validated hex pubkey string or null if invalid
 *
 * @example
 * parsePubkeyMaybe({ pubkey: "0318c0cd..." }) // Returns "0318c0cd..."
 * parsePubkeyMaybe("0318c0cd...") // Returns "0318c0cd..."
 * parsePubkeyMaybe({ result: { pubkey: "0318c0cd..." }}) // Returns "0318c0cd..."
 * parsePubkeyMaybe("invalid") // Returns null
 * parsePubkeyMaybe({ pubkey: "not-hex" }) // Returns null
 */
export function parsePubkeyMaybe(pubkeyResult: PubkeyResult): string | null {
  let candidate: string | null = null;
  if (typeof pubkeyResult === "string") {
    candidate = pubkeyResult;
  } else if (pubkeyResult && typeof pubkeyResult === "object") {
    if (typeof pubkeyResult.pubkey === "string") {
      candidate = pubkeyResult.pubkey;
    } else if (typeof pubkeyResult.result === "string") {
      candidate = pubkeyResult.result;
    } else if (pubkeyResult.result && typeof pubkeyResult.result === "object") {
      if (typeof pubkeyResult.result.pubkey === "string") {
        candidate = pubkeyResult.result.pubkey;
      }
    }
  }

  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();

  // Accept compressed (33 bytes) or uncompressed (65 bytes) pubkeys in hex.
  if (!/^[0-9a-fA-F]{66}$/.test(trimmed) && !/^[0-9a-fA-F]{130}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Checks if a public key has been revealed on-chain
 *
 * Extracts the "revealed" field from an RPC getpubkey response.
 * A revealed pubkey (value 1) indicates the key is available on-chain
 * for other users to use for encryption.
 *
 * @param pubkeyResult - RPC getpubkey response object
 * @returns true if revealed (1), false if not revealed (0), null if field missing
 *
 * @example
 * parsePubkeyRevealedMaybe({ revealed: 1 }) // Returns true
 * parsePubkeyRevealedMaybe({ revealed: 0 }) // Returns false
 * parsePubkeyRevealedMaybe({ pubkey: "0318c0cd..." }) // Returns null (no revealed field)
 */
export function parsePubkeyRevealedMaybe(pubkeyResult: PubkeyResponse | null | undefined): boolean | null {
  if (!pubkeyResult || typeof pubkeyResult !== "object") return null;
  if (!("revealed" in pubkeyResult)) return null;

  const value = pubkeyResult.revealed;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return null;
}
