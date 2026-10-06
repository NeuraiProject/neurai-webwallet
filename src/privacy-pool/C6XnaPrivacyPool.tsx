import React from 'react';
import {C6TransactionReview} from './C6TransactionReview';
import {useC6BackgroundSync} from './useC6BackgroundSync';
import type {Wallet} from '@neuraiproject/neurai-jswallet';
import {C6WorkerClient,IndexedDbSponsorStore,confirmedPoolCoins,withdrawalScript,admitTransaction,inspectFundingTransaction,publishTransaction,parseXna,formatXna,type PoolCoin,type ReceivingInfo} from '@neuraiproject/neurai-privacy/client';
import type {startC6PoolWorker} from '@neuraiproject/neurai-privacy/worker';
import {poolWalletNetwork,signPoolInputs} from './walletNetwork';
import {C6WalletLayout,C6LockedWalletHelp,c6WalletBlockedReason} from './C6WalletLayout';
export interface C6XnaRuntime {config:Omit<Parameters<typeof startC6PoolWorker>[0],'scope'|'snarkjs'|'fetchArtifact'>;createWorker:()=>Worker;}
type Operation={id:string;action:string;phase:string;outcome:string|null;txid:string|null};
type Summary={tip?:{height:number;hash:string};balanceAtomic:string;spendableAtomic:string;reserveAtomic?:string;notes:Array<{cm:string;amountAtomic:string;spendable:boolean;reserved:boolean}>};
type Preview={operationId:string;raw:string;txid:string;inputPoints:Array<{txid:string;vout:number}>;form:string;fee:string;amount?:string};
const outpoint=(txid:string,vout:number)=>{
  const a=txid.match(/../g)!.reverse();for(let i=0;i<4;i++)a.push(((vout>>>8*i)&255).toString(16).padStart(2,'0'));return a.join('');
};
/** XNA uses private-note fees, not detachable asset sponsor signatures. */
export function C6XnaPrivacyPool({wallet,mnemonic='',passphrase='',runtime,onSwitchBlocked}:{wallet?:Wallet;mnemonic?:string;passphrase?:string;runtime:C6XnaRuntime;onSwitchBlocked?:(v:boolean)=>void}){
 const [open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[phase,setPhase]=React.useState('Private wallet locked'),[elapsed,setElapsed]=React.useState(0),[error,setError]=React.useState('');
  const [summary,setSummary]=React.useState<Summary|null>(null),[addresses,setAddresses]=React.useState<ReceivingInfo|null>(null),[operations,setOperations]=React.useState<Operation[]>([]),[preview,setPreview]=React.useState<Preview|null>(null);
  const [zkPass,setZkPass]=React.useState(''),[saved,setSaved]=React.useState(false),[action,setAction]=React.useState('deposit'),[amount,setAmount]=React.useState('100'),[fee,setFee]=React.useState(''),[note,setNote]=React.useState(''),[second,setSecond]=React.useState(''),[destination,setDestination]=React.useState('');
  const [fundingPreview,setFundingPreview]=React.useState<{raw:string;txid:string;points:Array<{txid:string;vout:number}>;amount:string;fee:string}|null>(null);
  const [fundingCoin,setFundingCoin]=React.useState<PoolCoin|null>(null),[fundingMessage,setFundingMessage]=React.useState(''),[fundingSent,setFundingSent]=React.useState<string|null>(null),[depositSent,setDepositSent]=React.useState<string|null>(null);
  // Compare during render: effect cleanup runs later, so an old funding coin
  // must never enable preparation for a newly edited amount or fee.
  let requiredFundingAtomic:string|null=null;
  try{if(fee)requiredFundingAtomic=String(parseXna(amount)+BigInt(fee));}catch{/* Incomplete amounts are not ready to deposit. */}
  const fundingReady=requiredFundingAtomic!==null&&fundingCoin!==null&&String(fundingCoin.valueSats)===requiredFundingAtomic;
  const [recipients,setRecipients]=React.useState([{recipient:'',amount:'100'}]);
  const client=React.useRef<C6WorkerClient|null>(null),store=React.useRef<IndexedDbSponsorStore|null>(null),epoch=React.useRef(0),running=React.useRef(false);
  const network=wallet&&poolWalletNetwork(wallet.network),blockedReason=c6WalletBlockedReason(wallet?.network,!!mnemonic,runtime.config.network),valid=blockedReason===null;
  const opName=action==='deposit'?'D':action==='withdraw'?'W':action==='join'?'J2':('T'+Math.min(3,recipients.length+1));
  const levels=runtime.config.manifest.fees[opName as keyof typeof runtime.config.manifest.fees]??[];
  React.useEffect(()=>{setFee(String(levels[0]??''));},[action,recipients.length,runtime]);
  const lock=React.useCallback(()=>{epoch.current++;running.current=false;sync.reset();client.current?.terminate();client.current=null;void store.current?.close();store.current=null;setOpen(false);setSummary(null);setAddresses(null);setOperations([]);setPreview(null);setFundingPreview(null);setFundingCoin(null);setFundingMessage('');setFundingSent(null);setDepositSent(null);setSaved(false);setZkPass('');setBusy(false);setPhase('Private wallet locked');},[]);
  React.useEffect(()=>{lock();return()=>{epoch.current++;client.current?.terminate();void store.current?.close();};},[wallet,mnemonic,passphrase,runtime,lock]);
  React.useEffect(()=>{onSwitchBlocked?.(busy||!!preview||!!fundingPreview);return()=>onSwitchBlocked?.(false);},[busy,preview,fundingPreview,onSwitchBlocked]);
  React.useEffect(()=>{if(!busy)return;const start=Date.now();setElapsed(0);const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[busy]);
  const live=(token:number)=>{if(token!==epoch.current)throw Error('C6 wallet locked or switched');};
  const rpc=React.useCallback(async (method:string,params:unknown[]=[])=>{
    if(!valid)throw Error('Supported testnet wallet required');
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{const reply:any=await Promise.race([wallet!.rpc(method,params as any),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPC timeout; pending operations remain reserved')),45000);})]);if(reply?.error)throw Error(reply.error.message);return reply;}
    finally{if(timer)clearTimeout(timer);}
  },[wallet,valid]);
  function update(messages:any){
    if(messages.scan){setSummary(messages.scan.result);setAddresses(messages.scan.addresses);}
    if(messages.identity)setAddresses(messages.identity.addresses);
    if(messages.addresses)setAddresses(messages.addresses.addresses);
    if(messages.journal)setOperations(messages.journal.operations);
  }
  async function run(label:string,job:(token:number)=>Promise<void>){
    if(running.current)return;running.current=true;const token=epoch.current;setBusy(true);setPhase(label);setError('');
    try{if(sync.isRunning())setPhase('Waiting for balance refresh');await sync.wait();live(token);await job(token);live(token);setPhase('Ready');}
    catch(e){if(token===epoch.current){setError(e instanceof Error?e.message:String(e));setPhase('Stopped; pending reservations retained');}}
    finally{if(token===epoch.current){running.current=false;setBusy(false);}}
  }
  async function unlock(backup?:any){
    if(!valid)throw Error('Open a supported testnet wallet with its words first');const token=epoch.current;
    client.current?.terminate();void store.current?.close();
    const db=new IndexedDbSponsorStore({name:'neurai-c6-private-journal-v1'});store.current=db;
    const c=new C6WorkerClient({worker:runtime.createWorker(),store:db,rpc:async(m,p)=>{live(token);const r=await rpc(m,p);live(token);return r;},onStage:m=>{if(token===epoch.current&&!sync.isRunning())setPhase(m);},onCrash:e=>{if(token===epoch.current){lock();setError(e.message);}}});client.current=c;
    let journalReady=false;
    try{update(await c.derive({family:network!.family,mnemonic,passphrase,zkPassphrase:zkPass}));live(token);
      // First use creates the encrypted history; an existing one is opened, never replaced.
      const history=await c.openJournal({create:true,backup});live(token);update(history);setSaved(!!backup);
      journalReady=true;setOpen(true);
      const scanned=await c.scan();live(token);update(scanned);
    }catch(e){if(!journalReady){c.terminate();if(client.current===c)client.current=null;}throw e;}
  }
  async function backup(token:number){
    const result=await client.current!.backup();live(token);const url=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='neurai-c6-private-journal.encrypted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setSaved(true);
  }
  async function restore(file:File,token:number){if(file.size>8001000)throw Error('Backup too large');const value=JSON.parse(await file.text());live(token);await unlock(value);}
  async function exactCoin(value:string){
    const coins=await confirmedPoolCoins(rpc,await wallet!.getUTXOs() as any,{baseCurrency:wallet!.baseCurrency});
    const own=coins.find(c=>String(c.valueSats)===value&&c.address&&wallet!.getAddresses().includes(c.address));
    if(!own)throw Error('Prepare an exact funding coin and wait for its confirmation');return own;
  }
  React.useEffect(()=>{
    setFundingCoin(null);setFundingMessage('');setFundingSent(null);if(!open||action!=='deposit'||!fee)return;
    let cancelled=false,pending=false;const token=epoch.current;
    async function poll(){
      if(cancelled||pending||document.visibilityState!=='visible')return;pending=true;
      try{
        const wanted=String(parseXna(amount)+BigInt(fee));
        const rows=(await wallet!.getUTXOs()).filter(c=>String(c.satoshis)===wanted&&wallet!.getAddresses().includes(c.address));
        const coins=await confirmedPoolCoins(rpc,rows as any,{baseCurrency:wallet!.baseCurrency});
        live(token);if(cancelled)return;
        const coin=coins.find(c=>String(c.valueSats)===wanted&&c.address&&wallet!.getAddresses().includes(c.address))??null;
        // A confirmed coin ends the funding wait; the deposit later spends it.
        setFundingCoin(coin);if(coin)setFundingSent(null);setFundingMessage(coin?'Confirmed funding ready: '+formatXna(wanted)+' XNA · '+coin.txid+':'+coin.vout:'No confirmed funding coin for '+formatXna(wanted)+' XNA yet. If you already published it, wait for confirmation; do not pay again.');
      }catch(e){if(!cancelled&&token===epoch.current){setFundingCoin(null);setFundingMessage('Funding check: '+(e instanceof Error?e.message:String(e)));}}
      finally{pending=false;}
    }
    const first=setTimeout(()=>void poll(),500),timer=setInterval(()=>void poll(),20000);
    return()=>{cancelled=true;clearTimeout(first);clearInterval(timer);};
  },[open,action,amount,fee,wallet,rpc]);
  async function review(result:any,token:number,coin?:PoolCoin){
    const c=client.current!;let raw=result.transaction.raw;
    if(result.transaction.funding){
      coin=coin??await exactCoin(result.transaction.funding.valueAtomic);live(token);
      if(coin.txid+':'+coin.vout!==result.transaction.funding.point)throw Error('Select the original funding coin for this pending deposit');
      const address=coin.address!;const keys:any={};try{
        keys[address]=await wallet!.getPrivateKeyByAddress(address);live(token);
        const owned:any={...coin,assetName:wallet!.baseCurrency,outputIndex:coin.vout,script:coin.scriptHex,satoshis:coin.valueSats,value:coin.valueSats};
        raw=signPoolInputs(wallet!.network,raw,[owned],keys,{[result.transaction.funding.index]:1});
      }finally{delete keys[address];}
    }
    live(token);const signed=await c.recordSigned(result.operationId,raw);live(token);await admitTransaction(rpc,raw);live(token);
    update(signed);setSaved(false);setPreview({...signed,form:result.transaction.form,fee:formatXna(result.transaction.feeAtomic),amount:result.packet?.request?.amountAtomic?formatXna(result.packet.request.amountAtomic):undefined});
  }
  async function prepareFunding(token:number){
    const total=formatXna(parseXna(amount)+BigInt(fee));
    const result=await wallet!.createTransaction({amount:total,toAddress:wallet!.getAddresses()[0],assetName:wallet!.baseCurrency});live(token);
    const raw=result.debug?.signedTransaction;if(!raw)throw Error('Funding transaction unavailable');
    const checked=await admitTransaction(rpc,raw);live(token);const funding=await inspectFundingTransaction(rpc,raw);live(token);
    setFundingPreview({raw,txid:checked.txid,points:funding.points,amount:total,fee:formatXna(funding.feeAtomic)});
  }
  async function prepare(token:number){
    let coin:PoolCoin|undefined;const request:any={action,fee};
    if(action==='deposit'){
      request.amountAtomic=String(parseXna(amount));coin=await exactCoin(String(parseXna(amount)+BigInt(fee)));live(token);
      request.funding=outpoint(coin.txid,coin.vout);request.fundingPoint=coin.txid+':'+coin.vout;request.fundingValue=String(coin.valueSats);
    }else if(action==='join')request.notes=[note,second];
    else {request.note=note;if(action==='transfer')request.recipients=recipients.map(r=>({recipient:r.recipient,amountAtomic:String(parseXna(r.amount))}));
      else{request.amountAtomic=String(parseXna(amount));request.payoutScript=await withdrawalScript(rpc,destination);live(token);}}
    const result=await client.current!.prepare(request);live(token);await review(result,token,coin);setPreview(p=>p?{...p,amount:action==='deposit'||action==='withdraw'?amount:undefined}:p);
  }
  async function publish(token:number){
    const p=preview!;await client.current!.broadcastAttempt(p.operationId);live(token);
    await publishTransaction(async(m,args)=>{live(token);const r=await rpc(m,args);live(token);return r;},{genesis:runtime.config.deployment.genesis},{raw:p.raw,txid:p.txid,points:p.inputPoints});
    live(token);if(action==='deposit')setDepositSent(p.txid);setPreview(null);update(await client.current!.scan());live(token);
  }
  // A published deposit keeps its step locked until the journal records its outcome.
  React.useEffect(()=>{if(depositSent&&operations.some(o=>o.txid===depositSent&&o.outcome))setDepositSent(null);},[depositSent,operations]);
  const sync=useC6BackgroundSync({active:open&&!!summary?.tip,paused:busy||!!preview||!!fundingPreview,tip:summary?.tip,rpc,
    canStart:()=>!running.current,
    scan:async()=>{const token=epoch.current,result=await client.current!.scan();live(token);return result;},apply:update});
  const walletPanel=<>
    <div className="rounded-xl border border-base-300 bg-base-200/35 p-4">
      <p className="neurai-eyebrow mb-1">Confirmed private balance</p>
      <strong className="block text-3xl tabular-nums">{open&&summary?formatXna(summary.balanceAtomic):'—'} <span className="text-base font-normal">XNA</span></strong>
      <p className="neurai-hint mb-0">{open&&summary?'Available: '+formatXna(summary.spendableAtomic)+' XNA':'Open your private wallet to recover its balance and notes.'}</p>
      {open&&summary?.tip&&<p className="neurai-hint m-0">Checked through block {summary.tip.height.toLocaleString('en-US')}</p>}
      {open&&<p className="neurai-hint m-0" aria-live="polite">{sync.syncing?'Updating private balance in the background…':'Private balance refreshes automatically after new blocks.'}</p>}
      {open&&sync.warning&&<p className="neurai-hint m-0" role="status">{sync.warning}</p>}
      {open&&summary?.reserveAtomic!==undefined&&<p className="neurai-hint mt-3 mb-0 border-t border-base-300 pt-3">Total in the pool, all wallets: {formatXna(summary.reserveAtomic)} XNA</p>}
    </div>
    {!open?<>
      <C6LockedWalletHelp history="Opening the private wallet here for the first time creates its encrypted operation history automatically."/>
      <label className="neurai-label">ZK passphrase (optional)<input className="neurai-input" type="password" aria-label="C6 private passphrase" autoComplete="off" value={zkPass} disabled={!valid||busy} onChange={e=>setZkPass(e.target.value)}/></label>
      <div className="flex flex-wrap gap-2">
        <button className="neurai-btn--primary" disabled={!valid||busy} onClick={()=>void run('Opening private wallet',()=>unlock())}>Open private wallet</button>
      </div>
      <details className="rounded-xl border border-base-300 p-3"><summary className="cursor-pointer text-sm font-semibold">Encrypted history and recovery</summary><div className="neurai-stack mt-3">
      <label className="neurai-label">Restore pending-operation backup<input className="neurai-input" aria-label="Restore C6 backup" type="file" accept="application/json" disabled={!valid||busy} onChange={e=>{const f=e.target.files?.[0];if(f)void run('Restoring encrypted history',t=>restore(f,t));}}/></label>
      <p className="neurai-hint m-0">Optional. Restore the backup of another device to continue its pending operations. Do it before opening the private wallet in this browser: once this browser has its own history, a backup cannot replace it.</p>
      </div></details>
    </>:<>
      <div className="flex flex-wrap gap-2"><button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={()=>void run('Saving encrypted history',backup)}>Save encrypted backup</button><button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={()=>void run('Scanning private balance',async t=>{const m=await client.current!.scan();live(t);update(m);})}>Scan now</button><button className="neurai-btn--secondary btn-sm" onClick={lock}>Lock private wallet</button></div>
      <p className="text-sm m-0">{saved?'Encrypted backup downloaded. Local history continues to save automatically.':'Operation history saves encrypted in this browser automatically. Downloading a backup is optional; keep a current one to move pending operations to another device.'}</p>
    </>}
    <div className="rounded-xl border border-base-300 p-3 neurai-stack">
      <label className="neurai-label">Receive privately<input className="neurai-input font-mono text-xs" aria-label="C6 private receiving address" readOnly placeholder="Open the private wallet to see its receiving address" value={open?addresses?.current.address??'':''}/></label>
      <p className="neurai-hint m-0">Share this private address for assignments inside this pool. A transparent Legacy, PQ or ECDSA address is used for withdrawals.</p>
      <button className="neurai-btn--secondary btn-sm self-start" disabled={!open||busy} onClick={()=>void run('New private address',async t=>{const m=await client.current!.newAddress();live(t);update(m);setSaved(false);})}>New receiving address</button>
    </div>
  </>;
  const operationPanel=<>
    <fieldset className="neurai-stack min-w-0 border-0 p-0 m-0" disabled={!open||busy||!!preview}>
      {action!=='deposit'&&<label className="neurai-label">Note<select className="neurai-input" aria-label="C6 note" value={note} onChange={e=>setNote(e.target.value)}><option value="">Select a note</option>{summary?.notes.filter(n=>n.spendable).map(n=><option key={n.cm} value={n.cm}>{formatXna(n.amountAtomic)} XNA · {n.cm.slice(0,8)}</option>)}</select></label>}
      {action==='join'&&<label className="neurai-label">Second note<select className="neurai-input" aria-label="C6 second note" value={second} onChange={e=>setSecond(e.target.value)}><option value="">Select another note</option>{summary?.notes.filter(n=>n.spendable&&n.cm!==note).map(n=><option key={n.cm} value={n.cm}>{formatXna(n.amountAtomic)} XNA · {n.cm.slice(0,8)}</option>)}</select></label>}
      {(action==='deposit'||action==='withdraw')&&<label className="neurai-label">Amount (XNA)<input className="neurai-input" aria-label="C6 amount" value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
      {action==='deposit'&&<div className="flex flex-wrap gap-2" aria-label="Quick deposit amounts">{['100','200','500'].map(v=><button type="button" key={v} aria-pressed={amount===v} className={'btn btn-sm '+(amount===v?'btn-primary':'btn-ghost border border-base-300')} onClick={()=>setAmount(v)}>{v} XNA</button>)}</div>}
      {action==='withdraw'&&<label className="neurai-label">Transparent recipient<input className="neurai-input" aria-label="C6 withdrawal destination" value={destination} onChange={e=>setDestination(e.target.value)}/></label>}
      {action==='transfer'&&<>{recipients.map((r,i)=><div key={i}><input className="neurai-input" aria-label={'Private recipient '+(i+1)} placeholder="nzk…" value={r.recipient} onChange={e=>setRecipients(rows=>rows.map((row,j)=>j===i?{...row,recipient:e.target.value}:row))}/><input className="neurai-input" aria-label={'Recipient amount '+(i+1)} value={r.amount} onChange={e=>setRecipients(rows=>rows.map((row,j)=>j===i?{...row,amount:e.target.value}:row))}/></div>)}<button className="neurai-btn--secondary" disabled={recipients.length>=3||busy} onClick={()=>setRecipients(rows=>[...rows,{recipient:'',amount:'100'}])}>Add recipient</button><p>At most three output notes, including change. Ordinary payments use multiples of 100 XNA.</p></>}
      <label className="neurai-label">Fee (XNA)<select className="neurai-input" aria-label="C6 fee" value={fee} onChange={e=>setFee(e.target.value)}>{levels.map(v=><option key={String(v)} value={String(v)}>{formatXna(String(v))}</option>)}</select></label>
      {action==='deposit'&&<p className="neurai-hint m-0 break-all" role="status" aria-label="C6 funding status">{depositSent?'Deposit '+depositSent+' published; waiting for confirmation. The private balance updates automatically.':fundingMessage||'Checking existing funding…'}{!depositSent&&fundingSent&&!fundingCoin?' Published '+fundingSent+'; waiting for confirmation.':''}{!depositSent&&fundingCoin?' You can now prepare the deposit.':''}</p>}
      {action!=='deposit'?<button className="neurai-btn--primary" disabled={!open||busy||!!preview||!fee} onClick={()=>void run('Preparing private operation',prepare)}>Prepare operation</button>
        // A deposit is two steps on one primary button: fund an exact coin, then prove the deposit.
        :depositSent?<button className="neurai-btn--primary" disabled><span className="loading loading-spinner loading-xs" aria-hidden="true"/>Waiting for deposit confirmation…</button>
        :fundingReady?<button className="neurai-btn--primary" disabled={!open||busy||!!preview||!!fundingPreview||!fee} onClick={()=>void run('Preparing private operation',prepare)}>2/2 · Deposit</button>
        :fundingSent?<button className="neurai-btn--primary" disabled><span className="loading loading-spinner loading-xs" aria-hidden="true"/>Waiting for funding confirmation…</button>
        :<button className="neurai-btn--primary" disabled={busy||!open||!fee||!fundingMessage||fundingMessage.startsWith('Funding check:')||!!fundingPreview} onClick={()=>void run('Preparing exact funding coin',prepareFunding)}>1/2 · Prepare funding coin</button>}
      {open&&fundingPreview&&<C6TransactionReview title="Review funding transaction" txid={fundingPreview.txid} amount={fundingPreview.amount} fee={fundingPreview.fee} busy={busy} onPublish={()=>void run('Publishing funding coin',async t=>{await publishTransaction(async(m,p)=>{live(t);const r=await rpc(m,p);live(t);return r;},{genesis:runtime.config.deployment.genesis},fundingPreview);live(t);setFundingSent(fundingPreview.txid);setFundingPreview(null);})} publishLabel="Publish funding coin" onClose={()=>setFundingPreview(null)}/>}
    </fieldset>
      {open&&preview&&<C6TransactionReview title="Review private operation" form={preview.form} txid={preview.txid} amount={preview.amount} fee={preview.fee} busy={busy} onPublish={()=>void run('Publishing private operation',publish)} publishLabel="Publish operation" onClose={()=>setPreview(null)} closeLabel="Close preview; keep reservation"/>}
    <p className="neurai-hint m-0">Nothing is sent until you review and publish. A deposit needs a confirmed funding coin for the amount plus the selected fee. Private assignments use multiples of 100 XNA; change stays private.</p>
  </>;
  return <C6WalletLayout title="Privacy Pool · C6" label="C6 XNA private wallet"
    description="Deposit XNA, assign private notes, withdraw or join two notes. Proofs are built on this device."
    open={open} busy={busy} phase={phase} seconds={elapsed} error={error} blockedReason={blockedReason}
    action={action} onAction={setAction} actionsBlocked={!open||busy||!!preview||!!fundingPreview} onCancel={lock}
    walletPanel={walletPanel} operationPanel={operationPanel} history={open?(
      <details className="neurai-card neurai-stack min-w-0"><summary className="cursor-pointer text-sm font-semibold">Operation history ({operations.length})</summary>{operations.map(o=><div key={o.id}><span>{o.action} · {o.outcome??o.phase} · {o.txid??o.id}</span>{!o.outcome&&o.phase==='prepared'&&<button className="neurai-btn--secondary" disabled={busy||!!preview} onClick={()=>void run('Rebuilding public paths',async t=>{const result=await client.current!.rebuild(o.id);live(t);await review(result,t);})}>Resume with current state</button>}{o.phase==='draft'&&!o.outcome&&<button className="neurai-btn--secondary" disabled={busy} onClick={()=>void run('Releasing unexposed draft',async t=>{const m=await client.current!.releaseDraft(o.id);live(t);update(m);})}>Release unexposed draft</button>}</div>)}</details>
    ):undefined} identity={(runtime.config.manifest as typeof runtime.config.manifest & {identity?:string}).identity} commitment={runtime.config.expectedCommitment}/>;
}
