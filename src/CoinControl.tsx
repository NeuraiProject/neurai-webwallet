import React from "react";
import type { CoinUtxo } from "./coinControlWallet";
import { selectedTotal, utxoId } from "./coinControlWallet";
import { satoshisToDecimal, toRawInteger } from "./exactAmounts";
import { formatNumberWith8Decimals as format } from "./formatNumberWith8Decimals";

export function CoinControl({ utxos, selected, asset, baseCurrency, loading, error, disabled, onToggle, onSelectAll, onClear, onRefresh }: {
  utxos: CoinUtxo[]; selected: Set<string>; asset: string; baseCurrency: string;
  loading: boolean; error: string | null; disabled: boolean;
  onToggle: (id: string) => void; onSelectAll: () => void; onClear: () => void; onRefresh: () => void;
}) {
  const picked = utxos.filter(u => selected.has(utxoId(u)));
  return <section id="coin-control-panel" className="neurai-card min-w-0 flex flex-col gap-4" aria-labelledby="coin-control-title">
    <div className="flex items-center justify-between gap-3">
      <h5 id="coin-control-title" className="neurai-card__title">Coin Control</h5>
      <button type="button" className="neurai-btn--secondary" disabled={disabled || loading} onClick={onRefresh}>Refresh</button>
    </div>
    <p className="neurai-hint m-0">Choose the UTXOs to spend. Only selected outputs will be used.{asset !== baseCurrency && ` Select ${baseCurrency} outputs too, to pay the network fee.`}</p>
    <div className="rounded-xl border border-base-300 bg-base-200 p-4" role="status" aria-live="polite">
      <div className="text-xs opacity-60 mb-1">{picked.length} UTXO{picked.length === 1 ? "" : "s"} selected · before fees</div>
      <div className="font-semibold tabular-nums break-all">{format(selectedTotal(picked, asset))} {asset}</div>
      {asset !== baseCurrency && <div className="text-sm tabular-nums mt-1">{format(selectedTotal(picked, baseCurrency))} {baseCurrency} for fees</div>}
    </div>
    <div className="flex gap-3 text-sm">
      <button type="button" className="text-primary underline" disabled={disabled || loading || !!error || !utxos.length} onClick={onSelectAll}>Select all</button>
      <button type="button" className="text-primary underline" disabled={disabled || !picked.length} onClick={onClear}>Clear selection</button>
    </div>
    {loading ? <p role="status" className="neurai-hint">Loading available UTXOs…</p> : error ? <p role="alert" className="text-error text-sm">{error}</p> : !utxos.length ? <p className="neurai-hint">No available UTXOs for this asset.</p> :
      <div className="max-h-[32rem] overflow-y-auto flex flex-col gap-2 pr-1">
        {utxos.map(u => {
          const id = utxoId(u);
          return <label key={id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selected.has(id) ? "border-primary bg-primary/5" : "border-base-300 hover:bg-base-200"}`}>
            <input type="checkbox" className="checkbox checkbox-sm checkbox-primary mt-1 shrink-0" checked={selected.has(id)} disabled={disabled} onChange={() => onToggle(id)} aria-label={`Select UTXO ${id}`} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold tabular-nums break-all">{format(satoshisToDecimal(toRawInteger(u.satoshis)))} {u.assetName}</div>
              <div className="text-xs opacity-60 mt-1">{u.height && u.height > 0 ? `Block ${u.height}` : "Unconfirmed"}</div>
              <div className="font-mono text-xs break-all mt-2" title={id}>{u.txid}:{u.outputIndex}</div>
              <div className="font-mono text-xs opacity-60 break-all mt-1">{u.address}</div>
            </div>
          </label>;
        })}
      </div>}
  </section>;
}
