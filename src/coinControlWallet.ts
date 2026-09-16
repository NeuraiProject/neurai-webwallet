import type { Wallet } from "@neuraiproject/neurai-jswallet";
import { parseTransaction } from "@neuraiproject/neurai-create-transaction";
import { satoshisToDecimal, toRawInteger } from "./exactAmounts";

export type CoinUtxo = Awaited<ReturnType<Wallet["getUTXOs"]>>[number];
export const utxoId = (utxo: CoinUtxo) => `${utxo.txid}:${utxo.outputIndex}`;

export function selectedTotal(utxos: CoinUtxo[], assetName: string): string {
  return satoshisToDecimal(utxos.filter(u => u.assetName === assetName)
    .reduce((sum, u) => sum + toRawInteger(u.satoshis), 0n));
}

/** Same spendable sources as jswallet, excluding outputs already spent in mempool. */
export async function loadCoinUtxos(wallet: Wallet): Promise<CoinUtxo[]> {
  const [base, assets, mempool] = await Promise.all([
    wallet.getUTXOs(), wallet.getAssetUTXOs(), wallet.getMempool(),
  ]);
  const pending = await wallet.getUTXOsInMempool(mempool);
  const spent = new Set(mempool.filter(m => m.prevtxid).map(m => `${m.prevtxid}:${m.prevout}`));
  const owned = new Set(wallet.getAddresses());
  const unique = new Map<string, CoinUtxo>();
  for (const u of [...base, ...assets, ...pending]) {
    if (owned.has(u.address) && !spent.has(utxoId(u)) && toRawInteger(u.satoshis) > 0n) {
      unique.set(utxoId(u), u);
    }
  }
  return [...unique.values()];
}

/** Restrict the builder's funding sources without changing the active wallet. */
export async function createCoinControlledTransaction(
  wallet: Wallet,
  options: Parameters<Wallet["createTransaction"]>[0],
  selected: CoinUtxo[],
) {
  if (!selected.length) throw new Error("Select at least one UTXO in Coin Control.");
  const ids = new Set(selected.map(utxoId));
  if (ids.size !== selected.length) throw new Error("Duplicate UTXO selection.");
  const available = await loadCoinUtxos(wallet);
  const inputs = available.filter(u => ids.has(utxoId(u)));
  if (inputs.length !== ids.size) throw new Error("A selected UTXO is no longer available. Refresh Coin Control.");
  const asset = options.assetName ?? wallet.baseCurrency;
  if (inputs.some(u => u.assetName !== asset && u.assetName !== wallet.baseCurrency)) {
    throw new Error("The UTXO selection contains a different asset.");
  }
  // forcedUTXOs alone only prioritises inputs: jswallet can still add others.
  // This per-transaction wallet view exposes only the selected funding sources.
  const scoped: Wallet = Object.create(wallet);
  scoped.getUTXOs = async () => inputs.filter(u => u.assetName === wallet.baseCurrency).map(u => ({ ...u, forced: true }));
  scoped.getAssetUTXOs = async (name?: string) => inputs.filter(u => u.assetName !== wallet.baseCurrency && (!name || u.assetName === name)).map(u => ({ ...u, forced: true }));
  scoped.getUTXOsInMempool = async () => [];
  const result = await scoped.createTransaction(options);
  const raw = result.debug.signedTransaction;
  if (!raw) throw new Error("The transaction could not be signed.");
  const actual = parseTransaction(raw).inputs.map(i => `${i.txid}:${i.vout}`);
  if (actual.length !== ids.size || new Set(actual).size !== ids.size || actual.some(id => !ids.has(id))) {
    throw new Error("The transaction does not match the selected UTXOs. Nothing has been sent.");
  }
  return result;
}
