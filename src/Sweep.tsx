import { Wallet } from "@neuraiproject/neurai-jswallet";
import React, { SyntheticEvent } from "react";
import { QRCameraContainer } from "./QRCameraContainer";

export function Sweep({ wallet }: { wallet: Wallet }) {
  const [privateKey, setPrivateKey] = React.useState("");
  const onSubmit = function (event: SyntheticEvent) {
    event.preventDefault();
  };
  const sweep = async () => {
    try {
      const onlineMode = true;
      const asdf = await wallet.sweep(privateKey, onlineMode);
      if (asdf.errorDescription) {
        alert(asdf.errorDescription);
        return;
      }
      const text = JSON.stringify(asdf.outputs, null, 4);
      alert("SUCCESS " + text);
      document.getElementById("mempool")?.focus();
    } catch (e) {
      console.log("SWEEP error", e);
      alert("Something went wrong " + JSON.stringify(e, null, 4));
    }
  };
  return (
    <div className="neurai-card neurai-stack">
      <h5 className="neurai-card__title">Sweep (experimental)</h5>
      <p className="m-0 text-sm text-base-content/80">
        Transfer the entire balance of a private key to your wallet
      </p>
      <QRCameraContainer onChange={setPrivateKey} />
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label>
          <span className="neurai-label">Private Key (not address)</span>
          <input
            type="text"
            name="privateKey"
            className="neurai-input"
            value={privateKey}
            onChange={(event) => setPrivateKey(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="neurai-btn--primary"
          onClick={sweep}
          disabled={!privateKey}
        >
          Sweep
        </button>
      </form>
    </div>
  );
}
