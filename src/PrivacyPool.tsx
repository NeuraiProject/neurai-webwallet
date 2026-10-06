import {C6_ASSET_TESTNET_RUNTIME,C6_XNA_TESTNET_RUNTIME,C6_XNA_UNAVAILABLE_REASON} from './privacy-pool/c6Deployment';
import type {C6XnaRuntime} from './privacy-pool/C6XnaPrivacyPool';
import type {C6PrivacyRuntime} from './privacy-pool/C6PrivacyPool';
import React from 'react';
import type { C4Manifest, C5Manifest } from '@neuraiproject/neurai-privacy/browser';
import type { Wallet } from '@neuraiproject/neurai-jswallet';
import {poolWalletNetwork,signPoolTransaction} from './privacy-pool/walletNetwork';
import { isTestnetChain } from './buildTarget';
import { PrivacyBenchmark } from './privacy-benchmark/PrivacyBenchmark';
import { createPoolWorker, createC5PoolWorker } from './privacy-pool/workerFactory';
import { C4_TESTNET_DEPLOYMENT, C5_TESTNET_DEPLOYMENT, C5_UNAVAILABLE_REASON } from './privacy-pool/deployment';
import { scanCheckpointStore } from './privacy-pool/scanCheckpointStore';
import {
  parseXna, formatXna, ROTATION_MAX_GAP, PoolWorkerClient, assertPoolChain, recheckInputs,
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
  if(!busy)return <div className={`privacy-operation neurai-card neurai-card--compact is-idle is-${tone}`} role="status" aria-live="polite">
    <span className="privacy-operation__dot" aria-hidden="true"/>
    <strong className="text-sm font-semibold">{phase}</strong>
    {elapsed>0&&<small className="ml-auto text-xs text-base-content/70">Last step took {elapsedLabel(elapsed)}</small>}
  </div>;
  return <div className="privacy-operation neurai-card neurai-card--compact is-running" role="status" aria-live="polite">
    <div className="privacy-operation__indicator" aria-hidden="true"/>
    <div className="min-w-0"><strong className="block text-sm font-semibold">{phase}</strong><small className="block text-xs text-base-content/70">Working on this device. You can keep this page open.</small></div>
    <time className="ml-auto font-mono text-2xl font-semibold tabular-nums" aria-label="Elapsed time">{elapsedLabel(elapsed)}</time>
    {onCancel&&<button className="neurai-btn--secondary btn-sm" onClick={onCancel}>Cancel and lock</button>}
    <div className="privacy-operation__track" aria-hidden="true"><span/></div>
  </div>;
}
/** mnemonic and passphrase are the open wallet's words; they are only sent to the dedicated pool worker. */
/** Deployment configuration is supplied by the application, never an RPC response. */
export interface PrivacyPoolDeployment {
  manifest:(C4Manifest|C5Manifest)&{address?:string};
  createWorker:()=>Worker;
  explorerBaseUrl?:string|null;
}
const C6PrivacyPool=React.lazy(()=>import('./privacy-pool/C6PrivacyPool').then(module=>({default:module.C6PrivacyPool})));
const C6XnaPrivacyPool=React.lazy(()=>import('./privacy-pool/C6XnaPrivacyPool').then(module=>({default:module.C6XnaPrivacyPool})));
const C6AssetPrivacyPool=React.lazy(()=>import('./privacy-pool/C6AssetPrivacyPool').then(m=>({default:m.C6AssetPrivacyPool})));
type PoolVersion='C4'|'C5'|'C6';
const POOL_LABELS:Record<PoolVersion,string>={C4:'C4 · original TEST pool',C5:'C5 · smaller proving parameters',C6:'C6 · portable proofs and sponsor recovery'};
const ALL_POOL_VERSIONS:readonly PoolVersion[]=['C4','C5','C6'];
/** `versions` limits the selector; `c6Assets={false}` hides the C6 asset pool. */
type PrivacyPoolProps={wallet?:Wallet;mnemonic?:string;passphrase?:string;deployment?:PrivacyPoolDeployment;
  deployments?:Partial<Record<'C4'|'C5',PrivacyPoolDeployment>>;c6?:C6PrivacyRuntime|{xna:C6XnaRuntime};
  versions?:readonly PoolVersion[];c6Assets?:boolean};
const PUBLIC_C4:PrivacyPoolDeployment={manifest:C4_TESTNET_DEPLOYMENT.manifest,createWorker:createPoolWorker};
const PUBLIC_C5:PrivacyPoolDeployment|null=C5_TESTNET_DEPLOYMENT?{manifest:C5_TESTNET_DEPLOYMENT.manifest,createWorker:createC5PoolWorker}:null;
/** Every selected pool gets a fresh session/worker; private state is never shared. */
export function PrivacyPool(props:PrivacyPoolProps={}) {
  const options=React.useMemo(()=>props.deployments??(props.deployment
    ?{[props.deployment.manifest.schema==='neurai-c5-xna-test-v1'?'C5':'C4']:props.deployment}
    :{C4:PUBLIC_C4,...(PUBLIC_C5?{C5:PUBLIC_C5}:{})}),[props.deployment,props.deployments]);
  const versions=props.versions??ALL_POOL_VERSIONS;
  const [selected,setSelected]=React.useState<PoolVersion>(()=>{
    const preferred=props.deployment?.manifest.schema==='neurai-c5-xna-test-v1'?'C5':'C4';
    return versions.includes(preferred)?preferred:versions[0];
  });
  const [c6Currency,setC6Currency]=React.useState('XNA');
  const [switchBlocked,setSwitchBlocked]=React.useState(false);
  const c6=props.c6??(C6_XNA_TESTNET_RUNTIME?{xna:C6_XNA_TESTNET_RUNTIME}:undefined);
  const c6Asset=props.c6Assets===false?null:C6_ASSET_TESTNET_RUNTIME;
  const chosen=selected==='C6'?null:options[selected];
  return <div className="neurai-stack" style={{display:'grid',gap:'1rem'}}>
    <div className="neurai-card neurai-card--compact">
      <label htmlFor="privacy-pool-version" className="neurai-label">Pool version</label>
      <select id="privacy-pool-version" className="neurai-input" value={selected} disabled={switchBlocked}
        onChange={e=>{const value=versions.find(v=>v===e.target.value);if(!switchBlocked&&value){setSelected(value);setSwitchBlocked(false);}}}>
        {versions.map(v=><option key={v} value={v}>{POOL_LABELS[v]}</option>)}
      </select>
      {versions.length>1&&<p className="neurai-hint mt-2 mb-0">Each pool has a separate private balance. Switching locks the private wallet.</p>}
      {switchBlocked&&versions.length>1&&<p className="neurai-hint mt-2 mb-0">Finish or cancel the operation and resolve pending transactions before switching.</p>}
    </div>
    {selected==='C6'&&c6Asset&&<label>Pool currency<select aria-label="C6 pool currency" value={c6Currency} disabled={switchBlocked} onChange={e=>{if(!switchBlocked)setC6Currency(e.target.value);}}><option value="XNA">XNA</option><option value="asset">{c6Asset.config.manifest.asset} · ordinary asset TEST</option></select></label>}
    {selected==='C6'&&c6Currency==='asset'&&c6Asset?<React.Suspense fallback={<p role="status">Loading private asset wallet…</p>}><C6AssetPrivacyPool key={c6Asset.config.expectedCommitment} wallet={props.wallet} mnemonic={props.mnemonic} passphrase={props.passphrase} runtime={c6Asset} onSwitchBlocked={setSwitchBlocked}/></React.Suspense>:selected==='C6'&&c6?<React.Suspense fallback={<p role="status">Loading C6 wallet…</p>}>{'xna' in c6?<C6XnaPrivacyPool key={'C6-XNA'} wallet={props.wallet} mnemonic={props.mnemonic} passphrase={props.passphrase} runtime={c6.xna} onSwitchBlocked={setSwitchBlocked}/>:<C6PrivacyPool key={'C6'} wallet={props.wallet} mnemonic={props.mnemonic} passphrase={props.passphrase} runtime={c6} onSwitchBlocked={setSwitchBlocked}/>}</React.Suspense>:chosen?<PrivacyPoolSession key={selected+':'+chosen.manifest.commitment} {...props} deployment={chosen} onSwitchBlocked={setSwitchBlocked}/>
      :<section className="neurai-card" role="status"><h2 className="text-xl font-bold">{selected} TEST pool unavailable</h2>
        <p>{selected==='C6'?C6_XNA_UNAVAILABLE_REASON:selected==='C5'?C5_UNAVAILABLE_REASON:'No C4 deployment is configured for this test.'}</p></section>}
  </div>;
}
function PrivacyPoolSession({wallet,mnemonic='',passphrase='',deployment,onSwitchBlocked}:{wallet?:Wallet;mnemonic?:string;passphrase?:string;deployment?:PrivacyPoolDeployment;onSwitchBlocked?:(blocked:boolean)=>void}={}) {
  const manifest=deployment?.manifest??C4_TESTNET_DEPLOYMENT.manifest;
  const explorer=deployment?.explorerBaseUrl===null?null:(deployment?.explorerBaseUrl??EXPLORER);

  const [bench,setBench]=React.useState(false),[busy,setBusy]=React.useState(false),[phase,setPhase]=React.useState('Ready');
  const [elapsed,setElapsed]=React.useState(0),[error,setError]=React.useState(''),[lines,setLines]=React.useState<string[]>(['Privacy pool ready.']);
  const [password,setPassword]=React.useState(''),[backup,setBackup]=React.useState<any>(null),[recipient,setRecipient]=React.useState<any>(null),[backupSaved,setBackupSaved]=React.useState(false);
  const [scan,setScan]=React.useState<Scan|null>(null),[action,setAction]=React.useState<'deposit'|'transfer'|'withdraw'>('deposit');
  const [amount,setAmount]=React.useState('10'),[destination,setDestination]=React.useState(''),[note,setNote]=React.useState('');
  const [batch,setBatch]=React.useState([{recipient:'',amount:'10'}]);
  const [fee,setFee]=React.useState('0.1'),[preview,setPreview]=React.useState<Preview|null>(null),[published,setPublished]=React.useState('');
  const [uncertain,setUncertain]=React.useState(false);
  // Confirmed wallet coins, cached so the step state can be recomputed as the
  // amount is typed. The real operation still reads them fresh from the node.
  const [coinData,setCoinData]=React.useState<{confirmed:Coin[];values:string[]}|null>(null);
  const [coinsBusy,setCoinsBusy]=React.useState(false),[coinsError,setCoinsError]=React.useState('');
  // The deposit coin that was published and is not confirmed yet. Without it
  // step A reads as untouched the moment its transaction is sent, which invites
  // preparing a second coin while the first is still in the mempool.
  const [sentCoin,setSentCoin]=React.useState<{txid:string;amountAtomic:string}|null>(null);
  // A published pool transaction that has not confirmed. Its bytes are kept so
  // the status can still be read if the node loses sight of it.
  const [poolTx,setPoolTx]=React.useState<{txid:string;raw:string;points:{txid:string;vout:number}[]}|null>(null);
  React.useEffect(()=>{onSwitchBlocked?.(busy||uncertain||!!preview||!!poolTx||!!sentCoin);},
    [busy,uncertain,preview,poolTx,sentCoin,onSwitchBlocked]);
  const [addresses,setAddresses]=React.useState<AddressInfo|null>(null),[zkPassphrase,setZkPassphrase]=React.useState(''),[account,setAccount]=React.useState('0'),[gapText,setGapText]=React.useState('20');
  const rotation=React.useRef<{gap:number;issued:number}|null>(null);
  // Latest receiving data, readable from async code without waiting for a render.
  const receiving=React.useRef<AddressInfo|null>(null);
  const updateAddresses=(info:AddressInfo|null)=>{receiving.current=info;setAddresses(info);};
  const clientRef=React.useRef<PoolWorkerClient|null>(null),busyRef=React.useRef(false),command=React.useRef(''),start=React.useRef(0),owned=React.useRef<Coin[]>([]);
  const coinEpoch=React.useRef(0);
  const mounted=React.useRef(true),epoch=React.useRef(0);
  const network=wallet?.network??'',testnet=isTestnetChain(network),supported=!!poolWalletNetwork(network);
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
  React.useEffect(()=>{lock();setPublished('');setUncertain(false);},[wallet,wallet?.network,deployment,mnemonic,passphrase]);
  const checkInputs=(points:Preview['points'])=>recheckInputs(rpc,manifest,points);
  async function reviewPrepared(result:PreparedPoolTransaction) {
    const current=epoch.current;
    try {
      setPhase('Signing funding inputs locally');await checkInputs(result.inputPoints);
      const keys:Record<string,any>={};for(const c of owned.current){const key=wallet!.getPrivateKeyByAddress(c.address);if(!key)throw new Error('Funding key is unavailable');keys[c.address]=key;}
      const raw=signPoolTransaction(wallet!.network,result.raw,owned.current as any,keys);
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
    const c:PoolWorkerClient=new PoolWorkerClient({worker:(deployment?.createWorker??createPoolWorker)(),rpc,
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
    |{type:'derive';family:'legacy'|'ecdsa'|'pq';mnemonic:string;passphrase:string;zkPassphrase:string;account:number}
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
  const rotationKey=(info:AddressInfo)=>rotationStorageKey({network,walletId:wallet?.getAddresses?.()?.[0]??'',derivation:info.derivation!,family:info.family!,storageId:info.storageId!,account:info.account!});
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
    const family=wallet&&poolWalletNetwork(wallet.network)?.family;
    if(!family){setError('Select a supported Legacy, ECDSA or PQ wallet.');return;}
    setBackupSaved(false);void request({type:'derive',family,mnemonic,passphrase,zkPassphrase,account:n});
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
  /**
   * The identity picks `max(maxUsed + 1, issued)` as its current address, so
   * lowering `issued` walks back over addresses nobody has paid yet and stops
   * on its own at the last used one.
   */
  function previousAddress() {
    if(addresses?.kind!=='derived')return;
    if(addresses.current.index<=(addresses.maxUsed??-1)+1)return;
    void request({type:'scan',gap:addresses.gap??20,issued:Math.max(0,(addresses.issued??addresses.current.index)-1)});
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
  /**
   * Read the wallet's coins so the panel can say which steps are still open.
   * It runs beside the main operation rather than through `begin`: it must not
   * claim the operation slot, and failing to read them is not a failed deposit.
   */
  async function refreshCoins() {
    if(!wallet||!supported||!testnet)return;
    const current=++coinEpoch.current;setCoinsBusy(true);setCoinsError('');
    try {
      const utxos=await wallet.getUTXOs() as any[];
      const confirmed=await confirmedPoolCoins(rpc,utxos as any,{baseCurrency:wallet.baseCurrency}) as Coin[];
      if(current!==coinEpoch.current||!mounted.current)return;
      // Every own coin, confirmed or not: an exact one still in the mempool is
      // a prepared step, not a missing one, and the two read very differently.
      setCoinData({confirmed,values:utxos.filter(u=>u.assetName===wallet.baseCurrency).map(u=>String(u.satoshis))});
    }catch(e){
      if(current!==coinEpoch.current||!mounted.current)return;
      setCoinData(null);setCoinsError(e instanceof Error?e.message:String(e));
    }finally{if(current===coinEpoch.current&&mounted.current)setCoinsBusy(false);}
  }
  async function prepare() {
    if(busyRef.current)return;
    const current=epoch.current;
    let c:PoolWorkerClient|undefined;
    try {
      begin('Checking wallet funding');setPreview(null);await chainCheck();
      if(!supported||!backupSaved)throw new Error('Use a supported testnet wallet and save the encrypted privacy JSON first');
      const feeAtomic=parseXna(fee).toString();
      const recipients=action==='transfer'?batch.map(row=>({recipient:row.recipient,amountAtomic:parseXna(row.amount).toString()})):undefined;
      const amountAtomic=action==='withdraw'?'0':recipients?recipients.reduce((n,row)=>n+BigInt(row.amountAtomic),0n).toString():parseXna(amount).toString();
      const {funding,sponsor}=selectPoolCoins(await coins(),{action,amountAtomic,feeAtomic}) as {funding?:Coin;sponsor:Coin};
      const payout=action==='withdraw'?await withdrawalScript(rpc,destination):undefined;
      if(current!==epoch.current||!mounted.current)return;
      owned.current=[...(funding?[funding]:[]),sponsor];command.current='prepare';c=client();
      const result=await c.prepare({action,amountAtomic,feeAtomic,funding,sponsor,payout,note,recipients});
      if(current!==epoch.current||!mounted.current)return;
      await reviewPrepared(result);
    }catch(e){if(c)workerFailed(c,e,current);else fail(e);}
  }
  async function prepareFunding() {
    if(busyRef.current)return;
    const current=epoch.current;
    try {
      command.current='funding';begin('Preparing an exact deposit coin');setPreview(null);await chainCheck();
      const value=formatXna(parseXna(amount));
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
      setUncertain(false);setPreview(null);
      if(p.funding){try{setSentCoin({txid,amountAtomic:parseXna(p.amount).toString()});}catch{setSentCoin(null);}}
      else setPoolTx({txid,raw:p.raw,points:p.points});
      setPhase('Published · waiting for confirmation');append('[TX] '+txid);end();
    }catch(e){fail(e);}
  }
  /**
   * A confirmed pool transaction is the end of the operation: the notes it
   * created are only readable now, and the coins it spent are only gone now.
   */
  function poolTxConfirmed() {
    setPoolTx(null);append('[OK] Pool transaction confirmed. Reading the new notes.');
    void refreshCoins();void request({type:'scan'});
  }
  async function checkPublication() {
    if(!published||busyRef.current)return;
    try {
      command.current='check-publication';begin('Checking the submitted transaction');
      const status=await publicationStatus(rpc,manifest,{txid:published,raw:preview?.raw??poolTx?.raw,points:preview?.points??poolTx?.points});
      setUncertain(false);
      // The node never saw it, so nothing is pending: let the panel be used again.
      if(status==='retryable'){setPoolTx(null);setPhase('Node has not seen it · the same transaction can be retried');end();return;}
      setPreview(null);setPhase(status==='confirmed'?'Transaction confirmed':'Transaction is in the mempool');end();
      if(status==='confirmed')poolTxConfirmed();
    }catch(e){fail(e);}
  }
  // Read the coins once the pool can be used, and again after each publication.
  React.useEffect(()=>{if(recipient&&supported&&testnet)void refreshCoins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[recipient,supported,testnet,published]);

  const selected=scan?.notes.find(n=>n.cm===note);
  const canOperate=testnet&&supported&&!!recipient&&backupSaved&&!busy&&!uncertain&&!poolTx;
  // The first missing condition, shown instead of silently disabled controls.
  const requirement=!testnet?'':!supported?'Open a Testnet Legacy, PQ or ECDSA wallet.'
    :!recipient?'Open your private wallet in step 1 before depositing. Your normal wallet balance is separate from the private balance.':!backupSaved?'Save your encrypted backup in step 1 before using the pool.'
    :uncertain?'Check the pending publication below before starting another operation.'
    :poolTx?'Your pool transaction is waiting for a confirmation. The notes refresh on their own when it lands.'
    :action!=='deposit'&&scan&&scan.notes.length===0?'You have no spendable private notes yet. Make a deposit first.':'';
  const locked=!canOperate||!!preview;

  const box='rounded-xl border border-base-300 bg-base-100 p-4 min-w-0';
  const notice='rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-base-content m-0';

  /**
   * Which step the coins allow next. `selectPoolCoins` is pure, so the answer
   * follows the amount as it is typed without another round trip to the node.
   */
  const funding=React.useMemo(():{state:'unknown'|'ready'|'pending'|'blocked';message:string;exact:boolean}=>{
    if(!coinData)return {state:'unknown',message:coinsError,exact:false};
    // The deposit coin and the fee coin are separate requirements, and only the
    // first is what the prepare step produces: they are reported apart so a
    // missing fee coin never reads as a deposit coin that has not confirmed.
    let exact=action!=='deposit';
    try {
      const amountAtomic=action==='withdraw'?'0':action==='transfer'
        ?batch.reduce((n,row)=>n+parseXna(row.amount),0n).toString()
        :parseXna(amount).toString();
      if(action==='deposit')exact=coinData.confirmed.some(c=>String(c.valueSats)===amountAtomic);
      selectPoolCoins(coinData.confirmed,{action,amountAtomic,feeAtomic:parseXna(fee).toString()});
      return {state:'ready',message:'',exact};
    }catch(e){
      const message=e instanceof Error?e.message:String(e);
      if(action==='deposit'&&!exact){
        // Tell "not prepared yet" apart from "prepared, still unconfirmed":
        // the first needs a button press, the second only needs a block.
        try {
          if(coinData.values.includes(parseXna(amount).toString()))
            return {state:'pending',message:'The exact deposit coin is not confirmed yet. It can be used after one confirmation.',exact};
        }catch{/* an unparseable amount is reported by the message below */}
      }
      return {state:'blocked',message,exact};
    }
  },[coinData,coinsError,action,amount,fee,batch]);

  const coinsChecking=coinsBusy&&!coinData;
  // An unreadable coin list must not lock the panel: let the operation run and
  // surface the node's own refusal instead of a step that can never clear.
  const fundingBlocks=coinsChecking||funding.state==='pending'||funding.state==='blocked';
  // Step A is done once its coin is confirmed, even if the fee coin is missing.
  const coinReady=funding.exact;
  // Published but not confirmed. A coin sent for another amount is not this
  // step's coin, so changing the amount drops back to "nothing prepared".
  const sentForThisAmount=!!sentCoin&&(()=>{try{return sentCoin.amountAtomic===parseXna(amount).toString();}catch{return false;}})();
  const coinWaiting=action==='deposit'&&!coinReady&&(sentForThisAmount||funding.state==='pending');
  // Confirmation is the only thing left, and it arrives without the user doing
  // anything, so the step advances by itself instead of waiting for a press.
  // Asking after the transaction separates the three outcomes that matter: in
  // the mempool, confirmed, or never seen — the last one would otherwise leave
  // the step waiting for a coin that is never coming.
  React.useEffect(()=>{
    if(!coinWaiting||busy)return;
    const txid=sentCoin?.txid;
    const id=setInterval(()=>{
      if(busyRef.current)return;
      if(!txid){void refreshCoins();return;}
      void rpc('getrawtransaction',[txid,true])
        .then(tx=>{
          if(!mounted.current)return;
          if(tx&&tx.confirmations>0)void refreshCoins();
          else if(!tx)setSentCoin(null);
        })
        .catch(()=>{if(mounted.current)setSentCoin(null);});
    },20000);
    return()=>clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[coinWaiting,busy,sentCoin]);
  React.useEffect(()=>{if(coinReady)setSentCoin(null);},[coinReady]);

  // The same wait on the other side of the operation: confirmation is what
  // makes the new notes readable, and it needs no press to happen.
  React.useEffect(()=>{
    if(!poolTx||busy)return;
    const id=setInterval(()=>{
      if(busyRef.current)return;
      void publicationStatus(rpc,manifest,poolTx)
        .then(status=>{if(status==='confirmed'&&mounted.current)poolTxConfirmed();})
        // A background check that fails changes nothing: the next one retries,
        // and `Check transaction status` reports properly when asked.
        .catch(()=>undefined);
    },20000);
    return()=>clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[poolTx,busy]);

  const canBuild=!locked&&(action==='deposit'||!!note)&&!fundingBlocks;
  const fundingStatus=funding.state==='ready'&&!coinsChecking?null:
    <div className={`${notice} flex flex-wrap items-center justify-between gap-3`} role="status">
      <span className="min-w-0">{coinsChecking?'Checking the coins in your wallet…'
        :funding.state==='unknown'?`Could not read your wallet coins: ${funding.message||'unknown error'}`
        :coinWaiting?'The deposit coin is pending in the mempool. Step B opens once a block includes it; this is checked every few seconds.'
        :funding.message}</span>
      <button className="neurai-btn--secondary btn-sm" disabled={busy||coinsBusy} onClick={()=>void refreshCoins()}>
        {coinsBusy?'Checking…':'Check again'}</button>
    </div>;
  const derived=addresses?.kind==='derived';
  const canStepBack=derived&&addresses!.current.index>(addresses!.maxUsed??-1)+1;
  const tone:StatusTone=error?'error':elapsed>0?'done':'idle';
  const cancel=busy&&command.current==='prepare'&&phase!=='Publishing to testnet'?()=>{lock();append('[STOP] Worker terminated; reload your privacy JSON to continue.');}:undefined;
  const feeField=<div><label htmlFor="privacy-fee" className="neurai-label">Public network fee (XNA)</label>
    <input id="privacy-fee" className="neurai-input" inputMode="decimal" value={fee} onChange={e=>setFee(e.target.value)} disabled={locked}/></div>;
  const noteField=<div><label htmlFor="privacy-note" className="neurai-label">Note to spend</label>
    <select id="privacy-note" className="neurai-select" value={note} onChange={e=>setNote(e.target.value)} disabled={locked}>
      <option value="">{scan?'Select a note':'Refresh notes in step 1 first'}</option>
      {scan?.notes.map(n=><option value={n.cm} key={n.cm}>{formatXna(n.amountAtomic)} XNA · {n.cm.slice(0,12)}…</option>)}
    </select></div>;
  const reviewCard=preview?<section className={`${box} neurai-stack gap-2 border-primary`} aria-labelledby="privacy-review-title">
    <h3 id="privacy-review-title" className="neurai-card__title">Review and publish</h3>
    <p className="m-0">{preview.form} · <strong>{preview.amount} XNA</strong> · network fee <strong>{preview.fee} XNA</strong></p>
    <p className="m-0 text-sm text-base-content/70">The node accepted the prepared transaction. It has not been broadcast.</p>
    <code className="block font-mono text-xs break-all text-base-content/70">{preview.txid}</code>
    <div className="flex flex-wrap gap-2"><button className="neurai-btn--primary" disabled={busy||uncertain} onClick={()=>void publish()}>Publish TEST transaction</button><button className="neurai-btn--secondary" disabled={busy||uncertain} onClick={()=>setPreview(null)}>Discard</button></div>
  </section>:null;
  const buildButton=<button className="neurai-btn--primary" disabled={!canBuild} onClick={()=>void prepare()}>Build and verify proof</button>;
  // Why the only button on screen cannot be pressed, rather than a dead control.
  const buildHint=action!=='deposit'&&!note&&scan&&scan.notes.length>0
    ?'Select the note to spend above.':'Nothing is published until you review it.';
  return <section className="privacy-pool neurai-stack min-w-0" aria-label="Privacy Pool">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-bold m-0">Privacy Pool</h2>
        <p className="neurai-hint mt-1 mb-0">Deposit XNA, assign private notes and withdraw them to a wallet. Proofs are built on this device.</p>
      </div>
      <button className="neurai-btn--secondary" disabled={busy} onClick={()=>setBench(x=>!x)} aria-expanded={bench}>{bench?'Back to pool':'Open benchmark'}</button>
    </div>
    {bench?<PrivacyBenchmark/>:<>
      <p className={notice}>{manifest.schema==='neurai-c5-xna-test-v1'?'C5':'C4'} TEST keys · XNA only · Legacy, PQ and ECDSA funding and withdrawal addresses. This pool does not accept valuable funds.</p>
      {!testnet&&<p role="alert" className="text-sm text-error m-0">Switch to a testnet wallet to use the pool.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <section className="neurai-card neurai-stack min-w-0" aria-labelledby="privacy-wallet-title">
          <div className="flex items-start justify-between gap-3">
            <div><p className="neurai-eyebrow mb-1">Step 1</p><h3 id="privacy-wallet-title" className="neurai-card__title">Private wallet</h3></div>
            {recipient&&<button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={lock}>Lock</button>}
          </div>
          {!recipient?<>
            <p className="text-sm text-base-content/70 m-0">Open the private wallet for your selected Legacy, ECDSA or PQ family. The same words, passphrases, family, account and pool recover the same keys. Keep a record of the pools and accounts you use.</p>
            {!mnemonic&&<p className={notice}>This wallet was opened without its words. Use an encrypted backup file below.</p>}
            <div><label htmlFor="privacy-zk-passphrase" className="neurai-label">ZK passphrase <span className="font-normal opacity-60">(optional)</span></label>
              <input id="privacy-zk-passphrase" className="neurai-input" type="password" aria-label="ZK passphrase" autoComplete="off" value={zkPassphrase} onChange={e=>setZkPassphrase(e.target.value)} disabled={busy||!mnemonic}/>
              <p className="neurai-hint mb-0">It has no checksum: a typo opens a different, empty private wallet. Spaces count.</p></div>
            <div><label htmlFor="privacy-account" className="neurai-label">Account</label>
              <input id="privacy-account" className="neurai-input" inputMode="numeric" aria-label="Account" value={account} onChange={e=>setAccount(e.target.value.trim())} disabled={busy||!mnemonic}/></div>
            <button className="neurai-btn--primary self-start" disabled={!testnet||busy||!mnemonic} onClick={openFromWords}>Open private wallet</button>
            <details className={box}><summary className="cursor-pointer text-sm font-semibold">Use an encrypted backup file instead</summary>
              <div className="neurai-stack gap-3 mt-3">
                <div><label htmlFor="privacy-backup-password" className="neurai-label">Backup password</label>
                  <input id="privacy-backup-password" className="neurai-input" type="password" aria-label="Backup password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/>
                  <p className="neurai-hint mb-0">New backup: at least 12 characters. Existing backup: type its password, then choose the file.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button className="neurai-btn--secondary" disabled={!testnet||busy||password.length<12} onClick={()=>{setBackupSaved(false);void request({type:'create',password});}}>Create privacy wallet</button>
                  <label className={`neurai-btn--secondary ${busy||!testnet||password.length<1?'btn-disabled':''}`}>Load privacy JSON<input type="file" accept=".json" hidden disabled={busy||!testnet||password.length<1} onChange={e=>void restore(e.target.files?.[0])}/></label>
                </div>
              </div>
            </details>
          </>:<>
            <div className={box}>
              <p className="neurai-eyebrow mb-1">Confirmed private balance</p>
              <p className="m-0 text-3xl font-semibold tabular-nums break-all">{scan?formatXna(scan.balanceAtomic):'—'} <span className="text-base font-normal text-base-content/70">XNA</span></p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-base-content/70">{scan?`${scan.notes.length} spendable notes · checked through block ${scan.height}`:'Notes not loaded yet'}</span>
                <button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={()=>void request({type:'scan'})}>Refresh notes</button>
              </div>
              {/* The reserve output holds every note's XNA, so it is public and the same for every wallet. */}
              <p className="m-0 mt-3 pt-3 border-t border-base-300 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                <span className="text-base-content/70">Total in the pool, all wallets</span>
                <strong className="tabular-nums break-all">{scan?formatXna(scan.reserveAtomic):'—'} XNA</strong>
              </p>
            </div>
            <div className={`${box} neurai-stack gap-2`}>
              <p className="neurai-eyebrow mb-0">Receive privately</p>
              <p className="m-0 text-sm text-base-content/70">{derived?'Share this address. After it receives a note a new one appears; earlier addresses keep working.':'Share this address. A backup file has a single address; open from the wallet words to get a new one after each payment.'}</p>
              {addresses&&<><code className="block rounded-lg border-2 border-primary/35 bg-base-200 px-3 py-3 font-mono text-sm leading-relaxed break-all select-all" aria-label="Receiving address">{addresses.current.address}</code>
                {derived&&<p className="neurai-hint m-0">Address #{addresses.current.index} · account {addresses.account}</p>}</>}
              <div className="flex flex-wrap gap-2">
                {addresses&&<button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={()=>void copyText(addresses.current.address,'Receiving address')}>Copy address</button>}
                {derived&&<>
                  {/* Rotation only ever moved forward, so a mistaken press could
                      not be taken back. The identity clamps the index at the
                      last used address, so stepping back never reuses one. */}
                  <button className="neurai-btn--secondary btn-sm" disabled={busy||!canStepBack} onClick={previousAddress}
                    title={canStepBack?'Go back to the previous unused address':'The address before this one has already received a note'}>← Previous</button>
                  <button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={newAddress}>New address →</button>
                </>}
                <button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={()=>saveJson('neurai-privacy-recipient.json',recipient)}>Save receiving descriptor</button>
              </div>
              {derived&&addresses!.used.length>0&&<details><summary className="cursor-pointer text-sm font-semibold">Used addresses ({addresses!.used.length})</summary>
                <ul className="list-none m-0 mt-2 p-0 flex flex-col">{addresses!.used.map(u=><li key={u.index} className="flex items-center gap-3 py-2 border-b border-base-300 last:border-b-0 text-sm">
                  <span className="text-base-content/70">#{u.index}</span><code className="font-mono text-xs min-w-0 flex-1 truncate">{u.address.slice(0,18)}…{u.address.slice(-8)}</code><strong className="tabular-nums">{formatXna(u.receivedAtomic)} XNA</strong></li>)}</ul></details>}
              <details><summary className="cursor-pointer text-sm font-semibold">Show descriptor JSON</summary>
                <textarea className="neurai-textarea font-mono text-xs mt-2 min-h-28" readOnly value={JSON.stringify(recipient,null,2)} aria-label="Receiving descriptor"/></details>
            </div>
            {derived?<div className={`${box} neurai-stack gap-2`}>
              <p className="m-0 font-semibold text-success">✓ Recovered from the wallet words</p>
              <p className="m-0 text-sm text-base-content/70">NeuraiZK/v2 · {addresses!.family} · account {addresses!.account} · check <code className="font-mono">{addresses!.fingerprint}</code>. Opening it again with the same ZK passphrase must show the same check.</p>
              <details><summary className="cursor-pointer text-sm font-semibold">Recovery settings</summary>
                <div className="neurai-stack gap-2 mt-3">
                  <div><label htmlFor="privacy-gap" className="neurai-label">Gap limit (1–{MAX_GAP})</label>
                    <input id="privacy-gap" className="neurai-input" inputMode="numeric" aria-label="Recovery gap limit" value={gapText} onChange={e=>setGapText(e.target.value.trim())} disabled={busy}/>
                    <p className="neurai-hint mb-0">Recovery stops after this many unused addresses in a row. Larger values take longer.</p></div>
                  <button className="neurai-btn--secondary btn-sm self-start" disabled={busy} onClick={applyGap}>Apply and refresh</button>
                </div>
              </details>
            </div>:<div className={`${box} neurai-stack gap-2`}>
              <p className={`m-0 font-semibold ${backupSaved?'text-success':'text-warning'}`}>{backupSaved?'✓ Encrypted backup saved':'Encrypted backup'}</p>
              <p className="m-0 text-sm text-base-content/70">{backupSaved?'Keep the file and its password. They are the only way to recover these notes.':'Save it before using the pool. Without it these notes cannot be recovered.'}</p>
              <button className={`${backupSaved?'neurai-btn--secondary':'neurai-btn--primary'} btn-sm self-start`} disabled={busy} onClick={()=>{saveJson('neurai-privacy-test-backup.json',backup);setBackupSaved(true);}}>Save encrypted JSON</button>
            </div>}
          </>}
        </section>
        <section className="neurai-card neurai-stack min-w-0" aria-labelledby="privacy-use-title">
          <div><p className="neurai-eyebrow mb-1">Step 2</p><h3 id="privacy-use-title" className="neurai-card__title">Use the pool</h3></div>
          <div role="tablist" aria-label="Pool operation" className="join w-full">{(['deposit','transfer','withdraw'] as const).map(a=>
            <button key={a} type="button" role="tab" aria-selected={action===a} disabled={busy||!!preview} onClick={()=>setAction(a)}
              className={`btn join-item flex-1 ${action===a?'btn-primary':'btn-ghost border border-base-300'}`}>{a==='transfer'?'Assign':a[0].toUpperCase()+a.slice(1)}</button>)}</div>
          <p className="text-sm text-base-content/70 m-0">{action==='deposit'?'Move XNA from this wallet into a new private note.':action==='transfer'?'Give part or all of one of your notes to another private wallet. Any remainder comes back to you as a new note.':`Turn one whole note back into XNA at a Legacy, PQ or ECDSA testnet address.`}</p>
          {requirement&&<p className={notice}>{requirement}</p>}
          {action==='deposit'&&<>
            <div><label htmlFor="privacy-amount" className="neurai-label">Deposit amount (XNA)</label>
              <input id="privacy-amount" className="neurai-input" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={locked}/></div>
            {feeField}
            <p className="text-sm text-base-content/70 m-0">A deposit is published twice: first the coin, then the note. The pool spends a coin worth exactly the deposit, so one has to be made before the proof can be built.</p>
            <ol className="list-none m-0 p-0 flex flex-col gap-3">
              {([['A','Prepare an exact coin',coinWaiting?'Pending in the mempool. It becomes usable once a block includes it.':'Sends the deposit amount to your own address. Publish it and wait for one confirmation.',coinReady,coinWaiting,
                // Shut while its transaction is pending: preparing a second coin
                // then would spend the change of the first one, or nothing.
                <button key="fund" className={coinReady||coinWaiting?'neurai-btn--secondary':'neurai-btn--primary'} disabled={locked||coinWaiting} onClick={()=>void prepareFunding()}>
                  {coinReady?'Prepare another':'Prepare deposit coin'}</button>],
                ['B','Create the private note',poolTx?'Waiting for a confirmation. The notes refresh on their own once the block lands.':'Builds and verifies the proof on this device. Nothing is published until you review it.',false,!!poolTx,buildButton]] as const)
                .map(([mark,title,text,done,waiting,control])=><React.Fragment key={mark}>
                <li className={`${box} grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 ${done?'border-success/50':waiting?'border-warning/50':''}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done?'bg-success/15 text-success':waiting?'bg-warning/20 text-warning':'bg-primary/15 text-primary'}`} aria-hidden="true">{done?'\u2713':mark}</span>
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold">{title}{done&&<span className="ml-2 font-normal text-success">done</span>}</p>
                    <p className={`m-0 mt-1 text-xs leading-snug ${waiting?'font-medium text-warning':'text-base-content/70'}`}>{text}</p></div>
                  <div className="col-span-2 sm:col-span-1 justify-self-start sm:justify-self-end">{control}</div>
                </li>
                {preview&&preview.funding===(mark==='A')&&<li>{reviewCard}</li>}
              </React.Fragment>)}
            </ol>
            {fundingStatus}
          </>}
          {action==='transfer'&&<>
            {noteField}
            <div className="neurai-stack">
              <p className="neurai-hint m-0">Up to four private notes per transfer, including your change. Use private receiving addresses or descriptors.</p>
              {batch.map((row,i)=><div key={i} className="rounded-xl border border-base-300 p-3 neurai-stack">
                <label htmlFor={`privacy-batch-recipient-${i}`} className="neurai-label">Recipient {i+1}</label>
                <textarea id={`privacy-batch-recipient-${i}`} className="neurai-textarea font-mono text-xs" value={row.recipient} disabled={locked}
                  placeholder="tnzk1… or receiving descriptor" onChange={e=>setBatch(rows=>rows.map((x,j)=>i===j?{...x,recipient:e.target.value}:x))}/>
                <label htmlFor={`privacy-batch-amount-${i}`} className="neurai-label">Amount {i+1} (XNA)</label>
                <input id={`privacy-batch-amount-${i}`} className="neurai-input" inputMode="decimal" value={row.amount} disabled={locked}
                  onChange={e=>setBatch(rows=>rows.map((x,j)=>i===j?{...x,amount:e.target.value}:x))}/>
                {batch.length>1&&<button className="neurai-btn--secondary btn-sm" disabled={locked} onClick={()=>setBatch(rows=>rows.filter((_,j)=>j!==i))}>Remove recipient {i+1}</button>}
              </div>)}
              <button className="neurai-btn--secondary btn-sm" disabled={locked||batch.length>=4} onClick={()=>setBatch(rows=>[...rows,{recipient:'',amount:''}])}>Add recipient</button>
            </div>
            {feeField}
            {fundingStatus}
            <div className="flex flex-wrap items-center gap-3">{buildButton}<span className="neurai-hint m-0">{buildHint}</span></div>
            {reviewCard}
          </>}
          {action==='withdraw'&&<>
            {noteField}
            <p className="text-sm text-base-content/70 m-0">This withdrawal spends the whole selected note: <strong className="text-base-content">{selected?formatXna(selected.amountAtomic):'—'} XNA</strong>. To withdraw less, first assign part of it to your own address.</p>
            <div><label htmlFor="privacy-destination" className="neurai-label">Legacy, PQ or ECDSA withdrawal address</label>
              <input id="privacy-destination" className="neurai-input" value={destination} onChange={e=>setDestination(e.target.value)} disabled={locked}/></div>
            {feeField}
            {fundingStatus}
            <div className="flex flex-wrap items-center gap-3">{buildButton}<span className="neurai-hint m-0">{buildHint}</span></div>
            {reviewCard}
          </>}
        </section>
      </div>
      {error&&<p className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error m-0" role="alert">{error}</p>}
      {published&&<section className="neurai-card neurai-stack min-w-0" aria-label="Published transaction">
        <p className="m-0">{uncertain?'Publication result is uncertain. Check this transaction before building another one.'
          :poolTx?'Transaction sent. The notes refresh on their own once it confirms.':'Transaction sent. Refresh notes after it confirms.'}</p>
        <div className="flex flex-wrap gap-2">{explorer?<a className="neurai-btn--secondary btn-sm" href={explorer+published} target="_blank" rel="noreferrer">View {published.slice(0,16)}… in the explorer</a>:<code className="break-all">{published}</code>}<button className="neurai-btn--secondary btn-sm" disabled={busy} onClick={()=>void checkPublication()}>Check transaction status</button></div>
      </section>}
      <OperationTimer busy={busy} phase={phase} elapsed={elapsed} tone={tone} onCancel={cancel}/>
      <details className="neurai-card min-w-0"><summary className="neurai-card__title cursor-pointer">Confirmed pool activity</summary>
        <div className="neurai-stack gap-2 mt-4 text-sm">
          <p className="m-0">Pool instance: <code className="font-mono">{manifest.identity}</code></p>
          <p className="m-0 font-mono text-xs break-all text-base-content/70">{manifest.address??manifest.commitment}</p>
          {scan?.transitions.length?<ul className="list-none m-0 p-0 flex flex-col">{scan.transitions.slice(-12).reverse().map(t=><li key={t.txid} className="flex flex-wrap items-center gap-2 py-2 border-b border-base-300 last:border-b-0">
            <strong>{t.form}</strong><span className="text-base-content/70">block {t.height}</span>{explorer?<a className="link link-primary font-mono text-xs" href={explorer+t.txid} target="_blank" rel="noreferrer">{t.txid.slice(0,20)}…</a>:<code className="text-xs">{t.txid.slice(0,20)}…</code>}</li>)}</ul>
            :<p className="neurai-hint m-0">Refresh notes to list the latest pool operations.</p>}
        </div>
      </details>
      <details className="neurai-card min-w-0"><summary className="neurai-card__title cursor-pointer">Operation log</summary>
        <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-base-300 bg-base-100 p-3 font-mono text-xs leading-relaxed" role="log" aria-label="Pool operation log">
          {lines.map((line,i)=><div className="whitespace-pre-wrap break-words" key={i}>{line}</div>)}</div>
      </details>
    </>}
  </section>;
}

/**
 * Keeps the pool mounted while other wallet sections are open, like HomePanel and
 * SendPanel, so an unlocked identity, its notes and a running step survive
 * navigation. Keyed by wallet so another wallet never inherits this identity.
 */
/** Testing currently focuses on C6 with XNA, so the wallet offers no other pool. */
const WALLET_POOL_VERSIONS:readonly PoolVersion[]=['C6'];
export function PrivacyPanel({active,wallet,mnemonic,passphrase}:{active:boolean;wallet:Wallet;mnemonic?:string;passphrase?:string}) {
  const walletKey=`${wallet.network}:${wallet.getAddresses()[0]}`;
  return <div hidden={!active}><PrivacyPool key={walletKey} wallet={wallet} mnemonic={mnemonic} passphrase={passphrase} versions={WALLET_POOL_VERSIONS} c6Assets={false}/></div>;
}
