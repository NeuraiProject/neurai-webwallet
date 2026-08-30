import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

import { isTestnet, useUSDPrice } from "../Balance";
import { Routes } from "../Routes";
import { IconNeurai } from "../icons/IconNeurai";
import {
  IconDepinAsset,
  IconIncoming,
  IconOutgoing,
  IconPlainAsset,
  IconQualifierAsset,
  IconSubAsset,
} from "../icons/assetIcons";
import { formatNumberWith8Decimals } from "../formatNumberWith8Decimals";
import { getAssetBalanceIncludingMempool, getAssetBalanceFromMempool, isBaseAssetName, type MempoolAsset } from "../utils";
import { BalanceChart } from "./BalanceChart";
import { decimalSeparator, splitAmount } from "./splitAmount";
import { subtitleFor } from "./assetSubtitle";
import { useAssetMeta } from "./useAssetMeta";
import { useDepinAddressAssets } from "./useDepinAddressAssets";
import { useWalletHistory } from "./useWalletHistory";

/**
 * The wallet's home page.
 *
 * Replaces a bare assets table with the four things someone opens a wallet to
 * find out: what they hold, whether it moved, what is still in flight, and
 * which chain they are on. Everything here comes from data the app already
 * loads, except one lookup per asset that the old assets list was already
 * making for its IPFS thumbnails.
 */
export function Home({
  wallet,
  assets,
  mempool,
  balance,
  blockCount,
  depinChatAddress,
  setRoute,
}: {
  wallet: Wallet;
  assets: unknown[];
  mempool: MempoolAsset[] | null;
  balance: number;
  blockCount: number;
  /** DePIN chat address (BIP44 account 100), outside the normal address range. */
  depinChatAddress?: string | null;
  setRoute: (route: Routes) => void;
}) {
  const onTestnet = isTestnet(wallet);
  const price = useUSDPrice(wallet, onTestnet);
  const baseCurrency = wallet.baseCurrency ?? "XNA";

  const pending = getAssetBalanceFromMempool(baseCurrency, mempool);
  const total = balance + pending;

  const { balanceSeries, activity, loading } = useWalletHistory(wallet, blockCount, baseCurrency);

  const held = React.useMemo(() => {
    const all = getAssetBalanceIncludingMempool(wallet, assets as never, mempool) as Record<string, number>;
    return Object.entries(all)
      .filter(([name, amount]) => !isBaseAssetName(name, baseCurrency) && amount !== 0)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [wallet, assets, mempool, baseCurrency]);

  // Tokens at the DePIN address are not part of the wallet's ordinary balances,
  // so they have to be asked for separately or they are simply invisible.
  const depinHeld = useDepinAddressAssets(wallet, depinChatAddress ?? null, blockCount);

  const rows = React.useMemo(() => {
    const main = held.map(([name, amount]) => ({ name, amount, atDepinAddress: false }));
    const seen = new Set(main.map((row) => row.name));
    const extra = Object.entries(depinHeld)
      .filter(([name]) => !seen.has(name))
      .map(([name, amount]) => ({ name, amount, atDepinAddress: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...main, ...extra];
  }, [held, depinHeld]);

  const meta = useAssetMeta(
    wallet,
    React.useMemo(() => rows.map((row) => row.name), [rows]),
  );

  // Change over the visible history, which is what the chart is showing. Not
  // labelled as a time window: the series is indexed by block height, and
  // turning heights into dates would cost one lookup per transaction.
  const change = React.useMemo(() => {
    if (balanceSeries.length < 2) return null;
    const first = balanceSeries[0].balance;
    const last = balanceSeries[balanceSeries.length - 1].balance;
    if (first === 0) return null;
    return ((last - first) / Math.abs(first)) * 100;
  }, [balanceSeries]);

  const pendingEntries = (mempool ?? [])
    .map((entry) => ({ assetName: entry.assetName ?? baseCurrency, satoshis: entry.satoshis ?? 0 }))
    .filter((entry) => entry.satoshis !== 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Balance ------------------------------------------------------- */}
      <section className="neurai-card grid gap-7 items-center md:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] opacity-50 m-0">Total balance</p>
          <div className="flex items-baseline gap-2.5 mt-2 mb-0.5 flex-wrap">
            <span className="font-bold leading-none tracking-tight tabular-nums">
              <BalanceAmount value={total} />
            </span>
            <span className="text-[17px] font-semibold opacity-50">{baseCurrency}</span>
          </div>
          {/* No fiat on testnet: a price there is meaningless, and "$0.00"
              reads as a broken wallet rather than as a test network. */}
          {!onTestnet && price > 0 && (
            <p className="opacity-70 text-sm m-0">
              <span className="tabular-nums">
                {(price * total).toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>
              {change !== null && (
                <>
                  {" · "}
                  <span className={`tabular-nums font-semibold ${change >= 0 ? "text-success" : "text-error"}`}>
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(1)}%
                  </span>{" "}
                  over this history
                </>
              )}
            </p>
          )}

          <div className="flex gap-2 mt-4 flex-wrap">
            <button type="button" className="neurai-btn--primary" onClick={() => setRoute(Routes.SEND)}>
              Send
            </button>
            <button type="button" className="neurai-btn--secondary" onClick={() => setRoute(Routes.RECEIVE)}>
              Receive
            </button>
            <button type="button" className="neurai-btn--secondary" onClick={() => setRoute(Routes.ASSET)}>
              Create asset
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          {balanceSeries.length >= 2 ? (
            <>
              <BalanceChart points={balanceSeries} />
              <div className="flex justify-between text-[11px] opacity-50 tabular-nums">
                <span>block {balanceSeries[0].blockHeight.toLocaleString()}</span>
                <span>block {balanceSeries[balanceSeries.length - 1].blockHeight.toLocaleString()}</span>
              </div>
            </>
          ) : (
            <p className="text-sm opacity-60 m-0">
              {loading ? "Loading history…" : "Your balance chart appears after your first transactions."}
            </p>
          )}
        </div>
      </section>

      {/* Pending ------------------------------------------------------- */}
      {pendingEntries.length > 0 && (
        <div className="rounded-field border border-warning/40 bg-warning/10 px-4 py-3 flex items-center gap-2.5 flex-wrap text-sm">
          <span className="w-[7px] h-[7px] rounded-full bg-warning shrink-0" />
          <b>
            {pendingEntries.length} pending {pendingEntries.length === 1 ? "transaction" : "transactions"}
          </b>
          {pendingEntries.slice(0, 3).map((entry, i) => (
            <React.Fragment key={`${entry.assetName}-${i}`}>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">
                {entry.satoshis > 0 ? "+" : "−"}
                {formatNumberWith8Decimals(Math.abs(entry.satoshis) / 1e8)} {entry.assetName}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        {/* Assets ------------------------------------------------------ */}
        <section className="neurai-card p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-3">
            <h2 className="m-0 text-sm font-bold">Assets</h2>
            <button type="button" className="text-xs font-semibold text-primary bg-transparent border-0 cursor-pointer p-0" onClick={() => setRoute(Routes.ASSET)}>
              Manage
            </button>
          </div>

          <AssetRow
            icon={<IconNeurai className="w-[26px] h-[26px]" />}
            iconClass="bg-white"
            name={baseCurrency}
            subtitle="Network currency"
            amount={formatNumberWith8Decimals(total)}
            sub={!onTestnet && price > 0 ? (price * total).toLocaleString("en-US", { style: "currency", currency: "USD" }) : undefined}
          />

          {rows.map((row) => (
            <AssetRow
              key={row.name}
              icon={iconFor(row.name)}
              name={row.name}
              subtitle={
                row.atDepinAddress
                  ? "Held at your DePIN chat address"
                  : subtitleFor(row.name, meta[row.name])
              }
              amount={formatNumberWith8Decimals(row.amount)}
              sub={row.name.endsWith("!") ? undefined : supplyLabel(meta[row.name])}
            />
          ))}

          {rows.length === 0 && (
            <p className="px-[18px] py-4 m-0 text-sm opacity-60 border-t border-base-300">
              No tokens yet.
            </p>
          )}
        </section>

        <div className="grid gap-4">
          {/* Activity ------------------------------------------------------- */}
          <section className="neurai-card p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-3">
              <h2 className="m-0 text-sm font-bold">Recent activity</h2>
              <button type="button" className="text-xs font-semibold text-primary bg-transparent border-0 cursor-pointer p-0" onClick={() => setRoute(Routes.HISTORY)}>
                View all
              </button>
            </div>

            {activity.slice(0, 5).map((item) => {
              const incoming = !item.outgoing;
              return (
                <div key={item.transactionId} className="grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 items-center px-[18px] py-2.5 border-t border-base-300">
                  <div
                    className={`w-8 h-8 rounded-[9px] grid place-items-center shrink-0 ${
                      incoming ? "bg-success/20 text-success" : "bg-error/15 text-error"
                    }`}
                  >
                    {incoming ? <IconIncoming className="w-[19px] h-[19px]" /> : <IconOutgoing className="w-[19px] h-[19px]" />}
                  </div>
                  <div className="min-w-0">
                    <b className="text-[13px] font-semibold">
                      {incoming ? "Received" : "Sent"}
                      {item.assetName !== baseCurrency ? ` ${item.assetName}` : ""}
                    </b>
                    <div className="text-[11.5px] opacity-50 tabular-nums">
                      {item.blockHeight ? `block ${item.blockHeight.toLocaleString()}` : "unconfirmed"}
                      {item.extraAssets > 0 && ` · +${item.extraAssets} more`}
                    </div>
                  </div>
                  <div className={`text-right text-[13px] font-semibold tabular-nums ${incoming ? "text-success" : ""}`}>
                    {incoming ? "+" : "−"}
                    {formatNumberWith8Decimals(Math.abs(item.value))}
                  </div>
                </div>
              );
            })}

            {activity.length === 0 && (
              <p className="px-[18px] py-4 m-0 text-sm opacity-60 border-t border-base-300">
                {loading ? "Loading…" : "No transactions yet."}
              </p>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

/**
 * The balance, with the fractional part set clearly smaller.
 *
 * Eight decimals at the same size as the whole number compete with it for
 * attention, and the whole number is what anyone reads first. The gap has to be
 * big enough to see: a few pixels off 42 is arithmetically smaller and visually
 * identical, so this uses the two-thirds ratio price displays settle on.
 */
function BalanceAmount({ value }: { value: number }) {
  const formatted = formatNumberWith8Decimals(value);
  const { whole, separator, fraction } = splitAmount(
    formatted,
    decimalSeparator(typeof navigator !== "undefined" ? navigator.language : undefined),
  );

  return (
    <>
      <span className="text-[42px]">{whole}</span>
      {separator && (
        <span className="text-[28px]">
          {separator}
          {fraction}
        </span>
      )}
    </>
  );
}

function AssetRow({
  icon,
  iconClass = "bg-base-100",
  name,
  subtitle,
  amount,
  sub,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  name: string;
  subtitle?: string;
  amount: string;
  sub?: string;
}) {
  return (
    <div className="grid grid-cols-[38px_minmax(0,1fr)_auto] gap-3 items-center px-[18px] py-3 border-t border-base-300">
      <div className={`w-[38px] h-[38px] rounded-[10px] grid place-items-center shrink-0 border border-base-300 opacity-90 ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold truncate">{name}</div>
        {subtitle && <div className="text-[11.5px] opacity-50 truncate">{subtitle}</div>}
      </div>
      <div className="text-right font-semibold text-sm tabular-nums">
        {amount}
        {sub && <span className="block text-[11.5px] font-normal opacity-50">{sub}</span>}
      </div>
    </div>
  );
}

/** The icon carries the kind, in the same geometry as the navigation. */
function iconFor(assetName: string): React.ReactNode {
  const cls = "w-5 h-5";
  if (assetName.startsWith("&")) return <IconDepinAsset className={cls} />;
  if (assetName.startsWith("#")) return <IconQualifierAsset className={cls} />;
  if (assetName.includes("/")) return <IconSubAsset className={cls} />;
  return <IconPlainAsset className={cls} />;
}

/** Holding against total issuance, when the issuance is known. */
function supplyLabel(meta?: { amount?: number }): string | undefined {
  if (typeof meta?.amount !== "number") return undefined;
  return `of ${meta.amount.toLocaleString()}`;
}
