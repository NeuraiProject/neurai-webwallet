import React from 'react';
import type { Wallet } from '@neuraiproject/neurai-jswallet';
import Signer from '@neuraiproject/neurai-sign-transaction';
import { isTestnetChain } from './buildTarget';
import { PrivacyBenchmark } from './privacy-benchmark/PrivacyBenchmark';
import { createPoolWorker } from './privacy-pool/workerFactory';
import { scanCheckpointStore } from './privacy-pool/scanCheckpointStore';
import {
  C3_TESTNET_MANIFEST as manifest, C3_TEST_DEPOSIT_LIMIT_ATOMIC, parseXna, formatXna, ROTATION_MAX_GAP, PoolWorkerClient, assertPoolChain, recheckInputs,
  confirmedPoolCoins, selectPoolCoins, withdrawalScript, admitTransaction, inspectFundingTransaction, publishTransaction,
  publicationStatus, rotationStorageKey, loadRotation as loadStoredRotation, saveRotation as storeRotation,
  type ReceivingInfo, type PoolCoin, type PoolIdentityMessage, type PoolScanMessage, type PoolAddressesMessage,
  type PreparedPoolTransaction,
} from '@neuraiproject/neurai-privacy/client';
import './styles/privacy-pool.css';

type Note = {cm:string;amountAtomic:string;address?:{chain:number;index:number}|null};
/** Public receiving data from the worker; no keys. */
type AddressInfo = ReceivingInfo;
const MAX_GAP=ROTATION_MAX_GAP;
type Scan = {balanceAtomic:string;reserveAtomic:string;height:number;notes:Note[];transitions:{txid:string;form:string;height:number}[]};
type Coin = PoolCoin & {address:string};
type Preview = {raw:string;txid:string;form:string;fee:string;amount:string;points:{txid:string;vout:number}[];funding:boolean};
const EXPLORER='https://rebel-explorer-testnet.neurai.org/tx/';
function saveJson(name:string,value:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function elapsedLabel(ms:number) {const s=Math.floor(ms/1000);return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;}
type StatusTone='idle'|'done'|'error';
/** Status of the current step. The spinner and live timer appear only while work is running. */
export function OperationTimer({busy,phase,elapsed,tone='idle',onCancel}:{busy:boolean;phase:string;elapsed:number;tone?:StatusTone;onCancel?:()=>void}) {
  if(!busy)return <div className={`privacy-operation is-idle is-${tone}`} role="status" aria-live="polite">
    <span className="privacy-operation__dot" aria-hidden="true"/>
    <strong>{phase}</strong>
    {elapsed>0&&<small>Last step took {elapsedLabel(elapsed)}</small>}
  </div>;
  return <div className="privacy-operation is-running" role="status" aria-live="polite">
    <div className="privacy-operation__indicator" aria-hidden="true"/>
    <div><strong>{phase}</strong><small>Working on this device. You can keep this page open.</small></div>
    <time aria-label="Elapsed time">{elapsedLabel(elapsed)}</time>
    {onCancel&&<button className="btn btn-sm btn-outline" onClick={onCancel}>Cancel and lock</button>}
    <div className="privacy-operation__track" aria-hidden="true"><span/></div>
  </div>;
}
/** mnemonic and passphrase are the open wallet's words; they are only sent to the dedicated pool worker. */
export function PrivacyPool({wallet,mnemonic='',passphrase=''}:{wallet?:Wallet;mnemonic?:string;passphrase?:string}={}) {
  const [bench,setBench]=React.useState(false),[busy,setBusy]=React.useState(false),[phase,setPhase]=React.useState('Ready');
  const [elapsed,setElapsed]=React.useState(0),[error,setError]=React.useState(''),[lines,setLines]=React.useState<string[]>(['NEURAI C3 / TESTNET POOL','C:\\NEURAI> READY']);
  const [password,setPassword]=React.useState(''),[backup,setBackup]=React.useState<any>(null),[recipient,setRecipient]=React.useState<any>(null),[backupSaved,setBackupSaved]=React.useState(false);
  const [scan,setScan]=React.useState<Scan|null>(null),[action,setAction]=React.useState<'deposit'|'transfer'|'withdraw'>('deposit');
  const [amount,setAmount]=React.useState('10'),[recipientText,setRecipientText]=React.useState(''),[destination,setDestination]=React.useState(''),[note,setNote]=React.useState('');
  const [fee,setFee]=React.useState('0.1'),[preview,setPreview]=React.useState<Preview|null>(null),[published,setPublished]=React.useState('');
  const [uncertain,setUncertain]=React.useState(false);
  const [addresses,setAddresses]=React.useState<AddressInfo|null>(null),[zkPassphrase,setZkPassphrase]=React.useState(''),[account,setAccount]=React.useState('0'),[gapText,setGapText]=React.useState('20');
  const rotation=React.useRef<{gap:number;issued:number}|null>(null);
  // Latest receiving data, readable from async code without waiting for a render.
  const receiving=React.useRef<AddressInfo|null>(null);
  const updateAddresses=(info:AddressInfo|null)=>{receiving.current=info;setAddresses(info);};
  const clientRef=React.useRef<PoolWorkerClient|null>(null),busyRef=React.useRef(false),command=React.useRef(''),start=React.useRef(0),owned=React.useRef<Coin[]>([]);
  const mounted=React.useRef(true),epoch=React.useRef(0);
  const network=wallet?.network??'',testnet=isTestnetChain(network),legacy=network==='xna-test'||network==='xna-legacy-test';
  const append=(text:string)=>setLines(old=>[...old.slice(-70),text]);
  const end=()=>{busyRef.current=false;if(mounted.current){setElapsed(performance.now()-start.current);setBusy(false);}};
  const fail=(e:unknown)=>{const text=e instanceof Error?e.message:String(e);setError(text);setPhase('Operation stopped');append('[ERROR] '+text);end();};
  const begin=(text:string)=>{if(busyRef.current)throw new Error('An operation is already running');busyRef.current=true;setBusy(true);setError('');setElapsed(0);setPhase(text);start.current=performance.now();append('[RUN] '+text);};
  async function rpc(method:string,params:unknown[]=[]):Promise<any> {
    if(!wallet || !isTestnetChain(wallet.network))throw new Error('Connect a testnet wallet first');
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try {return await Promise.race([wallet.rpc(method,params),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error(`RPC timeout: ${method}`)),45000);})]);}
    finally {clearTimeout(timeout);}
  }
  const chainCheck=()=>assertPoolChain(rpc,manifest);
  React.useEffect(()=>{if(!busy)return;const id=setInterval(()=>setElapsed(performance.now()-start.current),200);return()=>clearInterval(id);},[busy]);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;clientRef.current?.terminate();clientRef.current=null;};},[]);
  function lock() {
    epoch.current++;clientRef.current?.terminate();clientRef.current=null;busyRef.current=false;setBusy(false);setRecipient(null);setBackup(null);setBackupSaved(false);setScan(null);setPassword('');setZkPassphrase('');updateAddresses(null);rotation.current=null;setPreview(null);setPhase('Privacy wallet locked');
  }
  React.useEffect(()=>{lock();setPublished('');setUncertain(false);},[wallet]);
  const checkInputs=(points:Preview['points'])=>recheckInputs(rpc,manifest,points);
  async function reviewPrepared(result:PreparedPoolTransaction) {
    const current=epoch.current;
    try {
      setPhase('Signing funding inputs locally');await checkInputs(result.inputPoints);
      const keys:Record<string,any>={};for(const c of owned.current){const key=wallet!.getPrivateKeyByAddress(c.address);if(!key)throw new Error('Funding key is unavailable');keys[c.address]=key;}
      const raw=Signer.sign('xna-test',result.raw,owned.current as any,keys);
      for(const key of Object.keys(keys))delete keys[key];
      setPhase('Checking admission with the testnet node');
      const {txid}=await admitTransaction(rpc,raw);
      if(!mounted.current||current!==epoch.current)return;
      setPreview({raw,txid,form:result.form,fee:formatXna(BigInt(result.feeAtomic)),amount:formatXna(BigInt(result.amountAtomic)),points:result.inputPoints,funding:false});
      setPhase('Proof verified · review before publishing');append('[OK] '+result.form+' accepted by testmempoolaccept. Nothing broadcast.');end();
    } catch(e){if(current===epoch.current&&mounted.current)fail(e);}
  }
  // The library client bridges read-only RPC for the worker and resolves one operation at a time.
  function client() {
    if(clientRef.current&&!clientRef.current.stopped)return clientRef.current;
    const c:PoolWorkerClient=new PoolWorkerClient({worker:createPoolWorker(),rpc,
      onStage:message=>{if(c===clientRef.current){setPhase(message);append('[..] '+message);}},
      // A crashed worker lost the identity: show the panel as locked. The next operation starts a new worker.
      onCrash:e=>{if(c!==clientRef.current||!mounted.current)return;clientRef.current=null;setRecipient(null);updateAddresses(null);fail(e);}});
    clientRef.current=c;return c;
  }
  /** Report a failed worker operation unless the panel was locked or the crash was already reported. */
  function workerFailed(c:PoolWorkerClient,e:unknown,current:number) {
    if(current!==epoch.current||!mounted.current||c.stopped)return;
    fail(e);
  }
  function showIdentity(data:PoolIdentityMessage) {
    setRecipient(data.recipient);setBackup(data.backup);updateAddresses(data.addresses??null);setPassword('');setZkPassphrase('');
    if(data.addresses?.kind==='derived'){
      // Nothing to back up: the words, passphrase, ZK passphrase and account recover it.
      setBackupSaved(true);const stored=loadRotation(data.addresses);rotation.current=stored??{gap:data.addresses.gap!,issued:data.addresses.issued!};
      setGapText(String(rotation.current!.gap));setPhase('Private wallet derived');append('[OK] Private wallet derived from the wallet words · check '+data.addresses.fingerprint);
    } else {setPhase('Privacy wallet unlocked');append('[OK] Privacy identity unlocked locally.');}
  }
  function showScan(data:PoolScanMessage) {
    setScan(data.result);setNote(old=>data.result.notes.some(n=>n.cm===old)?old:(data.result.notes[0]?.cm??''));
    if(data.recipient)setRecipient(data.recipient);if(data.addresses){updateAddresses(data.addresses);saveRotation(data.addresses);}
  }
  function showAddresses(data:PoolAddressesMessage) {setRecipient(data.recipient);updateAddresses(data.addresses);saveRotation(data.addresses);}
  type Request={type:'create';password:string}|{type:'restore';backup:string;password:string}
    |{type:'derive';mnemonic:string;passphrase:string;zkPassphrase:string;account:number}
    |{type:'scan';gap?:number;issued?:number}|{type:'new-address';force:boolean};
  async function request(r:Request) {
    if(busyRef.current)return;
    const current=epoch.current,live=()=>current===epoch.current&&mounted.current;
    const label=r.type==='scan'?'Recovering confirmed notes':r.type==='derive'?'Deriving the private wallet':r.type==='new-address'?'Preparing a new address':'Opening privacy wallet';
    let c:PoolWorkerClient|undefined;
    try {
      begin(label);if(r.type!=='new-address')await chainCheck();if(!live())return;command.current=r.type;c=client();
      if(r.type==='scan'){
        const checkpoint=await loadCheckpoint();if(!live())return;
        const data=await c.scan({gap:r.gap,issued:r.issued,checkpoint});if(!live())return;
        showScan(data);void saveCheckpoint(data.addresses??receiving.current,data.checkpoint);
      }
      else if(r.type==='new-address'){const data=await c.newAddress({force:r.force});if(!live())return;showAddresses(data);}
      else {
        const data=r.type==='create'?await c.create(r):r.type==='restore'?await c.restore(r):await c.derive(r);
        if(!live())return;showIdentity(data);
      }
      setPhase(r.type==='new-address'?'New receiving address ready':'Operation completed');end();
      // A derived wallet needs a scan to know which addresses are used.
      if(r.type==='derive')void request({type:'scan',...(rotation.current??{})});
    } catch(e){if(c)workerFailed(c,e,current);else if(live())fail(e);}
  }
  // Rotation state is not secret: last handed-out index and gap, per wallet, family check and account.
  const browserStorage=()=>{try {return globalThis.localStorage;} catch {return null;}};
  const rotationKey=(info:AddressInfo)=>rotationStorageKey({network,walletId:wallet?.getAddresses?.()?.[0]??'',fingerprint:info.fingerprint!,account:info.account!});
  const loadRotation=(info:AddressInfo)=>loadStoredRotation(browserStorage(),rotationKey(info));
  function saveRotation(info:AddressInfo) {
    if(info.kind!=='derived')return;rotation.current={gap:info.gap!,issued:info.issued!};
    storeRotation(browserStorage(),rotationKey(info),rotation.current); // private mode: the chain still recovers everything
  }
  // The worker returns an encrypted checkpoint with each scan, so a reopened wallet resumes
  // instead of replaying the whole pool. Only wallets derived from the words have a stable key;
  // a file identity scans from the pool birth each time it is opened.
  const checkpointKey=(info:AddressInfo)=>rotationKey(info)+':scan';
  async function loadCheckpoint():Promise<string|undefined> {
    const info=receiving.current;if(info?.kind!=='derived')return undefined;
    try {return await scanCheckpointStore()?.get(checkpointKey(info));} catch {return undefined;}
  }
  async function saveCheckpoint(info:AddressInfo|null,checkpoint:string|null) {
    if(info?.kind!=='derived'||!checkpoint)return;
    try {await scanCheckpointStore()?.set(checkpointKey(info),checkpoint);}
    catch {/* Storage full or unavailable: the next scan starts from the pool birth. */}
  }
  function openFromWords() {
    const n=Number(account);
    if(!mnemonic){setError('This wallet was opened without its words. Use an encrypted backup file.');return;}
    if(!/^\d+$/.test(account)||!Number.isSafeInteger(n)||n>=2**31){setError('Account must be a whole number from 0.');return;}
    setBackupSaved(false);void request({type:'derive',mnemonic,passphrase,zkPassphrase,account:n});
  }
  function newAddress() {
    if(addresses?.kind!=='derived')return;
    const gap=addresses.gap??20,next=addresses.current.index+1;let force=false;
    if(next>(addresses.maxUsed??-1)+gap) {
      if(!window.confirm(`You already have ${gap} unused addresses in a row. A recovery with gap ${gap} may not find notes sent to a later address. Create it anyway?`))return;
      force=true;
    }
    void request({type:'new-address',force});
  }
  function applyGap() {
    const gap=Number(gapText);
    if(!/^\d+$/.test(gapText)||gap<1||gap>MAX_GAP){setError(`Gap limit must be a whole number from 1 to ${MAX_GAP}.`);return;}
    void request({type:'scan',gap,issued:addresses?.issued??0});
  }
  async function copyText(text:string,what:string) {
    try {await navigator.clipboard.writeText(text);setError('');setPhase(what+' copied');append('[OK] '+what+' copied to the clipboard.');}
    catch {setError('Copying is not available in this browser. Select the text and copy it manually.');}
  }
  async function restore(file?:File) {
    if(!file)return;
    try {if(file.size>1048576)throw new Error('Privacy backup exceeds 1 MiB');const value=JSON.parse(await file.text());setBackupSaved(true);await request({type:'restore',backup:value,password});}
    catch(e){fail(e);}
  }
  async function coins():Promise<Coin[]> {
    return await confirmedPoolCoins(rpc,await wallet!.getUTXOs() as any,{baseCurrency:wallet!.baseCurrency}) as Coin[];
  }
  async function prepare() {
    if(busyRef.current)return;
    const current=epoch.current;
    let c:PoolWorkerClient|undefined;
    try {
      begin('Checking wallet funding');setPreview(null);await chainCheck();
      if(!legacy||!backupSaved)throw new Error('Use a Legacy testnet wallet and save the encrypted privacy JSON first');
      const feeAtomic=parseXna(fee).toString();
      const amountAtomic=action==='withdraw'?'0':parseXna(amount).toString();
      const {funding,sponsor}=selectPoolCoins(await coins(),{action,amountAtomic,feeAtomic}) as {funding?:Coin;sponsor:Coin};
      const payout=action==='withdraw'?await withdrawalScript(rpc,destination):undefined;
      if(current!==epoch.current||!mounted.current)return;
      owned.current=[...(funding?[funding]:[]),sponsor];command.current='prepare';c=client();
      const result=await c.prepare({action,amountAtomic,feeAtomic,funding,sponsor,payout,note,recipient:recipientText});
      if(current!==epoch.current||!mounted.current)return;
      await reviewPrepared(result);
    }catch(e){if(c)workerFailed(c,e,current);else fail(e);}
  }
  async function prepareFunding() {
    if(busyRef.current)return;
    const current=epoch.current;
    try {
      command.current='funding';begin('Preparing an exact deposit coin');setPreview(null);await chainCheck();
      const atomic=parseXna(amount);if(atomic>C3_TEST_DEPOSIT_LIMIT_ATOMIC)throw new Error('TEST deposit limit: 1,000 XNA');const value=formatXna(atomic);
      const toAddress=wallet!.getAddresses()[0];
      const result=await wallet!.createTransaction({amount:value,toAddress,assetName:wallet!.baseCurrency});
      const raw=result.debug?.signedTransaction;if(!raw)throw new Error('Wallet did not return a signed funding transaction');
      const funding=await inspectFundingTransaction(rpc,raw);
      if(current!==epoch.current||!mounted.current)return;
      setPreview({raw,txid:funding.txid,form:'Funding preparation',fee:formatXna(funding.feeAtomic),amount:value,points:funding.points,funding:true});setPhase('Review the funding transaction');end();
    }catch(e){fail(e);}
  }
  async function publish() {
    if(!preview||busyRef.current)return;const p=preview;
    try {
      command.current='publish';begin('Rechecking inputs before publication');
      // The txid is recorded before sending: a failed call leaves the outcome uncertain.
      const txid=await publishTransaction(rpc,manifest,{raw:p.raw,txid:p.txid,points:p.points},
        {onBroadcast:id=>{setPhase('Publishing to testnet');setPublished(id);setUncertain(true);}});
      setUncertain(false);setPreview(null);setScan(null);setPhase('Published · waiting for confirmation');append('[TX] '+txid);end();
    }catch(e){fail(e);}
  }
  async function checkPublication() {
    if(!published||busyRef.current)return;
    try {
      command.current='check-publication';begin('Checking the submitted transaction');
      const status=await publicationStatus(rpc,manifest,{txid:published,raw:preview?.raw,points:preview?.points});
      setUncertain(false);
      if(status==='retryable'){setPhase('Node has not seen it · the same transaction can be retried');end();return;}
      setPreview(null);setPhase(status==='confirmed'?'Transaction confirmed':'Transaction is in the mempool');end();
    }catch(e){fail(e);}
  }
  const selected=scan?.notes.find(n=>n.cm===note);
  const canOperate=testnet&&legacy&&!!recipient&&backupSaved&&!busy&&!uncertain;
  // The first missing condition, shown instead of silently disabled controls.
  const requirement=!testnet?'':!legacy?'Open a Testnet Legacy wallet: this C3 pool only accepts Legacy funding and withdrawal addresses.'
    :!recipient?'Create or open your private wallet in step 1.':!backupSaved?'Save your encrypted backup in step 1 before using the pool.'
    :uncertain?'Check the pending publication below before starting another operation.'
    :action!=='deposit'&&scan&&scan.notes.length===0?'You have no spendable private notes yet. Make a deposit first.':'';
  const locked=!canOperate||!!preview;
  const derived=addresses?.kind==='derived';
  const tone:StatusTone=error?'error':elapsed>0?'done':'idle';
  const cancel=busy&&command.current==='prepare'&&phase!=='Publishing to testnet'?()=>{lock();append('[STOP] Worker terminated; reload your privacy JSON to continue.');}:undefined;
  const feeField=<label>Public network fee (XNA)<input inputMode="decimal" value={fee} onChange={e=>setFee(e.target.value)} disabled={locked}/></label>;
  const noteField=<label>Note to spend<select value={note} onChange={e=>setNote(e.target.value)} disabled={locked}><option value="">{scan?'Select a note':'Refresh notes in step 1 first'}</option>{scan?.notes.map(n=><option value={n.cm} key={n.cm}>{formatXna(BigInt(n.amountAtomic))} XNA · {n.cm.slice(0,12)}…</option>)}</select></label>;
  const buildButton=<button className="btn btn-primary" disabled={locked||(action!=='deposit'&&!note)} onClick={()=>void prepare()}>Build and verify proof</button>;
  return <section className="privacy-pool" aria-label="Privacy Pool">
    <header className="privacy-pool__hero"><div><span className="privacy-pool__eyebrow">NEURAI / TESTNET LAB</span><h1>Privacy Pool</h1><p>Deposit XNA, assign a private note, and withdraw to a wallet. Proofs are built on your device.</p></div>
      <button className="btn btn-outline" disabled={busy} onClick={()=>setBench(x=>!x)} aria-expanded={bench}>{bench?'Back to pool':'Open benchmark'}</button></header>
    {bench?<PrivacyBenchmark/>:<>
      <div className="privacy-pool__notice">C3 TEST keys · XNA only · Legacy funding and withdrawal addresses. This pool does not accept valuable funds.</div>
      {!testnet&&<p role="alert">Switch to a testnet wallet to use the pool.</p>}
      <div className="privacy-pool__grid">
        <section className="privacy-pool__card">
          <div className="privacy-pool__card-head"><h2>1. Private wallet</h2>{recipient&&<button className="btn btn-sm btn-ghost" disabled={busy} onClick={lock}>Lock</button>}</div>
          {!recipient?<>
            <p className="privacy-pool__lead">Open your private wallet from this wallet’s words. Nothing needs to be saved: the same words, passphrase, ZK passphrase and account always give the same private wallet.</p>
            {!mnemonic&&<p className="privacy-pool__hint">This wallet was opened without its words. Use an encrypted backup file below.</p>}
            <label>ZK passphrase (optional)<input type="password" aria-label="ZK passphrase" autoComplete="off" value={zkPassphrase} onChange={e=>setZkPassphrase(e.target.value)} disabled={busy||!mnemonic}/></label>
            <small>It has no checksum: a typo opens a different, empty private wallet. Spaces count.</small>
            <label>Account<input inputMode="numeric" aria-label="Account" value={account} onChange={e=>setAccount(e.target.value.trim())} disabled={busy||!mnemonic}/></label>
            <div className="privacy-pool__actions"><button className="btn btn-primary" disabled={!testnet||busy||!mnemonic} onClick={openFromWords}>Open private wallet</button></div>
            <details className="privacy-pool__alt"><summary>Use an encrypted backup file instead</summary>
              <label>Backup password<input type="password" aria-label="Backup password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
              <small>New backup: at least 12 characters. Existing backup: type its password, then choose the file.</small>
              <div className="privacy-pool__actions"><button className="btn btn-outline" disabled={!testnet||busy||password.length<12} onClick={()=>{setBackupSaved(false);void request({type:'create',password});}}>Create privacy wallet</button>
                <label className={`btn btn-outline ${busy||!testnet||password.length<1?'btn-disabled':''}`}>Load privacy JSON<input type="file" accept=".json" hidden disabled={busy||!testnet||password.length<1} onChange={e=>void restore(e.target.files?.[0])}/></label></div>
            </details>
          </>:<>
            <div className="privacy-pool__balance"><small>Confirmed private balance</small><strong>{scan?formatXna(BigInt(scan.balanceAtomic)):'—'} <span>XNA</span></strong>
              <div className="privacy-pool__sync"><small>{scan?`${scan.notes.length} spendable notes · checked through block ${scan.height}`:'Notes not loaded yet'}</small>
                <button className="btn btn-sm btn-outline" disabled={busy} onClick={()=>void request({type:'scan'})}>Refresh notes</button></div></div>
            {derived?<div className="privacy-pool__block is-done">
              <h3>✓ Recovered from the wallet words</h3>
              <p>Account {addresses!.account} · check <code>{addresses!.fingerprint}</code>. Opening it again with the same ZK passphrase must show the same check.</p>
              <details><summary>Recovery settings</summary>
                <label>Gap limit (1–{MAX_GAP})<input inputMode="numeric" aria-label="Recovery gap limit" value={gapText} onChange={e=>setGapText(e.target.value.trim())} disabled={busy}/></label>
                <small>Recovery stops after this many unused addresses in a row. Larger values take longer.</small>
                <button className="btn btn-sm btn-outline" disabled={busy} onClick={applyGap}>Apply and refresh</button>
              </details>
            </div>:<div className={`privacy-pool__block ${backupSaved?'is-done':'is-warning'}`}>
              <h3>{backupSaved?'✓ Encrypted backup saved':'Encrypted backup'}</h3>
              <p>{backupSaved?'Keep the file and its password. They are the only way to recover these notes.':'Save it before using the pool. Without it these notes cannot be recovered.'}</p>
              <button className={`btn btn-sm ${backupSaved?'btn-outline':'btn-primary'}`} disabled={busy} onClick={()=>{saveJson('neurai-privacy-test-backup.json',backup);setBackupSaved(true);}}>Save encrypted JSON</button>
            </div>}
            <div className="privacy-pool__block">
              <h3>Receive privately</h3>
              <p>{derived?'Share this address. After it receives a note a new one appears; earlier addresses keep working.':'Share this address. A backup file has a single address; open from the wallet words to get a new one after each payment.'}</p>
              {addresses&&<><code className="privacy-pool__nzk" aria-label="Receiving address">{addresses.current.address}</code>{derived&&<small>Address #{addresses.current.index} · account {addresses.account}</small>}</>}
              <div className="privacy-pool__actions">
                {addresses&&<button className="btn btn-sm btn-outline" disabled={busy} onClick={()=>void copyText(addresses.current.address,'Receiving address')}>Copy address</button>}
                {derived&&<button className="btn btn-sm btn-outline" disabled={busy} onClick={newAddress}>New address</button>}
                <button className="btn btn-sm btn-outline" disabled={busy} onClick={()=>saveJson('neurai-privacy-recipient.json',recipient)}>Save receiving descriptor</button>
              </div>
              {derived&&addresses!.used.length>0&&<details><summary>Used addresses ({addresses!.used.length})</summary>
                <ul className="privacy-pool__used">{addresses!.used.map(u=><li key={u.index}><span>#{u.index}</span><code>{u.address.slice(0,18)}…{u.address.slice(-8)}</code><strong>{formatXna(BigInt(u.receivedAtomic))} XNA</strong></li>)}</ul></details>}
              <details><summary>Show descriptor JSON</summary><textarea readOnly value={JSON.stringify(recipient,null,2)} aria-label="Receiving descriptor"/></details>
            </div>
          </>}
        </section>
        <section className="privacy-pool__card"><h2>2. Use the pool</h2>
          <div className="privacy-pool__tabs" role="group" aria-label="Pool operation">{(['deposit','transfer','withdraw'] as const).map(a=><button key={a} aria-pressed={action===a} disabled={busy||!!preview} onClick={()=>setAction(a)}>{a==='transfer'?'Assign':a[0].toUpperCase()+a.slice(1)}</button>)}</div>
          <p className="privacy-pool__lead">{action==='deposit'?'Move XNA from this wallet into a new private note.':action==='transfer'?'Give part or all of one of your notes to another private wallet. Any remainder comes back to you as a new note.':'Turn one whole note back into XNA at a Legacy testnet address.'}</p>
          {requirement&&<p className="privacy-pool__hint">{requirement}</p>}
          {action==='deposit'&&<>
            <label>Deposit amount (XNA, up to 1,000)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={locked}/></label>
            {feeField}
            <ol className="privacy-pool__steps">
              <li><div><strong>Prepare an exact coin</strong><small>Sends the deposit amount to your own address. Publish it and wait for one confirmation.</small></div>
                <button className="btn btn-outline" disabled={locked} onClick={()=>void prepareFunding()}>Prepare deposit coin</button></li>
              <li><div><strong>Create the private note</strong><small>Builds and verifies the proof on this device. Nothing is published until you review it.</small></div>{buildButton}</li>
            </ol>
          </>}
          {action==='transfer'&&<>
            {noteField}
            <label>Amount to assign (XNA)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={locked}/></label>
            <label>Recipient address or descriptor<textarea value={recipientText} onChange={e=>setRecipientText(e.target.value)} placeholder="tnzk1… or the recipient’s JSON descriptor" disabled={locked}/></label>
            {feeField}
            <div className="privacy-pool__actions">{buildButton}</div><small>Nothing is published until you review it.</small>
          </>}
          {action==='withdraw'&&<>
            {noteField}
            <p className="privacy-pool__lead">This withdrawal spends the whole selected note: <strong>{selected?formatXna(BigInt(selected.amountAtomic)):'—'} XNA</strong>. To withdraw less, first assign part of it to your own descriptor.</p>
            <label>Legacy withdrawal address<input value={destination} onChange={e=>setDestination(e.target.value)} disabled={locked}/></label>
            {feeField}
            <div className="privacy-pool__actions">{buildButton}</div><small>Nothing is published until you review it.</small>
          </>}
        </section>
      </div>
      {error&&<p className="privacy-pool__error" role="alert">{error}</p>}
      {preview&&<section className="privacy-pool__card privacy-pool__review"><h2>3. Review and publish</h2><p>{preview.form} · <strong>{preview.amount} XNA</strong> · network fee <strong>{preview.fee} XNA</strong></p><p>The node accepted the prepared transaction. It has not been broadcast.</p><code>{preview.txid}</code><div className="privacy-pool__actions"><button className="btn btn-primary" disabled={busy||uncertain} onClick={()=>void publish()}>Publish TEST transaction</button><button className="btn btn-outline" disabled={busy||uncertain} onClick={()=>setPreview(null)}>Discard</button></div></section>}
      {published&&<div className="privacy-pool__card privacy-pool__published"><p>{uncertain?'Publication result is uncertain. Check this transaction before building another one.':'Transaction sent. Refresh notes after it confirms.'}</p><div className="privacy-pool__actions"><a className="btn btn-sm btn-ghost" href={EXPLORER+published} target="_blank" rel="noreferrer">View {published.slice(0,16)}… in the explorer</a><button className="btn btn-sm btn-outline" disabled={busy} onClick={()=>void checkPublication()}>Check transaction status</button></div></div>}
      <OperationTimer busy={busy} phase={phase} elapsed={elapsed} tone={tone} onCancel={cancel}/>
      <details className="privacy-pool__card"><summary>Confirmed pool activity</summary><p>Pool instance: <code>{manifest.identity}</code></p><p className="privacy-pool__address">{manifest.address}</p>{scan?.transitions.slice(-12).reverse().map(t=><div key={t.txid}><strong>{t.form}</strong> · block {t.height} · <a href={EXPLORER+t.txid} target="_blank" rel="noreferrer">{t.txid.slice(0,20)}…</a></div>)}</details>
      <div className="privacy-console"><div className="privacy-console__titlebar">{'C:\\NEURAI\\PRIVACY · OPERATION LOG'}</div><div className="privacy-console__body" role="log" aria-label="Pool operation log">{lines.map((line,i)=><div className="privacy-console__line" key={i}>{line}</div>)}{busy&&<span className="privacy-console__cursor">█</span>}</div></div>
    </>}
  </section>;
}

/**
 * Keeps the pool mounted while other wallet sections are open, like HomePanel and
 * SendPanel, so an unlocked identity, its notes and a running step survive
 * navigation. Keyed by wallet so another wallet never inherits this identity.
 */
export function PrivacyPanel({active,wallet,mnemonic,passphrase}:{active:boolean;wallet:Wallet;mnemonic?:string;passphrase?:string}) {
  const walletKey=`${wallet.network}:${wallet.getAddresses()[0]}`;
  return <div hidden={!active}><PrivacyPool key={walletKey} wallet={wallet} mnemonic={mnemonic} passphrase={passphrase}/></div>;
}
