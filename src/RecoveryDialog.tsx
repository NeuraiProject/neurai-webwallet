import React from 'react';
import { verifyRecoveryPin } from './utils/recoveryPin';

export function RecoveryDialog({ network, mnemonic, passphrase, onClose }: {
  network: string; mnemonic: string; passphrase: string;
  onClose: () => void;
}) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const alive = React.useRef(true);
  const submitting = React.useRef(false);
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    return () => { alive.current = false; };
  }, []);

  function cancel() {
    alive.current = false;
    setPin('');
    setRevealed(null);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || !pin) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const words = await verifyRecoveryPin(pin, network, mnemonic, passphrase);
      if (!alive.current) return;
      setPin('');
      setRevealed(words);
    } catch (cause) {
      if (alive.current) {
        setPin('');
        setError(cause instanceof Error ? cause.message : 'Unable to show recovery words.');
      }
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <dialog ref={dialog} className="modal" aria-labelledby="recovery-title"
    onCancel={event => { event.preventDefault(); cancel(); }}>
    <div className="modal-box neurai-card w-full max-w-xl">
      <h2 id="recovery-title" className="neurai-card__title">{revealed ? "Recovery words" : "Confirm your PIN"}</h2>
      {revealed ? <div className="neurai-stack mt-4">
        {passphrase && <p role="note" className="rounded-xl border border-primary p-4 text-sm m-0">An additional passphrase is active. These words alone cannot restore this wallet. You also need the exact passphrase, which is not shown here. Keep it backed up separately.</p>}
        <ol aria-label="Recovery words" className="grid grid-cols-2 sm:grid-cols-3 gap-2 list-none p-0 m-0">
          {revealed.split(/\s+/).map((word, index) => <li key={index} className="rounded-lg border border-base-300 bg-base-100 p-3 text-sm break-all"><span className="text-base-content/50 mr-2">{index + 1}.</span>{word}</li>)}
        </ol>
        <button type="button" autoFocus className="neurai-btn--secondary" onClick={cancel}>Close</button>
      </div> : <>
      <p className="text-sm text-base-content/70 mt-2 mb-5">Enter your wallet PIN to view your recovery words.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="neurai-label" htmlFor="recovery-pin">Wallet PIN</label>
          <input id="recovery-pin" className="neurai-input" type="password"
            autoFocus autoComplete="current-password" value={pin} maxLength={24}
            disabled={busy} onChange={event => setPin(event.target.value)}
            aria-invalid={!!error} aria-describedby={error ? 'recovery-error' : undefined} />
        </div>
        {error && <p id="recovery-error" role="alert" className="text-error text-sm m-0">{error}</p>}
        <div className="flex justify-end flex-wrap gap-2">
          <button type="button" className="neurai-btn--secondary" onClick={cancel}>Cancel</button>
          <button type="submit" className="neurai-btn--primary" disabled={busy || pin.length < 6} aria-busy={busy}>
            {busy ? 'Verifying…' : 'Verify PIN & show'}
          </button>
        </div>
      </form>
      </> }
    </div>
  </dialog>;
}
