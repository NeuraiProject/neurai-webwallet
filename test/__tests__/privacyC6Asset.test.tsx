/** @jest-environment jsdom */
import {TextEncoder,TextDecoder} from 'node:util';
Object.assign(globalThis,{TextEncoder,TextDecoder});
import React,{act} from 'react';import {createRoot,Root} from 'react-dom/client';
import {C6AssetPrivacyPool} from '../../src/privacy-pool/C6AssetPrivacyPool';
import {c6AssetTransferScript} from '@neuraiproject/neurai-privacy/client';
const mock={derive:jest.fn(),openJournal:jest.fn(),scan:jest.fn(),prepare:jest.fn(),rebuild:jest.fn(),recordSigned:jest.fn(),backup:jest.fn(),terminate:jest.fn(),newAddress:jest.fn()};
let mockPrepare:()=>Promise<any>,mockLastRuntime:any;
jest.mock('@neuraiproject/neurai-privacy/client',()=>{const actual=jest.requireActual('@neuraiproject/neurai-privacy/client');return {...actual,C6WorkerClient:jest.fn(()=>mock),IndexedDbSponsorStore:jest.fn(()=>({close:jest.fn()})),confirmedPoolCoins:jest.fn(async()=>[{txid:'bb'.repeat(32),vout:0,address:'own',scriptHex:'5320'+'33'.repeat(32),valueSats:'100000000'}])};});
jest.mock('../../src/privacy-pool/C6PrivacyPool',()=>({C6PrivacyPool:({runtime}:any)=>{mockLastRuntime=runtime;mockPrepare=runtime.prepare;return <p>Durable sponsor controls</p>;}}));
jest.mock('../../src/privacy-pool/walletNetwork',()=>({poolWalletNetwork:()=>({family:'ecdsa'}),signPoolInputs:jest.fn(()=> 'LOCAL_ALL_FUNDING')}));
const hex=(b:Uint8Array)=>Buffer.from(b).toString('hex'),script=hex(c6AssetTransferScript(new Uint8Array([83,32,...Array(32).fill(51)]),'ASSET_TEST',1000000000n));
const runtime:any={config:{network:'testnet',expectedCommitment:'22'.repeat(32),deployment:{kind:'asset',genesis:'11'.repeat(32)},manifest:{profile:'C6-ORDINARY-ASSET-TEST-J2-v1',asset:'ASSET_TEST',units:2,unit:'1000000',private_fee:0,sponsor_index:2,sponsor_fees:['10000000']}},createWorker:jest.fn(()=>({}))};
const wallet:any={network:'xna-ecdsa-test',baseCurrency:'XNA',getAddresses:()=>['own'],getUTXOs:jest.fn(async()=>[]),getAssetUTXOs:jest.fn(async()=>[{txid:'aa'.repeat(32),outputIndex:0,address:'own'}]),getPrivateKeyByAddress:jest.fn(async()=> 'PRIVATE TEST'),rpc:jest.fn(async()=>({value:0,confirmations:2,scriptPubKey:{hex:script,addresses:['own']}}))};
const state={scan:{result:{tip:{height:22485,hash:'11'.repeat(32)},balanceAtomic:'900000000',spendableAtomic:'900000000',notes:[{cm:'33'.repeat(32),amountAtomic:'900000000',spendable:true}]},addresses:{current:{address:'nzkAssetTEST'},used:[]}},journal:{operations:[]}};
function select(host:HTMLElement,label:string,value:string){if(label==='Asset operation'){(host.querySelector('[role=tab][data-action='+value+']') as HTMLButtonElement).click();return;}const e=host.querySelector('select[aria-label="'+label+'"]') as HTMLSelectElement;e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}
describe('C6 ordinary-asset interface',()=>{let host:HTMLDivElement,root:Root;
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();wallet.rpc.mockImplementation(async()=>({value:0,confirmations:2,scriptPubKey:{hex:script,addresses:['own']}}));mock.derive.mockResolvedValue({identity:{addresses:state.scan.addresses}});mock.openJournal.mockResolvedValue({});mock.scan.mockResolvedValue(state);mock.backup.mockResolvedValue({cipher:'ENCRYPTED'});mock.recordSigned.mockResolvedValue({});mock.prepare.mockResolvedValue({operationId:'op',transaction:{raw:'UNSIGNED',funding:{index:1,point:'aa'.repeat(32)+':0'},sponsor:{index:2,sighash:131}},sponsorNotes:[]});host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);URL.createObjectURL=jest.fn(()=> 'blob:test');URL.revokeObjectURL=jest.fn();jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});});
 afterEach(()=>{act(()=>root.unmount());host.remove();jest.restoreAllMocks();});
 async function open(){act(()=>root.render(<C6AssetPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private asset wallet').click();await new Promise(r=>setTimeout(r,0));});}
 it('shows disabled asset operations and explains the XNA sponsor before unlocking',()=>{
  act(()=>root.render(<C6AssetPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
  const cards=host.querySelectorAll('[aria-label="Available C6 operations"] button');expect(cards).toHaveLength(4);cards.forEach(b=>expect((b as HTMLButtonElement).disabled).toBe(true));
  expect(host.querySelector('[aria-label="Asset amount"]')!.matches(':disabled')).toBe(true);expect(host.querySelector('[aria-label="Asset sponsor coin"]')!.matches(':disabled')).toBe(true);
  expect(host.textContent).toContain('separate confirmed XNA sponsor');expect(host.textContent).not.toContain('Durable sponsor controls');expect(mock.derive).not.toHaveBeenCalled();
 });
 it('explains missing words and keeps both proving and sponsorship closed',()=>{
  act(()=>root.render(<C6AssetPrivacyPool wallet={wallet} runtime={runtime}/>));expect(host.querySelector('[role="alert"]')!.textContent).toContain('no recovery words');expect(button('Open private asset wallet').disabled).toBe(true);expect(mock.prepare).not.toHaveBeenCalled();
 });
 it('recovers separate balances without gating proving on a downloaded backup',async()=>{await open();expect(host.textContent).toContain('9 ASSET_TEST');expect(host.textContent).toContain('Checked through block 22,485');expect(mock.derive).toHaveBeenCalledWith(expect.objectContaining({family:'ecdsa'}));expect(host.textContent).toContain('Durable sponsor controls');await expect(mockPrepare()).rejects.toThrow(/Choose a confirmed XNA sponsor coin/);expect(URL.createObjectURL).not.toHaveBeenCalled();expect(mock.prepare).not.toHaveBeenCalled();});
 it('uses exact asset funding, zero private fee and ALL before sponsor authorization',async()=>{await open();act(()=>{select(host,'Asset funding coin','aa'.repeat(32)+':0');select(host,'Asset sponsor coin','bb'.repeat(32)+':0');});let authorization:any;await act(async()=>{authorization=await mockPrepare();});expect(mock.prepare).toHaveBeenCalledWith(expect.objectContaining({action:'deposit',fee:'0',amountAtomic:'1000000000',fundingValue:'1000000000',sponsorFee:'10000000'}));expect(mock.recordSigned).toHaveBeenCalledWith('op','LOCAL_ALL_FUNDING');expect(authorization.raw).toBe('LOCAL_ALL_FUNDING');expect(authorization.notes).toEqual([]);expect(authorization.budgetAtomic).toBe('20000000');});
 it('keeps sponsor runtime stable while selecting a different operation',async()=>{await open();const initial=mockLastRuntime;act(()=>select(host,'Asset operation','withdraw'));expect(mockLastRuntime).toBe(initial);expect(host.textContent).toContain('Legacy / PQ / ECDSA recipient');});
 it('locks and terminates the private worker on unmount',async()=>{await open();act(()=>root.unmount());expect(mock.terminate).toHaveBeenCalled();root=createRoot(host);});
 it('retains an open asset wallet after a failed initial scan',async()=>{
  mock.scan.mockRejectedValueOnce(Error('Asset RPC temporarily unavailable'));await open();expect(host.textContent).toContain('Asset RPC temporarily unavailable');expect(host.textContent).toContain('Save private asset backup');expect(mock.terminate).not.toHaveBeenCalled();
 });

 it('keeps automatic rescans paused after a scan error until manual retry',async()=>{
  jest.useFakeTimers();try{
   mock.scan.mockRejectedValueOnce(Error('Asset RPC timeout'));act(()=>root.render(<C6AssetPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
   await act(async()=>{button('Open private asset wallet').click();await Promise.resolve();});
   expect(host.textContent).toContain('Asset RPC timeout');expect(mock.scan).toHaveBeenCalledTimes(1);
   await act(async()=>jest.advanceTimersByTime(120000));expect(mock.scan).toHaveBeenCalledTimes(1);
   await act(async()=>{button('Scan now').click();await Promise.resolve();});expect(host.textContent).toContain('9 ASSET_TEST');
   await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(2);
  }finally{jest.useRealTimers();}
 });

 it('recovers read-only without history and never silently creates reservations',async()=>{
  mock.openJournal.mockRejectedValueOnce(Error('C6 private journal missing: restore the encrypted backup or explicitly create a new history'));await open();
  expect(host.textContent).toContain('Read-only recovery');expect(host.textContent).toContain('encrypted');
  expect(mock.scan).toHaveBeenCalledTimes(1);expect(mock.openJournal).toHaveBeenCalledTimes(1);expect(mock.openJournal).toHaveBeenCalledWith({create:false,backup:undefined});
  expect(button('Save private asset backup').disabled).toBe(true);expect(mock.prepare).not.toHaveBeenCalled();
 });

 it('refreshes confirmed asset notes silently and serializes sponsor preparation with the worker',async()=>{
  jest.useFakeTimers();try{
   let hash='11'.repeat(32);wallet.rpc.mockImplementation(async method=>method==='getbestblockhash'?hash:{value:0,confirmations:2,scriptPubKey:{hex:script,addresses:['own']}});
   act(()=>root.render(<C6AssetPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private asset wallet').click();await Promise.resolve();});
   act(()=>{select(host,'Asset funding coin','aa'.repeat(32)+':0');select(host,'Asset sponsor coin','bb'.repeat(32)+':0');});
   await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(1);
   let resolve!:(v:any)=>void;const job=new Promise(r=>{resolve=r;});mock.scan.mockImplementationOnce(()=>job);hash='22'.repeat(32);
   await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(2);expect(host.querySelector('[aria-label="Asset amount"]')!.matches(':disabled')).toBe(false);
   let authorization:Promise<any>;await act(async()=>{authorization=mockPrepare();await Promise.resolve();});expect(mock.prepare).not.toHaveBeenCalled();expect(host.textContent).toContain('Waiting for balance refresh');
   await act(async()=>{resolve({...state,scan:{...state.scan,result:{...state.scan.result,tip:{height:22486,hash},balanceAtomic:'1200000000'}}});await authorization;});
   expect(host.textContent).toContain('12 ASSET_TEST');expect(mock.prepare).toHaveBeenCalledTimes(1);expect(URL.createObjectURL).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
 });
});
