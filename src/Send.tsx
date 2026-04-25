import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { IAsset } from "./Types";
import { Scanner } from "@yudiel/react-qr-scanner";
import "./Send.css";
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
    fee: number;
    signedTransaction?: string;
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
    //Validate amount
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
    const promise = send({ wallet, to, asset: assetToSend, amount, clearForm });
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

  function maxButtonEventHandler(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (!hasSelectedAsset) {
      return;
    }
    const newAmount = isBaseAssetName(asset, baseCurrencyLabel)
      ? displayBalance
      : allAssets[asset];
    if (typeof newAmount !== "number" || Number.isNaN(newAmount)) {
      return;
    }
    const str = "" + newAmount;
    //Check for exponential notation
    //The value 1e8 should be displayed to the user as 0.00000001

    if (str.indexOf("e") > -1) {
      setAmount(newAmount.toFixed(8));
    } else {
      setAmount(str);
    }
  }
  function MaxButton() {
    return (
      <a
        href="#"
        className="rebel-send__max-link"
        onClick={maxButtonEventHandler}
      >
        Max
      </a>
    );
  }
  return (
    <article>
      <h5>Send / transfer / pay</h5>
      {qr}
      {showQRCode === false && (
        <button
          className="secondary"
          className="secondary rebel-send__scan-qr-button"
          onClick={() => setShowQRCode(true)}
        >
          Scan QR code
        </button>
      )}
      <form onSubmit={onSubmit}>
        <label>
          Asset
          <select
            onChange={(event) => setAsset(event.target.value || defaultValueAssets)}
            value={asset}
          >
            <option value={defaultValueAssets}>{defaultValueAssets}</option>
            <option value={baseCurrencyLabel}>
              {baseCurrencyLabel} (base currency) ({displayBalance})
            </option>
            {options}
          </select>
        </label>
        <label>
          Amount <MaxButton />
          <input
            onChange={(event) => setAmount(event.target.value)}
            type="text"
            value={amount}
          ></input>
        </label>
        <label>
          To
          <input
            name="to"
            onChange={(event) => setTo(event.target.value)}
            value={to}
            type="text"
          />
        </label>

        <button disabled={isSendButtenDisabled} aria-busy={isBusy}>
          Send
        </button>
      </form>
    </article>
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
          <div className="grid">
            <button
              className="secondary"
              onClick={() => {
                const newMode = mode === "environment" ? "user" : "environment";

                setMode(newMode);
              }}
            >
              Toggle mode
            </button>
            <button onClick={() => onResult("")} className="secondary">
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
}: {
  wallet: Wallet;
  to: string;
  asset: string;
  amount: string;
  clearForm: () => void;
}) {
  const promise = wallet.createTransaction({
    toAddress: to,
    assetName: asset,
    amount: parseFloat(amount),
  });

  try {
    await promise;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    betterAlert("Error", errorMessage);
    return;
  }

  const sendResult = (await promise) as CreateTransactionResult;
  //Yes template literals combined, to avoid the headache of new lines getting indented
  const confirmText = `Do you want to send ${amount} ${asset} to 
${to}?

Transaction fee: ${sendResult.debug.fee.toFixed(4)} ${wallet.baseCurrency}`;
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
