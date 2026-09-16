import React from "react";
import { AddressQR } from "./AddressQR";
import { IconEye, IconEyeOff } from "./icons";
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

export function ReceiveAddress(props: { receiveAddress: string; wallet: Wallet | null; compact?: boolean }) {
  const [hidden, setHidden] = React.useState(false);
  // Address changes reset copy/QR feedback while retaining visual privacy.
  return <ReceiveCard key={props.receiveAddress} {...props} hidden={hidden} onToggleHidden={() => setHidden(value => !value)} />;
}

function ReceiveCard({receiveAddress, wallet, compact = false, hidden, onToggleHidden}: {receiveAddress: string; wallet: Wallet | null; compact?: boolean; hidden: boolean; onToggleHidden: () => void}) {
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);
  const [error, setError] = React.useState('');
  const [showQR, setShowQR] = React.useState(false);
  const derivation = derivationFor(wallet, receiveAddress);
  const partCount = /^(?:tnq|nq)1/.test(receiveAddress) ? 4 : 3;
  const addressParts = Array.from({length: partCount}, (_, index) =>
    receiveAddress.slice(Math.floor(index * receiveAddress.length / partCount), Math.floor((index + 1) * receiveAddress.length / partCount)));

  async function copy() {
    if (hidden) return;
    try {
      await navigator.clipboard.writeText(receiveAddress);
      if (!mounted.current) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
      setError('');
    } catch {
      if (!mounted.current) return;
      setCopied(false);
      setError('Could not copy. Select the address and copy it manually.');
    }
  }
  return <section className={compact ? 'relative min-w-0 rounded-xl border border-base-300 bg-base-100 p-[10px]' : 'relative neurai-card min-w-0'}>
    {receiveAddress ? <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
        <div className="relative min-w-0 flex flex-col gap-3 items-center text-center">
          <h2 className="m-0 text-sm font-bold">Receive address</h2>
          <button type="button" onClick={copy} title={hidden ? undefined : "Copy address"} aria-label="Copy receive address" disabled={hidden} aria-hidden={hidden} style={hidden ? {filter: "blur(3px)", userSelect: "none"} : undefined}
            className="font-mono text-[11px] sm:text-sm max-w-[22ch] break-all text-center cursor-pointer hover:text-primary focus-visible:outline-2 focus-visible:outline-primary rounded">
            {addressParts.map((part, index) => <span key={index} className="block">{part}</span>)}
          </button>
          <span role="status" aria-live="polite" className="absolute -bottom-5 left-0 right-0 text-center text-xs text-success pointer-events-none">{copied ? 'Copied' : ''}</span>
        </div>
        <button type="button" className={compact ? 'block w-30 sm:w-36 rounded-xl cursor-pointer focus-visible:outline-2 focus-visible:outline-primary' : 'block w-28 sm:w-56 rounded-xl cursor-pointer focus-visible:outline-2 focus-visible:outline-primary'}
          aria-label="Show larger QR" title={hidden ? undefined : "Show larger QR"} disabled={hidden} aria-hidden={hidden} style={hidden ? {filter: "blur(4px)"} : undefined} onClick={() => setShowQR(true)}>
          <AddressQR address={receiveAddress}/>
        </button>
      </div>
        <button type="button" className="absolute top-[10px] left-[10px] z-10 inline-flex items-center justify-center w-5 h-5 p-0 rounded text-base-content/60 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary [&_svg]:w-4 [&_svg]:h-4"
          aria-label={hidden ? 'Show address and QR' : 'Hide address and QR'} title={hidden ? 'Show address and QR' : 'Hide address and QR'} aria-pressed={hidden}
          onClick={() => {setShowQR(false); setCopied(false); setError(''); onToggleHidden();}}>
          {hidden ? <IconEyeOff/> : <IconEye/>}
        </button>
      {error && <p role="alert" className="text-sm text-error mt-3 mb-0">{error}</p>}
      {showQR && !hidden && <ReceiveQRDialog address={receiveAddress} derivation={derivation} onClose={() => setShowQR(false)} />}
    </> : <p role="status" className="text-sm opacity-60 m-0">Loading receive address…</p>}
  </section>;
}

function ReceiveQRDialog({address, derivation, onClose}: {address: string; derivation: string | null; onClose: () => void}) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  React.useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby={titleId} onCancel={event => {event.preventDefault(); onClose();}}>
    <div className="modal-box neurai-card w-full max-w-md flex flex-col gap-4">
      <h2 id={titleId} className="neurai-card__title">Receive address</h2>
      <div className="w-full max-w-[320px] mx-auto"><AddressQR address={address}/></div>
      <p className="font-mono text-xs break-all text-center select-all m-0">{address}</p>
      {derivation && <p className="font-mono text-xs text-base-content/60 text-center break-all m-0">{derivation}</p>}
      <button type="button" className="neurai-btn--secondary" autoFocus onClick={onClose}>Close</button>
    </div>
  </dialog>;
}
