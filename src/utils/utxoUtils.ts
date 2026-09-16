import type { UTXOResponse } from "../types/rpc";
import { decimalToSatoshis, toRawInteger, type RawAmount } from "../exactAmounts";

type SelectedUtxo = UTXOResponse & { satoshis: bigint };
export interface PickedUtxosResult {
  picked: SelectedUtxo[];
  sumSats: bigint;
}

/** Select exact raw units, largest first; never repair an already rounded number. */
export function pickForcedUtxosForAmount(
  utxos: UTXOResponse[],
  requiredSats: RawAmount,
): PickedUtxosResult {
  const required = toRawInteger(requiredSats);
  if (required < 0n) throw new Error("Required amount cannot be negative");
  if (required === 0n) return { picked: [], sumSats: 0n };
  const normalized: SelectedUtxo[] = [];
  for (const utxo of utxos ?? []) {
    let satoshis: bigint;
    if (utxo.satoshis !== undefined) {
      satoshis = toRawInteger(utxo.satoshis);
    } else {
      if (typeof utxo.value !== "number" && typeof utxo.value !== "string") continue;
      if (typeof utxo.value === "string" && !/^-?\d+(?:\.\d+)?$/.test(utxo.value)) continue;
      satoshis = decimalToSatoshis(utxo.value);
    }
    if (satoshis > 0n) normalized.push({ ...utxo, satoshis });
  }
  normalized.sort((a, b) => a.satoshis > b.satoshis ? -1 : a.satoshis < b.satoshis ? 1 : 0);
  const picked: SelectedUtxo[] = [];
  let sumSats = 0n;
  for (const utxo of normalized) {
    picked.push(utxo);
    sumSats += utxo.satoshis;
    if (sumSats >= required) break;
  }
  return { picked, sumSats };
}
