import React from 'react';
import {c6SponsorWalletId,sealVault,openVault} from '@neuraiproject/neurai-privacy/browser';
import type {Wallet} from '@neuraiproject/neurai-jswallet';
import {C6SponsorFlow,IndexedDbSponsorStore,rpcAmountToSatoshis,formatXna,type C6PreparedAuthorization,type C6SponsorDeployment,type SponsorSnapshot} from '@neuraiproject/neurai-privacy/client';
import {isTestnetChain} from '../buildTarget';
import {poolWalletNetwork,signPoolInputs} from './walletNetwork';

/** Explicit application deployment and local C6 proving worker bridge. Neither
 * the deployment nor prepared proofs may be supplied by an untrusted RPC. */
export interface C6PrivacyRuntime {
  deployments:C6SponsorDeployment[];
  budgetAtomic:string;
  actions:readonly string[];
  prepare:(action:string)=>Promise<C6PreparedAuthorization>;
}
type Props={wallet?:Wallet;mnemonic?:string;passphrase?:string;runtime:C6PrivacyRuntime;publishBlocked?:boolean;requireBackupBeforePublish?:boolean;onSwitchBlocked?:(blocked:boolean)=>void};
export function C6PrivacyPool({wallet,mnemonic='',passphrase='',runtime,onSwitchBlocked,publishBlocked=false,requireBackupBeforePublish=false}:Props) {
  const [snapshot,setSnapshot]=React.useState<SponsorSnapshot|null>(null),[phase,setPhase]=React.useState('C6 wallet locked');
  const [error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[seconds,setSeconds]=React.useState(0);
  const [backedUp,setBackedUp]=React.useState(false);
  const [autoSweep,setAutoSweep]=React.useState(false),[password,setPassword]=React.useState(''),[resumable,setResumable]=React.useState<Array<{operationId:string;txid:string}>>([]),[prepared,setPrepared]=React.useState<{operationId:string;txid:string}|null>(null);
  const flow=React.useRef<C6SponsorFlow|null>(null),store=React.useRef<IndexedDbSponsorStore|null>(null),active=React.useRef(0),running=React.useRef(false);
  const valid=!!wallet && !!poolWalletNetwork(wallet.network) && isTestnetChain(wallet.network) && !!mnemonic;
  const lock=React.useCallback(()=>{active.current++;flow.current=null;void store.current?.close();store.current=null;setSnapshot(null);setPrepared(null);setResumable([]);setPassword('');setAutoSweep(false);setBackedUp(false);setBusy(false);},[]);
  React.useEffect(()=>{lock();return()=>{active.current++;flow.current=null;void store.current?.close();};},[wallet,mnemonic,passphrase,runtime,lock]);
  React.useEffect(()=>{onSwitchBlocked?.(busy||!!prepared);return()=>onSwitchBlocked?.(false);},[busy,prepared,onSwitchBlocked]);
  React.useEffect(()=>{if(!busy)return;const start=Date.now();setSeconds(0);const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[busy]);
  async function run(label:string,job:()=>Promise<void>) {
    if(running.current)return;running.current=true;const epoch=active.current;setBusy(true);setError('');setPhase(label);
    try {await job();if(active.current===epoch)setPhase('C6 chain checked');}
    catch(e){if(active.current===epoch){setError(e instanceof Error?e.message:String(e));setAutoSweep(false);setPhase('Stopped; reservations retained');}}
    finally{running.current=false;if(active.current===epoch)setBusy(false);}
  }
  async function rpc(method:string,params:unknown[]=[]) {
    if(!wallet || !valid)throw Error('C6 requires a supported testnet wallet');
    let timer:ReturnType<typeof setTimeout>|undefined;
    let reply:any;try{reply=await Promise.race([wallet.rpc(method,params as any),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('C6 RPC timeout; retain sponsor reservations')),45000);})]);}finally{if(timer)clearTimeout(timer);}
    if(reply?.error)throw Object.assign(Error(reply.error.message),{code:reply.error.code});return reply;
  }
  async function open(create:boolean,backup?:any) {
    if(!valid)throw Error('Open a supported testnet wallet with its words first');
    const epoch=active.current,db=new IndexedDbSponsorStore();
    const walletId=await c6SponsorWalletId(mnemonic,passphrase);
    const checkedRpc=async(method:string,params:unknown[]=[])=>{if(active.current!==epoch)throw Error('C6 wallet locked');const result=await rpc(method,params);if(active.current!==epoch)throw Error('C6 wallet locked');return result;};
    const f=new C6SponsorFlow({store:db,walletId,genesis:runtime.deployments[0].genesis,budgetAtomic:runtime.budgetAtomic,deployments:runtime.deployments,rpc:checkedRpc,
      sweepFeeAtomic:async offer=>{
        const info=await checkedRpc('getnetworkinfo'),relay=info.relayfee;
        // Fee parsing is performed with decimal arithmetic by the library.
        const perKb=rpcAmountToSatoshis(relay),vsize=offer.inputScript.startsWith('52')?1200n:300n;
        return String((perKb*vsize*2n+999n)/1000n);
      },
      sign:async({raw,offer,hashType,index})=>{
        if(active.current!==epoch)throw Error('Wallet locked before signing');
        const [txid,vout]=offer.outpoint.split(':'),tx=await checkedRpc('getrawtransaction',[txid,true]),output=tx.vout?.[Number(vout)];
        const address=output?.scriptPubKey?.addresses?.[0];
        if(!address || !wallet!.getAddresses().includes(address))throw Error('Select the wallet which owns this exposed sponsor before sweeping');
        const keys:any={};try{
          keys[address]=await wallet!.getPrivateKeyByAddress(address);
          if(active.current!==epoch)throw Error('Wallet locked before signing');
          const coin:any={address,assetName:'XNA',txid,outputIndex:Number(vout),script:offer.inputScript,satoshis:offer.inputAtomic,value:offer.inputAtomic};
          return signPoolInputs(wallet!.network,raw,[coin],keys,{[index]:hashType});
        }finally{delete keys[address];}
      }});
    try{let s:SponsorSnapshot;if(backup){s=await f.restore(backup);}else{await f.initialize({create});s=await f.scan();}if(active.current!==epoch){await db.close();return;}store.current=db;flow.current=f;setSnapshot(s);setResumable(await f.pending());}
    catch(e){await db.close();throw e;}
  }
  async function tick() {
    const f=flow.current;if(!f)return;const epoch=active.current;
    const result=await f.tick({autoSweep,onProgress:p=>{if(active.current===epoch)setPhase(`Scanning block ${p.height} / ${p.target}`);}});
    if(active.current===epoch){setSnapshot(result.snapshot);setResumable(await f.pending());}
  }
  React.useEffect(()=>{
    if(!snapshot)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!running.current)void run('Checking C6 confirmations',tick);},15000);
    return()=>clearInterval(timer);
  },[snapshot,autoSweep]);
  async function prepare(action:string) {
    const epoch=active.current,f=flow.current;if(!f)throw Error('Open the C6 journal first');
    const result=await runtime.prepare(action);if(active.current!==epoch)throw Error('Wallet locked while proving');
    const signed=await f.authorize(result);if(active.current!==epoch)return;setPrepared(signed);setBackedUp(false);setSnapshot(await f.snapshot());
  }
  async function saveBackup() {
    const epoch=active.current,f=flow.current;if(!f || password.length<12)throw Error('Use a backup password of at least 12 characters');
    const backup=await f.backup();
    // A locked, switched or unmounted session must not export its old backup.
    if(active.current!==epoch || flow.current!==f)return;
    const sealed=await sealVault({...backup},password);
    if(active.current!==epoch || flow.current!==f)return;
    const url=URL.createObjectURL(new Blob([sealed],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='neurai-c6-sponsors.encrypted.json';a.click();setBackedUp(true);setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function restore(file:File) {
    if(!valid || password.length<12 || file.size>8000000)throw Error('Supported wallet and backup password required');
    const backup:any=await openVault(await file.text(),password);
    await open(false,backup);
  }
  return <section className="neurai-card neurai-stack" aria-label="C6 TEST wallet">
    <h2 className="text-xl font-bold">C6 TEST wallet</h2>
    <p>Portable proofs and sponsor recovery. C6 uses its own contract and private balance.</p>
    {!valid&&<p role="alert">Open a supported testnet wallet with its words to use C6.</p>}
    <div role="status" aria-live="polite" className="privacy-operation"><strong>{phase}</strong>{busy&&<><span className="privacy-operation__indicator" aria-hidden="true"/><time>{seconds}s</time></>}</div>
    {error&&<p role="alert">{error}</p>}
    {!snapshot?<div className="flex gap-2 flex-wrap">
      <button disabled={!valid||busy} onClick={()=>void run('Opening saved C6 history',()=>open(false))}>Open C6 journal</button>
      <button disabled={!valid||busy} onClick={()=>void run('Creating an explicitly new journal',()=>open(true))}>Create NEW sponsor journal</button>
      <p>For a recovered wallet, restore its full sponsor backup. Creating new history cannot recover old exposures.</p>
    </div>:<>
      <p>Authorized lifetime loss: {formatXna(snapshot.authorizedAtomic)} / {formatXna(snapshot.budgetAtomic)} XNA. Checked block {snapshot.tip?.height}.</p>
      <label><input type="checkbox" checked={autoSweep} disabled={busy} onChange={e=>setAutoSweep(e.target.checked)}/> Automatically sweep leftover sponsors after a private payment confirms or conflicts</label>
      <div className="flex gap-2 flex-wrap"><button disabled={busy} onClick={()=>void run('Scanning the active chain',tick)}>Scan now</button>
        {runtime.actions.map(action=><button key={action} disabled={busy||!!prepared} onClick={()=>void run('Preparing '+action,()=>prepare(action))}>{action}</button>)}
        <button disabled={busy} onClick={lock}>Lock C6</button></div>
      {!prepared&&resumable.map(tx=><button disabled={busy} key={tx.txid} onClick={()=>setPrepared(tx)}>Resume prepared C6 transaction {tx.txid.slice(0,12)}…</button>)}
      {prepared&&<div><p>Proof verified and sponsor exposure persisted. Recheck before publishing or retrying.</p>{(publishBlocked||(requireBackupBeforePublish&&!backedUp))&&<p>Save the updated private and sponsor backups before publishing.</p>}<button disabled={busy||publishBlocked||(requireBackupBeforePublish&&!backedUp)} onClick={()=>void run('Publishing persisted C6 transaction',async()=>{await flow.current!.publish(prepared.operationId);setPrepared(null);await tick();})}>Publish C6 TEST transaction</button></div>}
      {snapshot.operations.map(op=><div key={op.operationId} className="neurai-card neurai-card--compact"><p>Private operation: {op.privateOperation}. Notes {op.reservationClosed?'consumed':'reserved'}.</p>
        {op.sponsors.map(s=><div key={s.offer.outpoint}><code>{s.offer.outpoint}</code><p>{s.status}{s.sweepTxid?' · ALL sweep pending/recorded':''}</p>
          {!s.spentBy&&<button disabled={busy} onClick={()=>void run('Recovering exposed sponsor',async()=>{await flow.current!.sweep(s.offer.outpoint);await tick();})}>Sweep this exposed sponsor</button>}</div>)}
      </div>)}
    </>}
    <label>Encrypted sponsor backup password<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <button disabled={!snapshot||busy||password.length<12} onClick={()=>void run('Encrypting sponsor backup',saveBackup)}>Save encrypted sponsor backup</button>
    <label>Restore complete encrypted sponsor backup<input type="file" accept="application/json,.json" disabled={busy||!!snapshot||password.length<12} onChange={e=>{const file=e.target.files?.[0];if(file)void run('Restoring sponsor history',()=>restore(file));e.target.value='';}}/></label>
    <p className="text-sm">Pending sweeps do not release private notes. An RPC or storage error stops automation. A disconnected sweep reopens its exposure.</p>
  </section>;
}
