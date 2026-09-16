import React from "react";
import { absAmount, displayRaw, toRawInteger } from "./exactAmounts";
import { formatNumberWith8Decimals } from "./formatNumberWith8Decimals";
import type { MempoolAsset } from "./utils";

/** Shared pending status below the header, independent of the active route. */
export function PendingTransactions({ mempool, baseCurrency }: {
  mempool: MempoolAsset[] | null;
  baseCurrency: string;
}) {
  const pendingEntries = (mempool ?? [])
    .map((entry) => ({ assetName: entry.assetName ?? baseCurrency, satoshis: entry.satoshis ?? 0 }))
    .filter((entry) => toRawInteger(entry.satoshis) !== 0n);
  if (!pendingEntries.length) return null;
  return (
        <div role="status" aria-live="polite" className="rounded-field border border-warning/40 bg-warning/10 px-4 py-3 flex items-center gap-2.5 flex-wrap text-sm">
          <span className="w-[7px] h-[7px] rounded-full bg-warning shrink-0" />
          <b>
            {pendingEntries.length} pending {pendingEntries.length === 1 ? "transaction" : "transactions"}
          </b>
          {pendingEntries.slice(0, 3).map((entry, i) => (
            <React.Fragment key={`${entry.assetName}-${i}`}>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">
                {toRawInteger(entry.satoshis) > 0n ? "+" : "−"}
                {formatNumberWith8Decimals(absAmount(displayRaw(toRawInteger(entry.satoshis))))} {entry.assetName}
              </span>
            </React.Fragment>
          ))}
        </div>
  );
}
