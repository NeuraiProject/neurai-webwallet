import React from "react";

export function ReceiveAddress({ receiveAddress }: { receiveAddress: string }) {
  const [confirm, setConfirm] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(receiveAddress);
    setConfirm(true);
    setTimeout(() => setConfirm(false), 1500);
  };
  return (
    <div className="neurai-card">
      <h5 className="neurai-card__title mb-4">Receive address</h5>
      <div className="flex flex-col items-center gap-3">
        <label className="flex flex-col items-center gap-2">
          {receiveAddress && (
            <img
              className="max-w-[400px] w-full h-auto rounded-md bg-white p-2"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${receiveAddress}`}
              alt="Receive address QR"
            />
          )}
          <small className="font-mono text-sm break-all text-center">{receiveAddress}</small>
        </label>
        <button type="button" className="neurai-btn--primary" onClick={copy}>
          {confirm ? "😀 Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
