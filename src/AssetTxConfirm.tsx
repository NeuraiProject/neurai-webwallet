import React from "react";

import { formatNumberWith8Decimals } from "./formatNumberWith8Decimals";

/** What the wallet gives back for an asset operation that was signed, not sent. */
export interface PreparedAssetTx {
  transactionId: string | null;
  signedTransaction: string;
  fee: number;
  burnAmount: number;
  changeAmount: number | null;
  changeAddress: string | null;
  outputs: Array<Record<string, unknown>>;
}

export interface OutputLine {
  address: string;
  amount: number;
  assetName?: string;
}

/**
 * Reads the outputs into something a person can check.
 *
 * The builders describe an output in more than one shape depending on the
 * operation, so this reads the fields it recognises and skips what it cannot
 * make sense of rather than inventing a line.
 */
export function describeOutputs(outputs: Array<Record<string, unknown>>): OutputLine[] {
  const lines: OutputLine[] = [];
  for (const output of outputs ?? []) {
    const address =
      (typeof output.address === "string" && output.address) ||
      (Array.isArray(output.addresses) && typeof output.addresses[0] === "string" ? output.addresses[0] : "");
    if (!address) continue;

    const asset = output.asset as { name?: unknown; amount?: unknown } | undefined;
    if (asset && typeof asset.name === "string") {
      lines.push({
        address,
        assetName: asset.name,
        amount: typeof asset.amount === "number" ? asset.amount : 0,
      });
      continue;
    }

    const value = typeof output.value === "number" ? output.value : typeof output.amount === "number" ? output.amount : null;
    if (value === null) continue;
    lines.push({ address, amount: value });
  }
  return lines;
}

/**
 * Review step for an asset operation.
 *
 * Shown BEFORE anything reaches the network. The transaction has been built and
 * signed at this point, which is what makes the fee and the burn real numbers
 * rather than estimates — but it has not been broadcast, so Cancel genuinely
 * cancels. Modelled on the addon's confirm window, which shows the outputs and
 * keeps the raw hex one click away.
 */
export function AssetTxConfirm({
  title,
  assetName,
  prepared,
  busy,
  error,
  onCancel,
  onBroadcast,
}: {
  title: string;
  assetName: string;
  prepared: PreparedAssetTx;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onBroadcast: () => void;
}) {
  const [showRaw, setShowRaw] = React.useState(false);
  const outputs = React.useMemo(() => describeOutputs(prepared.outputs), [prepared.outputs]);
  const total = prepared.fee + prepared.burnAmount;

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="asset-tx-title">
      <div className="neurai-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] opacity-50 m-0">Review before sending</p>
        <h5 className="neurai-card__title mt-1 mb-1" id="asset-tx-title">
          {title}
        </h5>
        <p className="text-sm opacity-70 mt-0 mb-4">
          Nothing has been sent yet. Once broadcast, this cannot be reversed.
        </p>

        <dl className="m-0 mb-4 rounded-field border border-base-300 overflow-hidden">
          <Row label="Asset" value={assetName} />
          <Row label="Network fee" value={`${formatNumberWith8Decimals(prepared.fee)} XNA`} />
          {prepared.burnAmount > 0 && (
            <Row label="Burned" value={`${formatNumberWith8Decimals(prepared.burnAmount)} XNA`} emphasis />
          )}
          <Row label="Total cost" value={`${formatNumberWith8Decimals(total)} XNA`} emphasis />
          {prepared.changeAmount !== null && prepared.changeAddress && (
            <Row label="Change" value={`${formatNumberWith8Decimals(prepared.changeAmount)} XNA`} />
          )}
        </dl>

        {outputs.length > 0 && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] opacity-50 m-0 mb-2">Outputs</p>
            <div className="rounded-field border border-base-300 overflow-hidden mb-4">
              {outputs.map((out, i) => (
                <div key={`${out.address}-${i}`} className="flex justify-between gap-3 px-3 py-2 border-b border-base-300 last:border-b-0 text-sm">
                  <code className="font-mono text-xs break-all opacity-80">{out.address}</code>
                  <span className="tabular-nums whitespace-nowrap font-semibold">
                    {formatNumberWith8Decimals(out.amount)} {out.assetName ?? "XNA"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          className="text-xs font-semibold text-primary bg-transparent border-0 cursor-pointer p-0 mb-2"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
        >
          {showRaw ? "Hide raw transaction" : "Show raw transaction"}
        </button>
        {showRaw && (
          <code className="block font-mono text-[11px] break-all opacity-70 max-h-40 overflow-auto mb-3">
            {prepared.signedTransaction}
          </code>
        )}

        {error && <p className="text-error text-sm mt-0 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" className="neurai-btn--secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="neurai-btn--primary" onClick={onBroadcast} disabled={busy}>
            {busy ? "Broadcasting…" : "Broadcast"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2 border-b border-base-300 last:border-b-0 text-sm">
      <dt className="m-0 opacity-70">{label}</dt>
      <dd className={`m-0 tabular-nums ${emphasis ? "font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}
