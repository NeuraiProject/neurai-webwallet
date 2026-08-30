import React from "react";
import { getHistory } from "@neuraiproject/neurai-history-list";
import { Wallet } from "@neuraiproject/neurai-jswallet";

import type { BalancePoint } from "./BalanceChart";

type RawDelta = {
  satoshis?: number;
  value?: number;
  assetName?: string;
  height?: number;
  [key: string]: unknown;
};

export interface ActivityItem {
  transactionId: string;
  blockHeight?: number;
  /** Net movement of the headline asset for this transaction. */
  value: number;
  assetName: string;
  /** True when this left the wallet. Taken from the library, not from a sign. */
  outgoing: boolean;
  /** More than one asset moved; the row names the headline one and says so. */
  extraAssets: number;
}

export interface WalletHistory {
  activity: ActivityItem[];
  balanceSeries: BalancePoint[];
  loading: boolean;
}

/**
 * Transaction history, shaped for the home page.
 *
 * Same source and same normalisation as the History route — `wallet.getHistory()`
 * plus `getHistory()` from `neurai-history-list` — so the two can never disagree
 * about what happened. This adds only the running balance the chart needs.
 *
 * @param baseCurrency - Network currency name, the asset the chart follows
 */
export function useWalletHistory(wallet: Wallet, blockCount: number, baseCurrency: string): WalletHistory {
  const [raw, setRaw] = React.useState<RawDelta[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    wallet
      .getHistory()
      .then((h) => {
        if (!cancelled) setRaw((h ?? []) as unknown as RawDelta[]);
      })
      .catch(() => {
        // The home page degrades to no chart and no activity rather than to an
        // error: the balance above it is still correct and still useful.
        if (!cancelled) setRaw([]);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, blockCount]);

  return React.useMemo<WalletHistory>(() => {
    if (raw === null) return { activity: [], balanceSeries: [], loading: true };
    return { ...deriveWalletHistory(raw, baseCurrency), loading: false };
  }, [raw, baseCurrency]);
}

/**
 * The pure half: deltas in, what the home page renders out.
 *
 * Split from the hook so the two pieces of real logic here — which asset a
 * transaction is "about", and the running balance the chart plots — can be
 * tested without mounting anything.
 *
 * @param raw - Deltas exactly as `wallet.getHistory()` returns them
 * @param baseCurrency - The asset the balance series follows
 */
export function deriveWalletHistory(
  raw: RawDelta[],
  baseCurrency: string,
): { activity: ActivityItem[]; balanceSeries: BalancePoint[] } {


    const normalized = raw.map((h) => ({
      ...h,
      value: typeof h.satoshis === "number" ? h.satoshis / 1e8 : h.value,
    }));

    const grouped = getHistory(normalized);

    const activity: ActivityItem[] = grouped
      .slice()
      .sort((a, b) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0))
      .map((tx) => {
        // The asset that moved most in absolute terms is what the row is about.
        // The library has usually decided this already — it folds a currency
        // delta that is only the fee of an asset operation into `fee` — so this
        // matters mainly when a transaction really did move several assets.
        const headline = tx.assets.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
        return {
          transactionId: tx.transactionId,
          blockHeight: tx.blockHeight,
          value: headline?.value ?? 0,
          assetName: headline?.assetName ?? baseCurrency,
          // Prefer the library's reading; fall back to the sign when absent.
          outgoing: typeof tx.isSent === "boolean" ? tx.isSent : (headline?.value ?? 0) < 0,
          extraAssets: Math.max(0, tx.assets.length - 1),
        };
      });

    // Running balance of the network currency, oldest first. Plotted against
    // block height rather than a date: a timestamp would cost one
    // getrawtransaction per transaction, which the home page should not spend.
    const byHeight = grouped
      .slice()
      .sort((a, b) => (a.blockHeight ?? 0) - (b.blockHeight ?? 0));

    let running = 0;
    const balanceSeries: BalancePoint[] = [];
    for (const tx of byHeight) {
      const delta = tx.assets
        .filter((a) => a.assetName === baseCurrency)
        .reduce((sum, a) => sum + a.value, 0);
      if (delta === 0) continue;
      running += delta;
      balanceSeries.push({ blockHeight: tx.blockHeight ?? 0, balance: running });
    }

    return { activity, balanceSeries };
}
