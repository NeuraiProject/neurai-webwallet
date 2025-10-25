import React from "react";

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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
          }}
        >
          <img
            style={{
              width: "90%",
              maxWidth: "400px",
              marginBottom: 20,
              padding: "10px",
              background: "white",
              borderRadius: "10px",
            }}
            src={
              receiveAddress
                ? "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" +
                  receiveAddress
                : ""
            }
          />
          <small style={{ textAlign: "center", wordBreak: "break-all", fontSize: "calc(1em + 2pt)" }}>
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
