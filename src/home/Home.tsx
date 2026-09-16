import { addAmounts, absAmount } from "../exactAmounts";
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
import { ReceiveAddress } from "../ReceiveAddress";
import { decimalSeparator, splitAmount } from "./splitAmount";
import { subtitleFor } from "./assetSubtitle";
import { useAssetMeta } from "./useAssetMeta";
import { useDepinAddressAssets } from "./useDepinAddressAssets";
import { useWalletHistory } from "./useWalletHistory";

/** Home combines balances, the receive address, assets and recent activity. */
export function Home({
  wallet,
  assets,
  mempool,
  balance,
  blockCount,
  depinChatAddress,
  setRoute,
  receiveAddress,
}: {
  wallet: Wallet;
  assets: unknown[];
  mempool: MempoolAsset[] | null;
  balance: number | string;
  blockCount: number;
  /** DePIN chat address (BIP44 account 100), outside the normal address range. */
  depinChatAddress?: string | null;
  setRoute: (route: Routes) => void;
  receiveAddress: string;
}) {
  const onTestnet = isTestnet(wallet);
  const price = useUSDPrice(wallet, onTestnet);
  const baseCurrency = wallet.baseCurrency ?? "XNA";

  const pending = getAssetBalanceFromMempool(baseCurrency, mempool);
  const total = addAmounts(balance, pending);

  const { activity, loading } = useWalletHistory(wallet, blockCount, baseCurrency);

  const held = React.useMemo(() => {
    const all = getAssetBalanceIncludingMempool(wallet, assets as never, mempool) as Record<string, number | string>;
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

  return (
    <div className="flex flex-col gap-4">
      {/* Balance ------------------------------------------------------- */}
      <section className={`neurai-card grid gap-7 items-center ${wallet.network.includes("pq") ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]"}`}>
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
                {(price * Number(total)).toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>

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

        <ReceiveAddress wallet={wallet} receiveAddress={receiveAddress} compact />
      </section>


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
            sub={!onTestnet && price > 0 ? (price * Number(total)).toLocaleString("en-US", { style: "currency", currency: "USD" }) : undefined}
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
                    {formatNumberWith8Decimals(absAmount(item.value))}
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
function BalanceAmount({ value }: { value: number | string }) {
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
