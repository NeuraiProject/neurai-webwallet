import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

/**
 * Finds which derivation produced an address.
 *
 * Returns null when the address is not among the wallet's own, so the screen
 * shows nothing rather than a guess.
 */
export function derivationFor(wallet: Wallet | null, address: string): string | null {
  if (!wallet || !address) return null;
  try {
    const match = wallet.getAddressObjects().find((entry) => entry.address === address);
    return match?.path ?? null;
  } catch {
    return null;
  }
}

export function ReceiveAddress({ receiveAddress, wallet }: { receiveAddress: string; wallet: Wallet | null }) {
  const [confirm, setConfirm] = React.useState(false);
  const derivation = derivationFor(wallet, receiveAddress);

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
          <small className="font-mono text-[15px] break-all text-center">{receiveAddress}</small>
          {/* Which key this address came from, so it can be told apart at a
              glance from the DePIN chat address or another account. */}
          {derivation && <small className="font-mono text-xs opacity-60 text-center">{derivation}</small>}
        </label>
        <button type="button" className="neurai-btn--primary" onClick={copy}>
          {confirm ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
