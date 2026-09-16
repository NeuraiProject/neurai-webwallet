import React from 'react';
import type { Wallet } from '@neuraiproject/neurai-jswallet';

type ChainInfo = {
  chain?: string; blocks?: number; headers?: number; bestblockhash?: string;
  difficulty?: number; verificationprogress?: number; initialblockdownload?: boolean;
};

export function ChainDetails({wallet, network}: {wallet: Wallet | null; network: string}) {
  const [snapshot, setSnapshot] = React.useState<{wallet: Wallet; info: ChainInfo} | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let timeout: ReturnType<typeof setTimeout>;
    setSnapshot(null);
    setFailed(false);
    if (!wallet) return;
    async function refresh() {
      try {
        const info = await Promise.race([
          wallet!.rpc('getblockchaininfo', []),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 5000); }),
        ]) as ChainInfo;
        if (!info || typeof info !== 'object' || typeof info.blocks !== 'number') throw new Error('Unavailable');
        if (!cancelled) { setSnapshot({wallet: wallet!, info}); setFailed(false); }
      } catch {
        if (!cancelled) { setSnapshot(null); setFailed(true); }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) timer = setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(timeout); };
  }, [wallet]);
  const info = snapshot?.wallet === wallet ? snapshot?.info : undefined;
  const numeric = (value?: number) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: 8}) : 'Unavailable';
  const rows = [
    ['Wallet network ID', network],
    ['Currency / precision', 'XNA / 8 decimals'],
    ['Node chain', info?.chain ?? 'Unavailable'],
    ['Block height', numeric(info?.blocks)],
    ['Headers', numeric(info?.headers)],
    ['Difficulty', numeric(info?.difficulty)],
    ['Verification progress', typeof info?.verificationprogress === 'number' ? `${(info.verificationprogress * 100).toFixed(2)}%` : 'Unavailable'],
    ['Initial block download', typeof info?.initialblockdownload === 'boolean' ? (info.initialblockdownload ? 'In progress' : 'Complete') : 'Unavailable'],
    ['Best block hash', info?.bestblockhash ?? 'Unavailable'],
  ];
  return <div className="neurai-stack">
    <p role="status" className="neurai-hint m-0">{!wallet ? 'Connect a wallet to inspect its node.' : failed ? 'Chain information unavailable from the connected RPC.' : !info ? 'Loading chain information…' : 'Reported by the connected RPC · refreshes every 30 seconds.'}</p>
    <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
      {rows.map(([label, value]) => <div key={label} className={`py-3 border-b border-base-300 ${label === "Best block hash" ? "sm:col-span-2" : ""}`}>
        <dt className="text-xs text-base-content/60 mb-1">{label}</dt>
        <dd className="font-mono text-sm break-all m-0">{value}</dd>
      </div>)}
    </dl>
  </div>;
}
