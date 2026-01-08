/**
 * UTXO (Unspent Transaction Output) utilities for the Neurai WebWallet
 * Functions for selecting and managing UTXOs for transactions
 */

import { UTXOResponse } from "../types/rpc";

type UTXOInput = UTXOResponse & Record<string, unknown>;

/**
 * UTXO interface for internal use
 */
interface UTXO {
  satoshis: number;
  value?: number;
  [key: string]: unknown;
}

/**
 * Result of UTXO selection
 */
export interface PickedUtxosResult {
  /** Array of selected UTXOs */
  picked: UTXO[];
  /** Total satoshis in the selected UTXOs */
  sumSats: number;
}

/**
 * Selects UTXOs to meet a required amount
 *
 * Implements a greedy algorithm that sorts UTXOs by value (largest first)
 * and selects them until the required amount is reached or exceeded.
 *
 * This function normalizes UTXO values from various formats:
 * - Handles both `satoshis` field (integer) and `value` field (decimal)
 * - Filters out invalid or zero-value UTXOs
 * - Returns as soon as the required amount is met
 *
 * @param utxos - Array of UTXO objects from RPC
 * @param requiredSats - Required amount in satoshis
 * @returns Object containing picked UTXOs and their total value
 *
 * @example
 * const utxos = [
 *   { value: 1.0 },    // 100,000,000 satoshis
 *   { satoshis: 50000000 },
 *   { value: 0.1 }     // 10,000,000 satoshis
 * ];
 *
 * pickForcedUtxosForAmount(utxos, 120000000);
 * // Returns: {
 * //   picked: [{ satoshis: 100000000 }, { satoshis: 50000000 }],
 * //   sumSats: 150000000
 * // }
 */
export function pickForcedUtxosForAmount(
  utxos: UTXOInput[],
  requiredSats: number
): PickedUtxosResult {
  /**
   * Normalizes a UTXO to ensure it has a satoshis field
   */
  const normalize = (u: UTXOInput): UTXO => {
    const satoshis =
      typeof u?.satoshis === "number"
        ? u.satoshis
        : typeof u?.value === "number"
          ? Math.round(u.value * 1e8)
          : 0;
    return { ...u, satoshis };
  };

  // Normalize all UTXOs and filter out invalid ones
  const normalized = (utxos ?? [])
    .map(normalize)
    .filter((u) => Number.isFinite(u.satoshis) && u.satoshis > 0);

  // Sort by satoshis descending (largest first for greedy selection)
  normalized.sort((a, b) => b.satoshis - a.satoshis);

  const picked: UTXO[] = [];
  let sum = 0;

  // Greedy selection: pick UTXOs until we meet the requirement
  for (const u of normalized) {
    picked.push(u);
    sum += u.satoshis;
    if (sum >= requiredSats) break;
  }

  return { picked, sumSats: sum };
}
