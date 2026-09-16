import { addAmounts, amountFromInput } from "./exactAmounts";
import React from "react";
import { CoinControl } from "./CoinControl";
import { createCoinControlledTransaction, loadCoinUtxos, selectedTotal, utxoId, type CoinUtxo } from "./coinControlWallet";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { IAsset } from "./Types";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  getAssetBalanceFromMempool,
  getAssetBalanceIncludingMempool,
  isBaseAssetName,
  normalizeAssetName,
  type MempoolAsset,
} from "./utils";
import { Events, triggerEvent } from "./Events";
import { betterAlert, betterConfirm, betterToast } from "./betterDialog";
import { formatNumberWith8Decimals } from "./formatNumberWith8Decimals";

type ValidateAddressResponse = {
  isvalid: boolean;
};

type CreateTransactionResult = {
  debug: {
    amount: number | string;
    assetName: string;
    fee: number | string;
    signedTransaction?: string;
    sentMax?: boolean;
    dustAbsorbedSats?: number;
  };
};

export function Send({
  assets,
  balance,
  mempool,
  wallet,
  active = true,
}: {
  active?: boolean;
  assets: IAsset[];
  balance: number | string;
  mempool: MempoolAsset[] | null;
  wallet: Wallet;
}) {
  const defaultValueAssets = "-";
  const [to, setTo] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [asset, setAsset] = React.useState(defaultValueAssets);
  const [showQRCode, setShowQRCode] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [coinControl, setCoinControl] = React.useState(false);
  const [utxos, setUtxos] = React.useState<CoinUtxo[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loadingUtxos, setLoadingUtxos] = React.useState(false);
  const [utxoError, setUtxoError] = React.useState<string | null>(null);
  const [refreshUtxos, setRefreshUtxos] = React.useState(0);
  // True when the user pressed "Max" and hasn't manually edited the amount
  // since. Tells onSubmit to compute (balance − fee) at send time so the
  // wallet drains without leaving dust.
  const [isMaxIntent, setIsMaxIntent] = React.useState(false);
  const walletBaseCurrency =
    typeof wallet.baseCurrency === "string" && wallet.baseCurrency.trim().length > 0
      ? wallet.baseCurrency
      : "XNA";
  const baseCurrencyLabel = normalizeAssetName(walletBaseCurrency) || "XNA";

  const hasSelectedAsset =
    typeof asset === "string" && asset.trim().length > 0 && asset !== defaultValueAssets;
  const selectedUtxos = utxos.filter(u => selected.has(utxoId(u)));
  const fundingAsset = hasSelectedAsset ? asset : walletBaseCurrency;
  const selectedAmount = selectedTotal(selectedUtxos, fundingAsset);
  const isSendButtenDisabled = isBusy || !hasSelectedAsset ||
    (coinControl && (loadingUtxos || !!utxoError || !selectedUtxos.length || selectedAmount === "0"));

  React.useEffect(() => {
    let cancelled = false;
    setSelected(new Set());
    setIsMaxIntent(false);
    setUtxos([]);
    setUtxoError(null);
    if (!coinControl) return;
    setLoadingUtxos(true);
    loadCoinUtxos(wallet).then(items => {
      if (!cancelled) setUtxos(items.filter(u => u.assetName === fundingAsset || u.assetName === walletBaseCurrency));
    }).catch(error => {
      if (!cancelled) setUtxoError(error instanceof Error ? error.message : "Unable to load UTXOs. Try refreshing.");
    }).finally(() => { if (!cancelled) setLoadingUtxos(false); });
    return () => { cancelled = true; };
  }, [wallet, fundingAsset, walletBaseCurrency, coinControl, refreshUtxos]);

  React.useEffect(() => {
    if (coinControl && isMaxIntent) setAmount(selectedAmount);
  }, [coinControl, selectedAmount, isMaxIntent]);

  function onResult(value: string | null) {
    setTo(value ?? "");
    setShowQRCode(false);
  }
  React.useEffect(() => {
    if (!active) setShowQRCode(false);
  }, [active]);
  const qr = useQRReader(showQRCode && active, onResult);

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (isSendButtenDisabled) return;
    try {
      amountFromInput(amount);
    } catch {
      betterAlert(
        "Not a valid number",
        amount + " does not seem like a valid number"
      );
      return;
    }

    const clearForm = () => {
      setTo("");
      setAmount("");
      setAsset(defaultValueAssets);
      setIsMaxIntent(false);
      setSelected(new Set());
      setRefreshUtxos(n => n + 1);
      triggerEvent(Events.INFO__TRANSFER_IN_PROCESS);
      betterToast("✓ Success");
    };

    if (!hasSelectedAsset) {
      betterAlert("Select an asset", "Please choose an asset before sending.");
      return;
    }

    const assetToSend = isBaseAssetName(asset, baseCurrencyLabel)
      ? walletBaseCurrency
      : asset;

    if (!assetToSend || assetToSend === defaultValueAssets) {
      betterAlert("Select an asset", "Please choose a valid asset before sending.");
      return;
    }

    setIsBusy(true);

    // When the user pressed "Max" on the base currency, delegate the drain
    // logic to the wallet via `sendMax: true`. jswallet ≥0.14 builds a
    // single-output tx with `amount = balance − fee` computed in satoshis
    // (no float drift), absorbs sub-dust residue into the miner fee, and
    // returns the actual amount + fee in `debug` for the confirm dialog.
    const useSendMax = isMaxIntent && assetToSend === walletBaseCurrency;
    try {
      const validation = await wallet.rpc("validateaddress", [to]) as ValidateAddressResponse;
      if (!validation.isvalid) {
        betterAlert("Error", to + " does not seem to be a valid address");
        return;
      }
      await send({
        wallet, to, asset: assetToSend, amount, clearForm,
        sendMax: useSendMax,
        selectedUtxos: coinControl ? selectedUtxos : undefined,
      });
    } catch (error) {
      betterAlert("Error", error instanceof Error ? error.message : "Unable to prepare transaction.");
    } finally {
      setIsBusy(false);
    }
  }
  const allAssets = getAssetBalanceIncludingMempool(wallet, assets, mempool);
  const options = (
    <AssetOptions wallet={wallet} allAssets={allAssets}></AssetOptions>
  );
  const displayBalance =
    addAmounts(balance, getAssetBalanceFromMempool(baseCurrencyLabel, mempool));

  function formatAmountForInput(n: number | string): string {
    if (typeof n === "string") return n;
    if (typeof n !== "number" || Number.isNaN(n)) return "";
    const safe = Math.max(0, n);
    const str = "" + safe;
    return str.indexOf("e") > -1 ? safe.toFixed(8) : str;
  }

  // Max is only an intent: we put the full balance in the input and remember
  // that the user wants to drain. The actual (balance − fee) calculation
  // happens at send time, when we already have the destination address.
  function maxButtonEventHandler(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (!hasSelectedAsset || isBusy || (coinControl && (loadingUtxos || !!utxoError))) return;

    const isBase = isBaseAssetName(asset, baseCurrencyLabel);
    const newAmount = coinControl ? selectedAmount : isBase ? balance : allAssets[asset];
    setAmount(formatAmountForInput(newAmount));
    setIsMaxIntent(true);
  }
  function MaxButton() {
    return (
      <a
        href="#"
        className="ml-2 text-sm text-primary underline"
        onClick={maxButtonEventHandler}
      >
        Max
      </a>
    );
  }
  return (
    <div className={coinControl ? "grid grid-cols-1 lg:grid-cols-2 gap-5 items-start" : ""}>
      {coinControl && <CoinControl
        utxos={utxos} selected={selected} asset={fundingAsset} baseCurrency={walletBaseCurrency}
        loading={loadingUtxos} error={utxoError} disabled={isBusy}
        onRefresh={() => setRefreshUtxos(n => n + 1)}
        onClear={() => setSelected(new Set())}
        onSelectAll={() => setSelected(new Set(utxos.map(utxoId)))}
        onToggle={id => setSelected(current => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        })}
      />}
    <div className="neurai-card neurai-stack min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <h5 className="neurai-card__title">Send / transfer / pay</h5>
      <button type="button"
        className={coinControl ? "neurai-btn--secondary border-primary" : "neurai-btn--secondary"}
        disabled={isBusy} aria-pressed={coinControl}
        aria-expanded={coinControl} aria-controls="coin-control-panel"
        onClick={() => {
          setCoinControl(open => !open);
          setSelected(new Set());
          setIsMaxIntent(false);
          if (!hasSelectedAsset) setAsset(baseCurrencyLabel);
        }}>Coin Control</button>
      </div>
      {coinControl && <p className="neurai-hint m-0" role="status">
        Selected: {formatNumberWith8Decimals(selectedAmount)} {fundingAsset} · before fees. Max uses this selection.
      </p>}
      {qr}
      {showQRCode === false && (
        <button
          type="button"
          className="neurai-btn--secondary self-start"
          disabled={isBusy}
          onClick={() => setShowQRCode(true)}
        >
          Scan QR code
        </button>
      )}
      <form onSubmit={onSubmit}>
        <fieldset disabled={isBusy} className="flex flex-col gap-3 min-w-0">
        <div>
          <label htmlFor="send-asset" className="neurai-label">Asset</label>
          <select
            id="send-asset"
            className="neurai-select"
            onChange={(event) => { setAsset(event.target.value || defaultValueAssets); setSelected(new Set()); setIsMaxIntent(false); }}
            value={asset}
          >
            <option value={defaultValueAssets}>{defaultValueAssets}</option>
            <option value={baseCurrencyLabel}>
              {baseCurrencyLabel} (base currency) ({displayBalance})
            </option>
            {options}
          </select>
        </div>
        <div>
          <label htmlFor="send-amount" className="neurai-label">
            Amount <MaxButton />
          </label>
          <input
            id="send-amount"
            className="neurai-input"
            onChange={(event) => {
              setAmount(event.target.value);
              setIsMaxIntent(false);
            }}
            type="text"
            value={amount}
          />
        </div>
        <div>
          <label htmlFor="send-to" className="neurai-label">To</label>
          <input
            id="send-to"
            name="to"
            className="neurai-input"
            onChange={(event) => setTo(event.target.value)}
            value={to}
            type="text"
          />
        </div>

        <button
          type="submit"
          className="neurai-btn--primary"
          disabled={isSendButtenDisabled}
          aria-busy={isBusy}
        >
          Send
        </button>
        </fieldset>
      </form>
    </div>
    </div>
  );
}

/** Keep the draft and Coin Control selection mounted when navigating between panels. */
export function SendPanel({ active, ...props }: React.ComponentProps<typeof Send> & { active: boolean }) {
  const walletKey = `${props.wallet.network}:${props.wallet.getAddresses()[0]}`;
  return <div hidden={!active}><Send key={walletKey} {...props} active={active} /></div>;
}

interface IAssetOptionsProps {
  wallet: Wallet;
  allAssets: { [key: string]: number | string };
}
function AssetOptions({ wallet, allAssets }: IAssetOptionsProps) {
  const options = Object.keys(allAssets).map((assetName: string) => {
    const balance = allAssets[assetName];
    //Ignore base currency, such as RVN
    if (isBaseAssetName(assetName, wallet.baseCurrency)) {
      return null;
    }

    if (balance === 0) {
      return null;
    }
    const balanceDisplay = formatNumberWith8Decimals(balance);

    return (
      <option key={assetName} value={assetName}>
        {assetName} - ({balanceDisplay})
      </option>
    );
  });

  return options;
}
function useQRReader(showQRCode: boolean, onResult: (value: string | null) => void) {
  const [qr, setQR] = React.useState(<></>);
  const [mode, setMode] = React.useState<"environment" | "user">("environment");
  React.useEffect(() => {
    if (showQRCode === false) {
      setQR(<></>);
    } else {
      const q = (
        <div>
          <Scanner
            key={"qr" + new Date().toISOString()}
            constraints={{
              facingMode: mode,
            }}
            scanDelay={100}
            onScan={(codes) => {
              const value = codes[0]?.rawValue;
              if (value) {
                onResult(value);
              }
            }}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="neurai-btn--secondary flex-1"
              onClick={() => {
                const newMode = mode === "environment" ? "user" : "environment";
                setMode(newMode);
              }}
            >
              Toggle mode
            </button>
            <button
              type="button"
              onClick={() => onResult("")}
              className="neurai-btn--secondary flex-1"
            >
              Close camera
            </button>
          </div>
        </div>
      );
      setQR(q);
    }
  }, [showQRCode, mode]);

  return qr;
}

/**
 *
 * Two steps to send
 *
 * ONE, create a transaction and ask the user to confirm and accept the transfer and its fees
 * TWO, broadcast the actual transaction
 *
 * @returns
 */
export async function send({
  wallet,
  to,
  asset,
  amount,
  clearForm,
  sendMax,
  selectedUtxos,
}: {
  wallet: Wallet;
  to: string;
  asset: string;
  amount: string;
  clearForm: () => void;
  sendMax?: boolean;
  selectedUtxos?: CoinUtxo[];
}) {
  // For `sendMax` mode the wallet computes the amount itself
  // (balance − fee in satoshis, no float drift) so we don't pass `amount`.
  const txOptions: {
    toAddress: string;
    assetName: string;
    amount?: number | string;
    sendMax?: boolean;
  } = sendMax
    ? { toAddress: to, assetName: asset, sendMax: true }
    : { toAddress: to, assetName: asset, amount: amountFromInput(amount) };

  const promise = selectedUtxos
    ? createCoinControlledTransaction(wallet, txOptions, selectedUtxos)
    : wallet.createTransaction(txOptions);

  try {
    await promise;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    betterAlert("Error", errorMessage);
    return;
  }

  const sendResult = (await promise) as CreateTransactionResult;
  // For sendMax, use the wallet-computed amount (the actual amount that
  // lands at the recipient = balance − fee). For regular sends, echo what
  // the user typed.
  const displayedAmount = sendMax
    ? sendResult.debug.amount.toString()
    : amount;
  const dustLine =
    sendMax && sendResult.debug.dustAbsorbedSats
      ? `\n(Dust ${sendResult.debug.dustAbsorbedSats} sats absorbed into fee)`
      : "";
  const confirmText = `Do you want to send ${displayedAmount} ${asset} to
${to}?

Transaction fee: ${String(sendResult.debug.fee)} ${wallet.baseCurrency}${dustLine}`;
  // const c = confirm(confirmText);
  const c = await betterConfirm("About to send", confirmText);
  if (c === true) {
    try {
      const raw = sendResult.debug.signedTransaction;
      if (raw) {
        await wallet.sendRawTransaction(raw);
        clearForm();
      }
    } catch (e) {
      console.error(e);

      betterAlert("Error", e instanceof Error ? e.message : JSON.stringify(e));
    }
  }

  return false;
}
