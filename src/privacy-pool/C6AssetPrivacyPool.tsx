import React from 'react';
import {C6TransactionReview} from './C6TransactionReview';
import {useC6BackgroundSync} from './useC6BackgroundSync';
import type {Wallet} from '@neuraiproject/neurai-jswallet';
import {C6WorkerClient,IndexedDbSponsorStore,confirmedPoolCoins,withdrawalScript,admitTransaction,inspectFundingTransaction,publishTransaction,parseAssetAmount,c6ReadAssetTransfer,c6AssetMetadata,formatXna,type PoolCoin,type ReceivingInfo,type C6PreparedAuthorization} from '@neuraiproject/neurai-privacy/client';
import {C6PrivacyPool,type C6PrivacyRuntime} from './C6PrivacyPool';
import type {C6XnaRuntime} from './C6XnaPrivacyPool';
import {poolWalletNetwork,signPoolInputs} from './walletNetwork';
import {C6WalletLayout,C6LockedWalletHelp,c6WalletBlockedReason} from './C6WalletLayout';
type OwnedCoin={point:string;txid:string;vout:number;valueAtomic:string;quantityAtomic:string;script:string;address:string};
type Summary={tip?:{height:number;hash:string};balanceAtomic:string;spendableAtomic:string;reserveAtomic?:string;notes:Array<{cm:string;amountAtomic:string;spendable:boolean;reserved:boolean}>};
type Operation={id:string;action:string;phase:string;outcome:string|null;txid:string|null};
const bytes=(s:string)=>Uint8Array.from(s.match(/../g)??[],v=>parseInt(v,16));
const pointBytes=(id:string,vout:number)=>id.match(/../g)!.reverse().join('')+Array.from({length:4},(_,i)=>((vout>>>8*i)&255).toString(16).padStart(2,'0')).join('');
/** Each asset instance has its own private worker and encrypted reservations.
 * Sponsor exposure is separately persisted by the shared C6SponsorFlow API.
 */
export function C6AssetPrivacyPool({wallet,mnemonic='',passphrase='',runtime,onSwitchBlocked}:{wallet?:Wallet;mnemonic?:string;passphrase?:string;runtime:C6XnaRuntime;onSwitchBlocked?:(blocked:boolean)=>void}){
 const meta=React.useMemo(()=>c6AssetMetadata(runtime.config.manifest),[runtime]),family=wallet&&poolWalletNetwork(wallet.network);
 const blockedReason=c6WalletBlockedReason(wallet?.network,!!mnemonic,runtime.config.network)??(runtime.config.deployment.kind==='asset'?null:'This instance is not an asset pool. Private operations are disabled.');
 const valid=blockedReason===null;
 const [historyReady,setHistoryReady]=React.useState(false);
 const [open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[phase,setPhase]=React.useState('Private asset wallet locked'),[seconds,setSeconds]=React.useState(0),[error,setError]=React.useState(''),[zkPass,setZkPass]=React.useState(''),[saved,setSaved]=React.useState(false);
 const [summary,setSummary]=React.useState<Summary|null>(null),[receiving,setReceiving]=React.useState<ReceivingInfo|null>(null),[operations,setOperations]=React.useState<Operation[]>([]),[action,setAction]=React.useState('deposit'),[amount,setAmount]=React.useState('10'),[destination,setDestination]=React.useState(''),[note,setNote]=React.useState(''),[second,setSecond]=React.useState('');
 const [recipients,setRecipients]=React.useState([{recipient:'',amount:'1'}]),[funding,setFunding]=React.useState<OwnedCoin[]>([]),[selectedFunding,setSelectedFunding]=React.useState(''),[sponsors,setSponsors]=React.useState<PoolCoin[]>([]),[selectedSponsor,setSelectedSponsor]=React.useState(''),[sponsorFee,setSponsorFee]=React.useState(String(runtime.config.manifest.sponsor_fees?.[0]??'')),[sponsorBusy,setSponsorBusy]=React.useState(false),[resume,setResume]=React.useState('');
 const [fundingPreview,setFundingPreview]=React.useState<{raw:string;txid:string;points:Array<{txid:string;vout:number}>;amount:string;fee:string}|null>(null);
 const client=React.useRef<C6WorkerClient|null>(null),store=React.useRef<IndexedDbSponsorStore|null>(null),epoch=React.useRef(0),running=React.useRef(false),prepareRef=React.useRef<()=>Promise<C6PreparedAuthorization>>(async()=>{throw Error('Private asset wallet locked');});
 const live=(token:number)=>{if(epoch.current!==token)throw Error('Asset wallet locked or switched');};
 const lock=React.useCallback(()=>{epoch.current++;running.current=false;sync.reset();client.current?.terminate();client.current=null;void store.current?.close();store.current=null;setOpen(false);setHistoryReady(false);setSummary(null);setReceiving(null);setOperations([]);setSaved(false);setZkPass('');setBusy(false);setFundingPreview(null);setFunding([]);setSponsors([]);setPhase('Private asset wallet locked');},[]);
 React.useEffect(()=>{lock();return()=>{epoch.current++;client.current?.terminate();void store.current?.close();};},[wallet,mnemonic,passphrase,runtime,lock]);
 React.useEffect(()=>{onSwitchBlocked?.(busy||sponsorBusy||!!fundingPreview);return()=>onSwitchBlocked?.(false);},[busy,sponsorBusy,fundingPreview,onSwitchBlocked]);
 React.useEffect(()=>{if(!busy)return;const start=Date.now();setSeconds(0);const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 const rpc=React.useCallback(async (method:string,params:unknown[]=[])=>{if(!valid)throw Error('Supported testnet wallet required');let timer:ReturnType<typeof setTimeout>|undefined;try{const r:any=await Promise.race([wallet!.rpc(method,params as any),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPC timeout; keep both journals')),45000);})]);if(r?.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r;}finally{if(timer)clearTimeout(timer);}},[wallet,valid]);
 function update(messages:any){if(messages.scan){setSummary(messages.scan.result);setReceiving(messages.scan.addresses);}if(messages.identity)setReceiving(messages.identity.addresses);if(messages.addresses)setReceiving(messages.addresses.addresses);if(messages.journal)setOperations(messages.journal.operations);}
 async function run(label:string,job:(token:number)=>Promise<void>){if(running.current)return;running.current=true;const token=epoch.current;setBusy(true);setPhase(label);setError('');try{if(sync.isRunning())setPhase('Waiting for balance refresh');await sync.wait();live(token);await job(token);live(token);setPhase('Ready');}catch(e){if(epoch.current===token){setError(e instanceof Error?e.message:String(e));setPhase('Stopped; reservations retained');}}finally{if(epoch.current===token){running.current=false;setBusy(false);}}}
 async function loadCoins(token:number){
  const all=await wallet!.getAssetUTXOs(meta.name);live(token);const rows:OwnedCoin[]=[];
  for(const u of all){const vout=Number(u.outputIndex),txid=u.txid;if(!Number.isInteger(vout)||vout<0||!wallet!.getAddresses().includes(u.address))continue;
   const c:any=await rpc('gettxout',[txid,vout,true]);live(token);if(!c||c.confirmations<1||c.value!==0)continue;
   // Wrong types and historical payloads are ineligible, not silently rewritten.
   let transfer;try{transfer=c6ReadAssetTransfer(bytes(c.scriptPubKey.hex),{asset:meta.name,unit:meta.unit});}catch{continue;}
   const addr=c.scriptPubKey.addresses?.[0];if(!addr||!wallet!.getAddresses().includes(addr))continue;
   rows.push({point:txid+':'+vout,txid,vout,valueAtomic:'0',quantityAtomic:transfer.amountAtomic,script:c.scriptPubKey.hex,address:addr});
  }
  const ordinary=await confirmedPoolCoins(rpc,await wallet!.getUTXOs() as any,{baseCurrency:wallet!.baseCurrency});live(token);
  setFunding(rows);setSponsors(ordinary.filter(c=>c.address&&wallet!.getAddresses().includes(c.address)));
 }
 async function unlock(create:boolean,backup?:any){if(!valid)throw Error('Open a Legacy, PQ or ECDSA testnet wallet first');const token=epoch.current;client.current?.terminate();await store.current?.close();const db=new IndexedDbSponsorStore({name:'neurai-c6-private-journal-v1'});store.current=db;
  const c=new C6WorkerClient({worker:runtime.createWorker(),store:db,rpc:async(m,p)=>{live(token);const r=await rpc(m,p);live(token);return r;},onStage:m=>{if(epoch.current===token&&!sync.isRunning())setPhase(m);},onCrash:e=>{if(epoch.current===token){lock();setError(e.message);}}});client.current=c;
  let journalReady=false;
  try{update(await c.derive({family:family!.family,mnemonic,passphrase,zkPassphrase:zkPass}));live(token);try{const history=await c.openJournal({create,backup});live(token);update(history);setHistoryReady(true);setSaved(!!backup);}catch(e){if(create||backup||!(e instanceof Error)||!e.message.startsWith('C6 private journal missing'))throw e;live(token);setHistoryReady(false);setSaved(false);}journalReady=true;setOpen(true);const scanned=await c.scan();live(token);update(scanned);await loadCoins(token);}catch(e){if(!journalReady){c.terminate();if(client.current===c)client.current=null;await db.close();}throw e;}}
 async function saveBackup(token:number){const b=await client.current!.backup();live(token);const url=URL.createObjectURL(new Blob([JSON.stringify(b)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=meta.name+'-c6-private.encrypted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setSaved(true);}
 async function prepare():Promise<C6PreparedAuthorization>{
  if(!open||!historyReady||!client.current)throw Error('Open the private wallet and create or restore its encrypted local history first');if(running.current)throw Error('Private asset operation already running');const token=epoch.current;running.current=true;setBusy(true);setError('');
  try{
   if(sync.isRunning())setPhase('Waiting for balance refresh');await sync.wait();live(token);
   const chosen=sponsors.find(c=>c.txid+':'+c.vout===selectedSponsor);if(!chosen)throw Error('Choose a confirmed XNA sponsor coin');const request:any={action,fee:'0',sponsorPoint:selectedSponsor,sponsorFee};let coin:OwnedCoin|undefined;
   if(action==='deposit'){coin=funding.find(c=>c.point===selectedFunding);if(!coin)throw Error('Choose an exact confirmed asset funding output');request.amountAtomic=String(parseAssetAmount(amount,meta.units));if(request.amountAtomic!==coin.quantityAtomic)throw Error('Asset funding quantity must exactly match the deposit');Object.assign(request,{funding:pointBytes(coin.txid,coin.vout),fundingPoint:coin.point,fundingValue:coin.quantityAtomic});}
   else if(action==='join')request.notes=[note,second];
   else {request.note=note;if(action==='transfer')request.recipients=recipients.map(r=>({recipient:r.recipient,amountAtomic:String(parseAssetAmount(r.amount,meta.units))}));else{request.amountAtomic=String(parseAssetAmount(amount,meta.units));request.payoutScript=await withdrawalScript(rpc,destination);live(token);}}
   const result=resume?await client.current.rebuild(resume,{sponsorPoint:selectedSponsor,sponsorFee}):await client.current.prepare(request);live(token);let raw=result.transaction.raw;
   if(result.transaction.funding){coin=coin??funding.find(c=>c.point===result.transaction.funding.point);if(!coin)throw Error('Original asset funding coin unavailable');const keys:any={};try{keys[coin.address]=await wallet!.getPrivateKeyByAddress(coin.address);live(token);const owned:any={address:coin.address,assetName:meta.name,txid:coin.txid,outputIndex:coin.vout,script:coin.script,satoshis:coin.quantityAtomic,value:coin.quantityAtomic};raw=signPoolInputs(wallet!.network,raw,[owned],keys,{[result.transaction.funding.index]:1});}finally{delete keys[coin.address];}}
   live(token);const signed=await client.current.recordSigned(result.operationId,raw);live(token);update(signed);setSaved(false);setResume('');
   return {raw,pool:runtime.config.expectedCommitment,notes:result.sponsorNotes,budgetAtomic:String(BigInt(sponsorFee)*2n),offer:result.transaction.sponsor};
  }finally{if(epoch.current===token){running.current=false;setBusy(false);}}
 }
 prepareRef.current=prepare;
 // Changing an amount must not reopen/reset the global sponsor journal.
 const sponsorRuntime=React.useMemo<C6PrivacyRuntime>(()=>({deployments:[runtime.config.deployment],budgetAtomic:'1000000000',actions:['Prepare selected asset operation'],prepare:()=>prepareRef.current()}),[runtime]);
 const sync=useC6BackgroundSync({active:open&&!!summary?.tip,paused:busy||sponsorBusy||!!fundingPreview,tip:summary?.tip,rpc,
  canStart:()=>!running.current,
  scan:async()=>{const token=epoch.current,result=await client.current!.scan();live(token);return result;},apply:update});
 const fmt=(n:string)=>formatXna(n);
 const walletPanel=<>
  <div className="rounded-xl border border-base-300 bg-base-200/35 p-4">
   <p className="neurai-eyebrow mb-1">Confirmed private balance</p>
   <strong className="block text-3xl tabular-nums">{open&&summary?fmt(summary.balanceAtomic):'—'} <span className="text-base font-normal">{meta.name}</span></strong>
   <p className="neurai-hint mb-0">{open&&summary?'Available: '+fmt(summary.spendableAtomic)+' '+meta.name:'Open your private wallet to recover its asset balance and notes.'}</p>
      {open&&summary?.tip&&<p className="neurai-hint m-0">Checked through block {summary.tip.height.toLocaleString('en-US')}</p>}
      {open&&<p className="neurai-hint m-0" aria-live="polite">{sync.syncing?'Updating private balance in the background…':'Private balance refreshes automatically after new blocks.'}</p>}
      {open&&sync.warning&&<p className="neurai-hint m-0" role="status">{sync.warning}</p>}
  </div>
  {!open?<>
   <C6LockedWalletHelp/>
   <label className="neurai-label">ZK passphrase (optional)<input className="neurai-input" aria-label="C6 asset private passphrase" type="password" autoComplete="off" disabled={!valid||busy} value={zkPass} onChange={e=>setZkPass(e.target.value)}/></label>
   <div className="flex flex-wrap gap-2"><button className="neurai-btn--primary" disabled={!valid||busy} onClick={()=>void run('Opening private asset wallet',()=>unlock(false))}>Open private asset wallet</button><button className="neurai-btn--secondary" disabled={!valid||busy} onClick={()=>void run('Creating private asset history',()=>unlock(true))}>Create new private asset history</button></div>
   <label className="neurai-label">Restore private history<input className="neurai-input" type="file" accept="application/json" disabled={!valid||busy} onChange={e=>{const f=e.target.files?.[0];if(f)void run('Restoring private asset history',async t=>{if(f.size>8001000)throw Error('Backup too large');const b=JSON.parse(await f.text());live(t);await unlock(false,b);});}}/></label>
  </>:<>
   <div className="flex flex-wrap gap-2"><button className="neurai-btn--secondary btn-sm" disabled={busy||!historyReady} onClick={()=>void run('Saving private asset history',saveBackup)}>Save private asset backup</button><button className="neurai-btn--secondary btn-sm" disabled={busy||sponsorBusy} onClick={()=>void run('Scanning private asset balance',async t=>{const result=await client.current!.scan();live(t);update(result);await loadCoins(t);})}>Scan now</button><button className="neurai-btn--secondary btn-sm" disabled={busy||sponsorBusy} onClick={()=>void run('Refreshing asset funding',loadCoins)}>Refresh funding and sponsor coins</button><button className="neurai-btn--secondary btn-sm" onClick={lock}>Cancel local work and lock</button></div>
   <p className="neurai-hint m-0">Local cancellation preserves all pending reservations and sponsor exposures.</p>
   {!historyReady&&<div className="neurai-stack"><p className="neurai-hint m-0">Read-only recovery. Restore your encrypted operation history if you used C6 before; create a new history only for first-time use.</p><button className="neurai-btn--secondary" disabled={busy} onClick={()=>void run('Creating private asset history',()=>unlock(true))}>Create new private asset history</button><label className="neurai-label">Restore private history<input className="neurai-input" type="file" accept="application/json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void run('Restoring private asset history',async t=>{if(f.size>8001000)throw Error('Backup too large');const b=JSON.parse(await f.text());live(t);await unlock(false,b);});}}/></label></div>}
   <p className="text-sm m-0">{saved?'Private backup downloaded. Local history continues to save automatically.':'Private history and sponsor authorizations save encrypted locally. Backups are optional downloads; keep them to move pending operations to another device.'}</p>
  </>}
  <div className="rounded-xl border border-base-300 p-3 neurai-stack">
   <label className="neurai-label">Receive privately<input className="neurai-input font-mono text-xs" aria-label="Private asset receiving address" readOnly placeholder="Open the private wallet to see its receiving address" value={open?receiving?.current.address??'':''}/></label>
   <p className="neurai-hint m-0">Share this private address for assignments inside this asset pool. Other pool balances remain separate.</p>
   <button className="neurai-btn--secondary btn-sm self-start" disabled={!open||!historyReady||busy||sponsorBusy} onClick={()=>void run('Creating a private asset address',async t=>{update(await client.current!.newAddress());live(t);setSaved(false);})}>New private asset address</button>
  </div>
 </>;
 const operationPanel=<>
  <fieldset className="neurai-stack min-w-0 border-0 p-0 m-0" disabled={!open||busy||sponsorBusy}>
   {action!=='deposit'&&<label className="neurai-label">Note<select className="neurai-input" aria-label="Asset note" value={note} onChange={e=>setNote(e.target.value)}><option value="">Select a note</option>{summary?.notes.filter(n=>n.spendable).map(n=><option key={n.cm} value={n.cm}>{fmt(n.amountAtomic)} · {n.cm.slice(0,8)}</option>)}</select></label>}
   {action==='join'&&<label className="neurai-label">Second note<select className="neurai-input" value={second} onChange={e=>setSecond(e.target.value)}><option value="">Select a second note</option>{summary?.notes.filter(n=>n.spendable&&n.cm!==note).map(n=><option key={n.cm} value={n.cm}>{fmt(n.amountAtomic)} · {n.cm.slice(0,8)}</option>)}</select></label>}
   {(action==='deposit'||action==='withdraw')&&<label className="neurai-label">Amount ({meta.name}, {meta.units} decimals)<input className="neurai-input" aria-label="Asset amount" value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
   {action==='deposit'&&<><label className="neurai-label">Exact asset funding<select className="neurai-input" aria-label="Asset funding coin" value={selectedFunding} onChange={e=>setSelectedFunding(e.target.value)}><option value="">Select a confirmed zero-XNA transfer</option>{funding.map(c=><option value={c.point} key={c.point}>{fmt(c.quantityAtomic)} · {c.point.slice(0,12)}</option>)}</select></label><button className="neurai-btn--secondary" disabled={busy||sponsorBusy} onClick={()=>void run('Preparing exact asset funding',async t=>{parseAssetAmount(amount,meta.units);const tx=await wallet!.createTransaction({amount,toAddress:wallet!.getAddresses()[0],assetName:meta.name});live(t);const raw=tx.debug?.signedTransaction;if(!raw)throw Error('Asset funding transaction unavailable');const admitted=await admitTransaction(rpc,raw);live(t);const checked=await inspectFundingTransaction(rpc,raw);live(t);setFundingPreview({raw,txid:admitted.txid,points:checked.points,amount,fee:formatXna(checked.feeAtomic)});})}>Prepare asset funding coin</button></>}
   {fundingPreview&&<C6TransactionReview title="Review asset funding" txid={fundingPreview.txid} amount={fundingPreview.amount} unit={meta.name} fee={fundingPreview.fee} busy={busy||sponsorBusy} onPublish={()=>void run('Publishing asset funding',async t=>{await publishTransaction(rpc,{genesis:runtime.config.deployment.genesis},fundingPreview);live(t);setFundingPreview(null);})} publishLabel="Publish asset funding coin" onClose={()=>setFundingPreview(null)}/>}
   {action==='withdraw'&&<label className="neurai-label">Legacy / PQ / ECDSA recipient<input className="neurai-input" aria-label="Asset withdrawal destination" value={destination} onChange={e=>setDestination(e.target.value)}/></label>}
   {action==='transfer'&&<>{recipients.map((r,i)=><div key={i}><input className="neurai-input" aria-label={'Asset private recipient '+(i+1)} placeholder="nzk…" value={r.recipient} onChange={e=>setRecipients(rows=>rows.map((row,j)=>j===i?{...row,recipient:e.target.value}:row))}/><input className="neurai-input" aria-label={'Asset recipient amount '+(i+1)} value={r.amount} onChange={e=>setRecipients(rows=>rows.map((row,j)=>j===i?{...row,amount:e.target.value}:row))}/></div>)}<button className="neurai-btn--secondary" disabled={busy||sponsorBusy||recipients.length>=3} onClick={()=>setRecipients(rows=>[...rows,{recipient:'',amount:'1'}])}>Add asset recipient</button><p>At most three output notes including authenticated change.</p></>}
   <label className="neurai-label">XNA sponsor<select className="neurai-input" aria-label="Asset sponsor coin" value={selectedSponsor} onChange={e=>setSelectedSponsor(e.target.value)}><option value="">Select a confirmed coin</option>{sponsors.map(c=><option key={c.txid+':'+c.vout} value={c.txid+':'+c.vout}>{formatXna(String(c.valueSats))} XNA · {c.txid.slice(0,12)}</option>)}</select></label>
   <label className="neurai-label">External fee (XNA)<select className="neurai-input" value={sponsorFee} onChange={e=>setSponsorFee(e.target.value)}>{runtime.config.manifest.sponsor_fees?.map(f=><option value={f} key={f}>{formatXna(f)}</option>)}</select></label>
  </fieldset>
  <p className="neurai-hint m-0">Asset quantities support {meta.units} decimals. The asset stays in its own pool; each operation needs a separate confirmed XNA sponsor coin. Nothing is sent until you review and publish.</p>
  {open&&historyReady?<C6PrivacyPool wallet={wallet} mnemonic={mnemonic} passphrase={passphrase} runtime={sponsorRuntime} onSwitchBlocked={setSponsorBusy}/>:<p className="neurai-hint m-0">Private proving and XNA sponsor authorization become available after opening the private wallet with encrypted local history.</p>}
 </>;
 return <C6WalletLayout title={'C6 · Private '+meta.name+' TEST'} label="C6 private asset wallet"
  description="Deposit assets, assign private notes, consolidate and withdraw. Proofs stay on this device. A separate XNA coin pays the fee."
  open={open} busy={busy} phase={phase} seconds={seconds} error={error} blockedReason={blockedReason}
  action={action} onAction={a=>{setAction(a);setResume('');}} actionsBlocked={!open||busy||sponsorBusy} onCancel={lock}
  walletPanel={walletPanel} operationPanel={operationPanel} history={open?<section className="neurai-card neurai-stack min-w-0"><h3 className="neurai-card__title">Operation history</h3>
   <div>{operations.map(o=><div key={o.id}>{o.action} · {o.outcome??o.phase}{!o.outcome&&o.phase==='prepared'&&<button className="neurai-btn--secondary" disabled={busy||sponsorBusy} onClick={()=>setResume(o.id)}>Resume this asset operation</button>}{!o.outcome&&o.phase==='draft'&&<button className="neurai-btn--secondary" disabled={busy||sponsorBusy} onClick={()=>void run('Releasing unexposed asset draft',async t=>{update(await client.current!.releaseDraft(o.id));live(t);})}>Release unexposed asset draft</button>}</div>)}{resume&&<p>Resuming {resume.slice(0,12)} with its original proof and current public paths.</p>}</div>
  </section>:undefined} identity={(runtime.config.manifest as typeof runtime.config.manifest & {identity?:string}).identity} commitment={runtime.config.expectedCommitment}/>;
}
