import React from 'react';
import type { Wallet } from '@neuraiproject/neurai-jswallet';
import { C7_XNA_TESTNET_RUNTIME, C7_XNA_UNAVAILABLE_REASON } from './privacy-pool/c7Deployment';
import type { C7Runtime } from './privacy-pool/C7PrivacyPool';
import './styles/privacy-pool.css';

const C7PrivacyPool = React.lazy(() => import('./privacy-pool/C7PrivacyPool').then(module => ({ default: module.C7PrivacyPool })));

type PrivacyPoolProps = { wallet?: Wallet; mnemonic?: string; passphrase?: string; c7?: C7Runtime | null };

/**
 * The C7 XNA TEST pool, the only one this wallet offers. The instance is
 * pinned in the application (`privacy-pool/c7-testnet.json`), never supplied
 * by an RPC reply. `c7` replaces it, mainly in tests; null shows it as unavailable.
 * The mnemonic and passphrase are the open wallet's words; they are only sent to
 * the dedicated pool worker.
 */
export function PrivacyPool({ wallet, mnemonic, passphrase, c7 }: PrivacyPoolProps = {}) {
  const runtime = c7 === undefined ? C7_XNA_TESTNET_RUNTIME : c7;
  return <div className="neurai-stack" style={{ display: 'grid', gap: '1rem' }}>
    {runtime
      ? <React.Suspense fallback={<p role="status">Loading C7 wallet…</p>}>
        <C7PrivacyPool key="C7-XNA" wallet={wallet} mnemonic={mnemonic} passphrase={passphrase} runtime={runtime}/>
      </React.Suspense>
      : <section className="neurai-card" role="status"><h2 className="text-xl font-bold">C7 TEST pool unavailable</h2><p>{C7_XNA_UNAVAILABLE_REASON}</p></section>}
  </div>;
}

/**
 * Keeps the pool mounted while other wallet sections are open, like HomePanel and
 * SendPanel, so an unlocked identity, its notes and a running step survive
 * navigation. Keyed by wallet so another wallet never inherits this identity.
 */
export function PrivacyPanel({ active, wallet, mnemonic, passphrase }: { active: boolean; wallet: Wallet; mnemonic?: string; passphrase?: string }) {
  const walletKey = `${wallet.network}:${wallet.getAddresses()[0]}`;
  return <div hidden={!active}><PrivacyPool key={walletKey} wallet={wallet} mnemonic={mnemonic} passphrase={passphrase}/></div>;
}
