import React from "react";
import "./ReceiveAddress.css";

export function ReceiveAddress({ receiveAddress }: { receiveAddress: string }) {
  const [confirm, setConfirm] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(receiveAddress);
    setConfirm(true);
    setTimeout(() => setConfirm(false), 1500); //Reset confirm status after 2 seconds
  };
  return (
    <article>
      <h5>Receive address</h5>
      <div className="rebel-receive__container">
        <label className="rebel-receive__label">
          <img
            className="rebel-receive__qr"
            src={
              receiveAddress
                ? "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" +
                  receiveAddress
                : ""
            }
          />
          <small className="rebel-receive__address">
            {receiveAddress}
          </small>
        </label>
        {confirm === true && (
            <button onClick={copy}>😀</button>
          )}
        {confirm === false && <button onClick={copy}>Copy</button>}
      </div>
    </article>
  );
}
