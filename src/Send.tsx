import React from "react";
import { Wallet } from "@ravenrebels/ravencoin-jswallet";
import { IAsset } from "./Types";
import { QrReader } from "react-qr-reader";
import {
  getAssetBalanceFromMempool,
  getAssetBalanceIncludingMempool,
} from "./utils";
import { Events, triggerEvent } from "./Events";
import { betterAlert, betterConfirm, betterToast } from "./betterDialog";
export function Send({
  assets,
  balance,
  mempool,
  wallet,
}: {
  assets: IAsset[];
  balance: number;
  mempool: any;
  wallet: Wallet;
}) {
  const defaultValueAssets = "-";
  const [to, setTo] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [asset, setAsset] = React.useState(defaultValueAssets);
  const [showQRCode, setShowQRCode] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);

  const isSendButtenDisabled = isBusy === true || defaultValueAssets === asset;

  function onResult(to) {
    setTo(to);
    setShowQRCode(false);
  }
  const qr = useQRReader(showQRCode, onResult);

  const send = async () => {
    const promise = wallet.createTransaction({
      toAddress: to,
      assetName: asset,
      amount: parseFloat(amount),
    });

    try {
      await promise;
    } catch (e) {
      betterAlert("Error", "" + e);
      return;
    }

    const sendResult = await promise;
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
              setTo("");
              setAmount("");
              setAsset("");
              triggerEvent(Events.INFO__TRANSFER_IN_PROCESS);
              betterToast("✓ Success");
            })
            .catch((e) => {
              const isTxSize = JSON.stringify(e).indexOf("64: tx-size") > -1;
              if (isTxSize) {
                betterAlert(
                  "Error",
                  "Oops the transaction was to big, try sending a smaller amount"
                );
              } else {
                console.log("Error when broadcasting transaction", e + "", e);
                betterAlert(
                  "Error",
                  "" + e && JSON.stringify(e.error, null, 4)
                );
              }
            });
        }
      } catch (e) {
        console.error(e);

        betterAlert("Error", "" + e && JSON.stringify(e.error, null, 4));
      }
    }

    return false;
  };

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
    //Validate that "to address" is a valid address
    const validateAddressResponse = await wallet.rpc("validateaddress", [to]);

    if (validateAddressResponse.isvalid === false) {
      betterAlert("Error", to + " does not seem to be a valid address");
      return false;
    }

    setIsBusy(true);
    const promise = send();
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
    balance + getAssetBalanceFromMempool(wallet.baseCurrency, mempool);
  return (
    <article>
      <h5>Send / transfer / pay</h5>
      {qr}
      {showQRCode === false && (
        <button
          className="secondary"
          style={{ maxWidth: 200 }}
          onClick={() => setShowQRCode(true)}
        >
          Scan QR code
        </button>
      )}
      <form onSubmit={onSubmit}>
        <label>
          Asset
          <select
            onChange={(event) => setAsset(event.target.value)}
            value={asset}
          >
            <option>{defaultValueAssets}</option>
            <option value={wallet.baseCurrency}>
              {wallet.baseCurrency} ({displayBalance})
            </option>
            {options}
          </select>
        </label>
        <label>
          Amount
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
    //Ignore base currency, such as XNA
    if (wallet.baseCurrency === assetName) {
      return null;
    }
    if (balance > 0) {
      const balanceDisplay = balance.toLocaleString();
      if (balanceDisplay === "0") {
        return null;
      }
      return (
        <option key={assetName} value={assetName}>
          {assetName} - ({balance})
        </option>
      );
    }
    return null;
  });

  return options;
}
function useQRReader(
  showQRCode: boolean,
  onResult: (value: string | null) => void
) {
  const [qr, setQR] = React.useState(<></>);
  const [mode, setMode] = React.useState("environment");
  React.useEffect(() => {
    if (showQRCode === false) {
      setQR(<></>);
    } else {
      const q = (
        <div>
          <QrReader
            key={"qr" + new Date().toISOString()}
            constraints={{
              facingMode: mode,
            }}
            scanDelay={100}
            onResult={(result, error) => {
              if (!!result) {
                //@ts-ignore
                onResult(result?.text);
              }

              if (!!error) {
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
