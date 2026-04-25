import React from "react";
import { getHistory } from "@neuraiproject/neurai-history-list";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { AssetName } from "../AssetName";
import { useTransaction } from "../useTransaction";
import networkInfo from "../networkInfo";

type RawHistoryItem = {
  satoshis?: number;
  value?: number;
  txid?: string;
  assetName?: string;
  address?: string;
  height?: number;
  [key: string]: unknown;
};

type HistoryListItem = {
  transactionId: string;
  blockHeight?: number;
  assets: Array<{ assetName: string; value: number }>;
};

// Loose shape for the verbose getrawtransaction response. Kept exported so
// existing consumers (e.g. useTransaction) keep compiling.
export interface ITransaction {
  txid?: string;
  time: number;
  vin: Array<RawTxVin>;
  vout: Array<RawTxVout>;
  blockheight?: number;
  confirmations?: number;
}

type RawTxVin = {
  txid?: string;
  vout?: number;
  address?: string;
  value?: number;
  coinbase?: string;
};

type RawTxVout = {
  value?: number;
  n?: number;
  scriptPubKey?: {
    addresses?: string[];
    type?: string;
    asset?: { name?: string; amount?: number };
  };
};

type ParsedInput = {
  parentTxid: string;
  parentVout: number;
  address: string | null;
  value: number;
  assetName: string;
};

type ParsedOutput = {
  index: number;
  address: string | null;
  value: number;
  assetName: string;
};

interface IProps {
  blockCount: number | null;
  wallet: Wallet;
}

const PAGE_SIZE = 10;

export function History({ blockCount, wallet }: IProps) {
  const [history, setHistory] = React.useState<RawHistoryItem[]>([]);
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    wallet.getHistory().then(setHistory);
  }, [blockCount, wallet]);

  const items = React.useMemo<HistoryListItem[]>(() => {
    const normalized = history.map((h) => ({
      ...h,
      value: typeof h.satoshis === "number" ? h.satoshis / 1e8 : h.value,
    }));
    const list = getHistory(normalized) as HistoryListItem[];
    list.sort((a, b) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0));
    return list;
  }, [history]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * PAGE_SIZE;
  const visibleItems = items.slice(startIdx, startIdx + PAGE_SIZE);

  const networkKey = wallet.network as keyof typeof networkInfo;
  const network = networkInfo[networkKey] ?? networkInfo.xna;

  return (
    <div className="flex flex-col gap-3">
      {visibleItems.map((item) => (
        <TransactionCard
          key={item.transactionId}
          wallet={wallet}
          transactionId={item.transactionId}
          blockHeight={item.blockHeight}
          assets={item.assets}
          rawDeltas={history}
          getTransactionURL={network.getTransactionURL}
        />
      ))}

      {items.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            className="neurai-btn--secondary"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            aria-label="Previous page"
          >
            ← Newer
          </button>
          <span className="text-sm text-base-content/70">
            {startIdx + 1}–{Math.min(items.length, startIdx + visibleItems.length)} of {items.length}
          </span>
          <button
            type="button"
            className="neurai-btn--secondary"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            aria-label="Next page"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Heuristic summary for the collapsed row. Aggregated `assets[]` from the
 * history library reports a net of 0 when the user sends to one of their
 * own addresses. We re-scan the raw deltas to detect that case and report
 * the smallest positive delta as the actual moved amount.
 */
function summarizeAsset(
  rawDeltas: RawHistoryItem[],
  txid: string,
  assetName: string,
  aggregatedValue: number
): { amount: number; isSelfSend: boolean; direction: "in" | "out" | "none" } {
  const txDeltas = rawDeltas.filter(
    (d) => d.txid === txid && d.assetName === assetName
  );
  let grossOut = 0;
  let grossIn = 0;
  let smallestPositive: number | null = null;

  for (const d of txDeltas) {
    const s = typeof d.satoshis === "number" ? d.satoshis : 0;
    if (s < 0) grossOut += -s;
    if (s > 0) {
      grossIn += s;
      if (smallestPositive === null || s < smallestPositive) {
        smallestPositive = s;
      }
    }
  }

  const isSelfSend = grossOut > 0 && grossIn === grossOut;
  if (isSelfSend && smallestPositive !== null) {
    return { amount: smallestPositive / 1e8, isSelfSend: true, direction: "out" };
  }
  if (aggregatedValue < 0) {
    return { amount: -aggregatedValue, isSelfSend: false, direction: "out" };
  }
  if (aggregatedValue > 0) {
    return { amount: aggregatedValue, isSelfSend: false, direction: "in" };
  }
  return { amount: 0, isSelfSend: false, direction: "none" };
}

function TransactionCard({
  wallet,
  transactionId,
  blockHeight,
  assets,
  rawDeltas,
  getTransactionURL,
}: {
  wallet: Wallet;
  transactionId: string;
  blockHeight?: number;
  assets: Array<{ assetName: string; value: number }>;
  rawDeltas: RawHistoryItem[];
  getTransactionURL: (id: string) => string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const transaction = useTransaction(wallet, transactionId);
  const inputs = useResolvedInputs(wallet, transaction?.vin);

  // Summary uses the aggregated assets[] from the history library, with a
  // self-send refinement using raw deltas. Available immediately, no async.
  const primaryAsset = assets[0];
  const summary = primaryAsset
    ? summarizeAsset(
        rawDeltas,
        transactionId,
        primaryAsset.assetName,
        primaryAsset.value
      )
    : null;

  // The detail panel needs the verbose tx + parent txs for inputs. While
  // those load we keep the compact row visible.
  const detailReady = !!transaction && !!inputs;
  const outputs = transaction ? parseOutputs(transaction.vout ?? []) : [];

  const xnaIn =
    inputs
      ?.filter((i) => i.assetName === "XNA")
      .reduce((acc, i) => acc + i.value, 0) ?? 0;
  const xnaOut = outputs
    .filter((o) => o.assetName === "XNA")
    .reduce((acc, o) => acc + o.value, 0);
  const fee = detailReady ? Math.max(0, xnaIn - xnaOut) : null;

  const time = transaction?.time
    ? new Date(transaction.time * 1000).toLocaleString()
    : null;
  const txURL = getTransactionURL(transactionId);

  const toggle = () => setExpanded((v) => !v);

  return (
    <article className="neurai-card neurai-card--compact text-base-content text-[0.95rem] leading-snug">
      <header className="flex flex-col gap-1 pb-2.5 border-b border-base-300">
        <div className="flex items-baseline justify-between gap-3 flex-wrap min-w-0">
          {time && <time className="font-semibold">{time}</time>}
          {blockHeight !== undefined && (
            <span className="text-sm text-base-content/70 font-mono ml-auto">
              block {blockHeight}
            </span>
          )}
        </div>
        <a
          className="block font-mono text-sm text-primary hover:underline break-all leading-tight"
          href={txURL}
          target="_blank"
          rel="noreferrer"
          title="View in block explorer"
          onClick={(e) => e.stopPropagation()}
        >
          {transactionId}
        </a>
      </header>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`rebel-history-detail-${transactionId}`}
        className="w-full flex items-center gap-2 py-2 m-0 bg-transparent border-0 text-base-content text-[0.95rem] text-left cursor-pointer hover:text-primary transition-colors"
      >
        <span
          className={`inline-flex items-center justify-center w-3.5 text-base-content/70 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          ▸
        </span>
        <span className="flex-1 min-w-0">
          {summary ? (
            <SummaryLine summary={summary} assetName={primaryAsset.assetName} />
          ) : (
            <span>—</span>
          )}
        </span>
        {fee !== null && (
          <span className="text-sm text-base-content/70 whitespace-nowrap shrink-0">
            fee {formatAmount(fee)} XNA
          </span>
        )}
      </button>

      {expanded && !detailReady && (
        <div className="py-2 italic text-base-content/70">
          <small>Loading details…</small>
        </div>
      )}

      {expanded && detailReady && (
        <div
          id={`rebel-history-detail-${transactionId}`}
          className="grid grid-cols-1 md:grid-cols-[1fr_2rem_1fr] gap-2 items-start"
        >
          <section className="min-w-0 flex flex-col">
            <h6 className="m-0 mb-2 text-xs font-bold uppercase tracking-wider text-base-content/70">
              Inputs <span className="font-normal normal-case tracking-normal">({inputs.length})</span>
            </h6>
            <ul className="list-none m-0 p-0 flex flex-col gap-2 flex-1">
              {inputs.map((i, idx) => (
                <li
                  key={`${i.parentTxid}:${i.parentVout}:${idx}`}
                  className="flex flex-col gap-0.5 py-2 border-b border-base-300 last:border-b-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold tabular-nums text-base">
                      {formatAmount(i.value)}
                    </span>
                    <AssetName name={i.assetName} />
                  </div>
                  <div className="font-mono text-sm text-base-content break-all leading-tight">
                    {i.address ?? "(unknown address)"}
                  </div>
                  <div className="font-mono text-xs text-base-content/70">
                    from{" "}
                    <span className="cursor-help" title={`${i.parentTxid}:${i.parentVout}`}>
                      {shortenTxid(i.parentTxid, 6)}:{i.parentVout}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div
            className="hidden md:flex items-start justify-center pt-8 text-primary opacity-70"
            aria-hidden="true"
          >
            <FlowArrow />
          </div>

          <section className="min-w-0 flex flex-col">
            <h6 className="m-0 mb-2 text-xs font-bold uppercase tracking-wider text-base-content/70">
              Outputs <span className="font-normal normal-case tracking-normal">({outputs.length})</span>
            </h6>
            <ul className="list-none m-0 p-0 flex flex-col gap-2 flex-1">
              {outputs.map((o) => (
                <li
                  key={o.index}
                  className="flex flex-col gap-0.5 py-2 border-b border-base-300 last:border-b-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold tabular-nums text-base">
                      {formatAmount(o.value)}
                    </span>
                    <AssetName name={o.assetName} />
                  </div>
                  <div className="font-mono text-sm text-base-content break-all leading-tight">
                    {o.address ?? "(unknown address)"}
                  </div>
                  <div className="font-mono text-xs text-base-content/70">
                    vout {o.index}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </article>
  );
}

function SummaryLine({
  summary,
  assetName,
}: {
  summary: { amount: number; isSelfSend: boolean; direction: "in" | "out" | "none" };
  assetName: string;
}) {
  const verb =
    summary.direction === "in"
      ? "Received"
      : summary.direction === "out"
        ? "Sent"
        : "—";

  return (
    <span className="inline-flex items-center flex-wrap gap-1 min-w-0">
      <span className="font-semibold uppercase tracking-wider text-xs text-base-content/70">
        {verb}
      </span>
      <span className="font-semibold tabular-nums">
        {formatAmount(summary.amount)}
      </span>
      <AssetName name={assetName} />
      {summary.isSelfSend && (
        <span className="text-sm text-base-content/70 italic"> · to self</span>
      )}
    </span>
  );
}

function FlowArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

function parseOutputs(vout: RawTxVout[]): ParsedOutput[] {
  return vout.map((o, i) => {
    const spk = o.scriptPubKey ?? {};
    const address = spk.addresses?.[0] ?? null;
    const assetName = spk.asset?.name ?? "XNA";
    const value = spk.asset?.amount ?? o.value ?? 0;
    return { index: i, address, value, assetName };
  });
}

/**
 * Resolve each input's parent UTXO so we know address, value and asset for
 * inputs (vin alone only carries txid+vout+address+XNA-value, not the asset).
 * Calls share the same getrawtransaction cache used by useTransaction, so
 * repeated parents only hit the RPC once.
 */
function useResolvedInputs(
  wallet: Wallet,
  vin: RawTxVin[] | undefined
): ParsedInput[] | null {
  const [resolved, setResolved] = React.useState<ParsedInput[] | null>(null);

  React.useEffect(() => {
    if (!vin) return;
    if (vin.length === 0) {
      setResolved([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const out = await Promise.all(
        vin.map(async (v): Promise<ParsedInput | null> => {
          if (!v.txid || typeof v.vout !== "number") return null; // coinbase / malformed
          try {
            const parent = (await wallet.rpc("getrawtransaction", [
              v.txid,
              true,
            ])) as ITransaction;
            const parentVout = parent.vout?.[v.vout];
            const spk = parentVout?.scriptPubKey ?? {};
            const address = spk.addresses?.[0] ?? v.address ?? null;
            const assetName = spk.asset?.name ?? "XNA";
            const value = spk.asset?.amount ?? parentVout?.value ?? v.value ?? 0;
            return {
              parentTxid: v.txid,
              parentVout: v.vout,
              address,
              value,
              assetName,
            };
          } catch {
            return {
              parentTxid: v.txid,
              parentVout: v.vout,
              address: v.address ?? null,
              value: v.value ?? 0,
              assetName: "XNA",
            };
          }
        })
      );
      if (cancelled) return;
      setResolved(out.filter((x): x is ParsedInput => x !== null));
    })();

    return () => {
      cancelled = true;
    };
  }, [vin, wallet]);

  return resolved;
}

function shortenTxid(txid: string | null | undefined, chars = 8): string {
  if (!txid) return "";
  if (txid.length <= chars * 2 + 1) return txid;
  return `${txid.slice(0, chars)}…${txid.slice(-chars)}`;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  const fixed = value.toFixed(8);
  return fixed.replace(/\.?0+$/, "");
}
