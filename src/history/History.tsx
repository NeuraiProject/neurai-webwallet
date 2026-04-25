import React from "react";
import { getHistory } from "@neuraiproject/neurai-history-list";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { AssetName } from "../AssetName";
import { useTransaction } from "../useTransaction";
import networkInfo from "../networkInfo";
import "./History.css";

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

export function History({ blockCount, wallet }: IProps) {
  const [history, setHistory] = React.useState<RawHistoryItem[]>([]);

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

  const networkKey = wallet.network as keyof typeof networkInfo;
  const network = networkInfo[networkKey] ?? networkInfo.xna;

  return (
    <div className="rebel-history">
      {items.slice(0, 21).map((item) => (
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
    <article className="rebel-history__tx">
      <header className="rebel-history__tx-header">
        <div className="rebel-history__tx-header-row">
          <div className="rebel-history__tx-header-main">
            {time && <time className="rebel-history__tx-time">{time}</time>}
            {blockHeight !== undefined && (
              <span className="rebel-history__tx-block">block {blockHeight}</span>
            )}
          </div>
          {fee !== null && (
            <span className="rebel-history__tx-fee">
              fee {formatAmount(fee)} XNA
            </span>
          )}
        </div>
        <a
          className="rebel-history__tx-id"
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
        className="rebel-history__tx-summary"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`rebel-history-detail-${transactionId}`}
      >
        <span
          className={
            "rebel-history__tx-summary-chevron" +
            (expanded ? " rebel-history__tx-summary-chevron--open" : "")
          }
          aria-hidden="true"
        >
          ▸
        </span>
        {summary ? (
          <SummaryLine summary={summary} assetName={primaryAsset.assetName} />
        ) : (
          <span className="rebel-history__tx-summary-text">—</span>
        )}
      </button>

      {expanded && !detailReady && (
        <div className="rebel-history__tx-detail-loading">
          <small>Loading details…</small>
        </div>
      )}

      {expanded && detailReady && (
        <div
          id={`rebel-history-detail-${transactionId}`}
          className="rebel-history__io"
        >
        <section className="rebel-history__io-col">
          <h6 className="rebel-history__io-title">
            Inputs <span className="rebel-history__io-count">({inputs.length})</span>
          </h6>
          <ul className="rebel-history__io-list">
            {inputs.map((i, idx) => (
              <li
                key={`${i.parentTxid}:${i.parentVout}:${idx}`}
                className="rebel-history__io-row rebel-history__io-row--in"
              >
                <div className="rebel-history__io-row-amount">
                  <span className="rebel-history__io-value">
                    {formatAmount(i.value)}
                  </span>
                  <AssetName name={i.assetName} />
                </div>
                <div className="rebel-history__io-row-addr">
                  {i.address ?? "(unknown address)"}
                </div>
                <div className="rebel-history__io-row-meta">
                  from{" "}
                  <span className="rebel-history__io-utxo" title={`${i.parentTxid}:${i.parentVout}`}>
                    {shortenTxid(i.parentTxid, 6)}:{i.parentVout}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="rebel-history__io-flow" aria-hidden="true">
          <FlowArrow />
        </div>

        <section className="rebel-history__io-col">
          <h6 className="rebel-history__io-title">
            Outputs <span className="rebel-history__io-count">({outputs.length})</span>
          </h6>
          <ul className="rebel-history__io-list">
            {outputs.map((o) => (
              <li key={o.index} className="rebel-history__io-row rebel-history__io-row--out">
                <div className="rebel-history__io-row-amount">
                  <span className="rebel-history__io-value">
                    {formatAmount(o.value)}
                  </span>
                  <AssetName name={o.assetName} />
                </div>
                <div className="rebel-history__io-row-addr">
                  {o.address ?? "(unknown address)"}
                </div>
                <div className="rebel-history__io-row-meta">vout {o.index}</div>
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
    <span className="rebel-history__tx-summary-text">
      <span className="rebel-history__tx-summary-verb">{verb}</span>{" "}
      <span className="rebel-history__tx-summary-amount">
        {formatAmount(summary.amount)}
      </span>{" "}
      <AssetName name={assetName} />
      {summary.isSelfSend && (
        <span className="rebel-history__tx-summary-flag"> · to self</span>
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
      className="rebel-history__io-flow-icon"
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
