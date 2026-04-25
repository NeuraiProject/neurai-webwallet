import React from "react";
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
    amount: number;
    assetName: string;
    fee: number;
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
}: {
  assets: IAsset[];
  balance: number;
  mempool: MempoolAsset[] | null;
  wallet: Wallet;
}) {
  const defaultValueAssets = "-";
  const [to, setTo] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [asset, setAsset] = React.useState(defaultValueAssets);
  const [showQRCode, setShowQRCode] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
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
  const isSendButtenDisabled = isBusy === true || !hasSelectedAsset;

  function onResult(value: string | null) {
    setTo(value ?? "");
    setShowQRCode(false);
  }
  const qr = useQRReader(showQRCode, onResult);

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (isNaN(parseFloat(amount)) === true) {
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
      triggerEvent(Events.INFO__TRANSFER_IN_PROCESS);
      betterToast("✓ Success");
    };

    //Validate that "to address" is a valid address
    const validateAddressResponse = (await wallet.rpc("validateaddress", [to])) as ValidateAddressResponse;

    if (validateAddressResponse.isvalid === false) {
      betterAlert("Error", to + " does not seem to be a valid address");
      return false;
    }

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
    const promise = send({
      wallet,
      to,
      asset: assetToSend,
      amount,
      clearForm,
      sendMax: useSendMax,
    });
    promise.catch(() => {
      //Do nothing);
    });
    promise.finally(() => {
      setIsBusy(false);
    });
  }
  const allAssets = getAssetBalanceIncludingMempool(wallet, assets, mempool);
  const options = (
    <AssetOptions wallet={wallet} allAssets={allAssets}></AssetOptions>
  );
  const displayBalance =
    balance + getAssetBalanceFromMempool(baseCurrencyLabel, mempool);

  function formatAmountForInput(n: number): string {
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
    if (!hasSelectedAsset || isBusy) return;

    const isBase = isBaseAssetName(asset, baseCurrencyLabel);
    const newAmount = isBase ? balance : allAssets[asset];
    setAmount(formatAmountForInput(newAmount));
    setIsMaxIntent(isBase);
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
    <div className="neurai-card neurai-stack">
      <h5 className="neurai-card__title">Send / transfer / pay</h5>
      {qr}
      {showQRCode === false && (
        <button
          type="button"
          className="neurai-btn--secondary self-start"
          onClick={() => setShowQRCode(true)}
        >
          Scan QR code
        </button>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className="neurai-label">Asset</label>
          <select
            className="neurai-select"
            onChange={(event) => setAsset(event.target.value || defaultValueAssets)}
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
          <label className="neurai-label">
            Amount <MaxButton />
          </label>
          <input
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
          <label className="neurai-label">To</label>
          <input
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
      </form>
    </div>
  );
}

interface IAssetOptionsProps {
  wallet: Wallet;
  allAssets: { [key: string]: number };
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
async function send({
  wallet,
  to,
  asset,
  amount,
  clearForm,
  sendMax,
}: {
  wallet: Wallet;
  to: string;
  asset: string;
  amount: string;
  clearForm: () => void;
  sendMax?: boolean;
}) {
  // For `sendMax` mode the wallet computes the amount itself
  // (balance − fee in satoshis, no float drift) so we don't pass `amount`.
  const txOptions: {
    toAddress: string;
    assetName: string;
    amount?: number;
    sendMax?: boolean;
  } = sendMax
    ? { toAddress: to, assetName: asset, sendMax: true }
    : { toAddress: to, assetName: asset, amount: parseFloat(amount) };

  const promise = wallet.createTransaction(txOptions as any);

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

Transaction fee: ${sendResult.debug.fee.toFixed(4)} ${wallet.baseCurrency}${dustLine}`;
  // const c = confirm(confirmText);
  const c = await betterConfirm("About to send", confirmText);
  if (c === true) {
    try {
      const raw = sendResult.debug.signedTransaction;
      if (raw) {
        const promise = wallet.sendRawTransaction(raw);
        console.log("Send raw transaction promise", promise);
        promise
          .then(() => {
            clearForm();
          })
          .catch((e) => {
            const isTxSize = JSON.stringify(e).indexOf("64: tx-size") > -1;
            if (isTxSize) {
              betterAlert(
                "Error",
                "Oops the transaction was too big, try sending a smaller amount"
              );
            } else {
              console.log("Error when broadcasting transaction", e + "", e);
              betterAlert("Error", "" + e && JSON.stringify(e.error, null, 4));
            }
          });
      }
    } catch (e) {
      console.error(e);

      betterAlert("Error", "" + e && JSON.stringify(e.error, null, 4));
    }
  }

  return false;
}
