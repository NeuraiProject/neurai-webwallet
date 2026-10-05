/**
 * @jest-environment jsdom
 */

// Privacy Pool keeps its navigation entry while the local TEST benchmark is available.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/privacy-benchmark/workerFactory", () => ({ createPrivacyBenchmarkWorker: jest.fn(), createGroth16BenchmarkWorker: jest.fn() }));
jest.mock("@/privacy-pool/workerFactory", () => ({createPoolWorker:jest.fn()}));
// In-memory stand-in for the IndexedDB checkpoint store.
const mockCheckpoints=new Map<string,string>();
jest.mock("@/privacy-pool/scanCheckpointStore", () => ({scanCheckpointStore:()=>({
  get:async(key:string)=>mockCheckpoints.get(key),set:async(key:string,value:string)=>{mockCheckpoints.set(key,value);}})}));
jest.mock("@neuraiproject/neurai-sign-transaction",()=>({__esModule:true,default:{sign:jest.fn()}}));
jest.mock("@/privacy-pool/walletNetwork",()=>({...jest.requireActual("@/privacy-pool/walletNetwork"),signPoolTransaction:jest.fn(()=>'ff')}));

import { NavItem } from "@/NavItem";
import { PrivacyPool, OperationTimer, elapsedLabel } from "@/PrivacyPool";
import { Routes } from "@/Routes";

describe("Privacy Pool", () => {
  it("has a reachable navigation entry with the keyhole shield icon", () => {
    const html = renderToStaticMarkup(
      React.createElement(NavItem, {
        currentRoute: Routes.HOME,
        route: Routes.PRIVACY,
        setRoute: () => undefined,
        title: "Privacy Pool",
        variant: "full",
      }),
    );

    expect(html).toContain('href="#"');
    expect(html).toContain("Privacy Pool");
    expect(html).toContain('<circle cx="12" cy="10" r="2"></circle>');
  });

  it("opens on real pool actions and keeps benchmarks behind a button", () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyPool));

    expect(html).toContain("Privacy Pool");
    expect(html).toContain("C4 TEST keys");
    expect(html).toContain("Legacy, PQ and ECDSA");
    expect(html).not.toContain("privacy-instance");
    expect(html).toContain("Open benchmark");
    expect(html).not.toContain("Start local benchmark");
    expect(html).toContain("Deposit");expect(html).toContain("Assign");expect(html).toContain("Withdraw");
    expect(html).toContain("Create privacy wallet");expect(html).toContain("Load privacy JSON");
    expect(html).toContain("Switch to a testnet wallet");
    expect(html).toContain("Build and verify proof");
    expect(html).not.toContain("Publish TEST transaction");
  });
  it("shows elapsed time and a live phase without a fabricated percent",()=>{
    expect(elapsedLabel(128900)).toBe('02:08');
    const html=renderToStaticMarkup(<OperationTimer busy phase="Generating proof" elapsed={128900}/>);
    expect(html).toContain('role="status"');expect(html).toContain('02:08');
    expect(html).toContain('Generating proof');expect(html).not.toContain('aria-valuenow');
  });
});

import {act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {createPoolWorker} from '@/privacy-pool/workerFactory';
import {C4_TESTNET_DEPLOYMENT} from '@/privacy-pool/deployment';
const manifest=C4_TESTNET_DEPLOYMENT.manifest;

describe('Privacy Pool controls',()=>{
 let host:HTMLDivElement,root:Root;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;HTMLElement.prototype.scrollTo=jest.fn();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
 afterEach(()=>{act(()=>root.unmount());host.remove();jest.useRealTimers();jest.clearAllMocks();});
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(x=>x.textContent===text)!;
 it('opens and closes the benchmark without replacing the pool route',()=>{
  act(()=>root.render(<PrivacyPool/>));
  act(()=>button('Open benchmark').click());expect(host.textContent).toContain('Run C4 benchmark');
  act(()=>button('Back to pool').click());expect(host.textContent).toContain('Build and verify proof');
  expect(host.textContent).not.toContain('Run C4 benchmark');
 });
 it.each(['xna-test','xna-ecdsa-test','xna-pq-strict-test'])('uses only C4 for %s wallets',network=>{
  const wallet:any={network,rpc:jest.fn()};
  act(()=>root.render(<PrivacyPool wallet={wallet}/>));
  expect(host.querySelector('#privacy-instance')).toBeNull();
  expect(host.textContent).toContain('C4 TEST keys');
  expect(host.textContent).not.toContain('Open a Testnet Legacy, PQ or ECDSA wallet.');
  expect(wallet.rpc).not.toHaveBeenCalled();
 });
 it('offers all eight C4 benchmark forms',()=>{
  act(()=>root.render(<PrivacyPool/>));act(()=>button('Open benchmark').click());
  expect(Array.from(host.querySelectorAll('#privacy-bench-form option')).map(x=>x.textContent)).toEqual(['D0','D1','T1','T2','T3','T4','W_partial','W_full']);
 });
 it('does not start worker or RPC for a mainnet wallet',()=>{
  const wallet:any={network:'xna',rpc:jest.fn()};act(()=>root.render(<PrivacyPool wallet={wallet}/>));
  expect(button('Create privacy wallet').disabled).toBe(true);act(()=>button('Create privacy wallet').click());
  expect(wallet.rpc).not.toHaveBeenCalled();expect(createPoolWorker).not.toHaveBeenCalled();
 });
 it('keeps elapsed time advancing during work, reports errors and terminates on unmount',async()=>{
  jest.useFakeTimers();const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  const wallet:any={network:'xna-test',rpc:jest.fn().mockResolvedValue(manifest.genesis)};
  act(()=>root.render(<PrivacyPool wallet={wallet}/>));
  const input=host.querySelector('input[aria-label="Backup password"]') as HTMLInputElement;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'A sufficiently long TEST password');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{button('Create privacy wallet').click();button('Create privacy wallet').click();await Promise.resolve();});
  expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'create'}));
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  act(()=>jest.advanceTimersByTime(62000));expect(host.querySelector('time')?.textContent).toBe('01:02');
  expect(button('Create privacy wallet').disabled).toBe(true);
  await act(async()=>{await worker.onmessage({data:{type:'stage',message:'Calculating private witness'}});});expect(host.textContent).toContain('Calculating private witness');
  await act(async()=>{await worker.onmessage({data:{type:'error',message:'TEST worker failure'}});});
  expect(host.querySelector('[role=alert]')?.textContent).toBe('TEST worker failure');
  expect(button('Create privacy wallet').disabled).toBe(false);
  act(()=>root.unmount());expect(worker.terminate).toHaveBeenCalled();root=createRoot(host);
 });
 it('treats a crashed worker as locked and starts a new one for the next operation',async()=>{
  const first:any={postMessage:jest.fn(),terminate:jest.fn()},second:any={postMessage:jest.fn(),terminate:jest.fn()};
  const workers=[first,second];(createPoolWorker as jest.Mock).mockImplementation(()=>workers.shift());
  const wallet:any={network:'xna-test',rpc:jest.fn().mockResolvedValue(manifest.genesis),getAddresses:()=>['tWallet']};
  act(()=>root.render(<PrivacyPool wallet={wallet}/>));
  const typePassword=()=>{const input=host.querySelector('input[aria-label="Backup password"]') as HTMLInputElement;
   act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'A sufficiently long TEST password');input.dispatchEvent(new Event('input',{bubbles:true}));});};
  typePassword();
  await act(async()=>{button('Create privacy wallet').click();await Promise.resolve();await Promise.resolve();});
  await act(async()=>{await first.onmessage({data:{type:'identity',recipient:{owner:'aa'},backup:'{}'}});await first.onmessage({data:{type:'done'}});await Promise.resolve();});
  expect(button('Save encrypted JSON')).toBeDefined();
  await act(async()=>{first.onerror({message:'TEST crash',preventDefault(){}});await Promise.resolve();});
  expect(first.terminate).toHaveBeenCalled();expect(host.querySelector('[role=alert]')?.textContent).toBe('TEST crash');
  expect(button('Save encrypted JSON')).toBeUndefined();
  await act(async()=>{await first.onmessage({data:{type:'stage',message:'late stage'}});});
  expect(host.textContent).not.toContain('late stage');
  typePassword();expect(button('Create privacy wallet').disabled).toBe(false);
  await act(async()=>{button('Create privacy wallet').click();await Promise.resolve();await Promise.resolve();});
  expect(createPoolWorker).toHaveBeenCalledTimes(2);expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'create'}));
 });
});

import {PrivacyPanel} from '@/PrivacyPool';

describe('Privacy Pool layout',()=>{
 it('shows a compact idle status without a spinner or a frozen timer',()=>{
  const idle=renderToStaticMarkup(<OperationTimer busy={false} phase="Privacy wallet locked" elapsed={0}/>);
  expect(idle).toContain('Privacy wallet locked');expect(idle).not.toContain('privacy-operation__indicator');expect(idle).not.toContain('<time');
  const done=renderToStaticMarkup(<OperationTimer busy={false} phase="Operation completed" elapsed={11000} tone="done"/>);
  expect(done).toContain('Last step took 00:11');expect(done).toContain('is-done');expect(done).not.toContain('privacy-operation__indicator');
 });
 it('lists the deposit steps in the order they must happen',()=>{
  const html=renderToStaticMarkup(<PrivacyPool/>);
  expect(html.indexOf('Prepare deposit coin')).toBeGreaterThan(-1);
  expect(html.indexOf('Prepare deposit coin')).toBeLessThan(html.indexOf('Build and verify proof'));
 });
 it('says what is missing instead of only disabling the pool controls',()=>{
  const html=renderToStaticMarkup(<PrivacyPool wallet={{network:'xna-test'} as any}/>);
  expect(html).toContain('Open your private wallet in step 1 before depositing.');
  const pq=renderToStaticMarkup(<PrivacyPool wallet={{network:'xna-pq-test'} as any}/>);
  expect(pq).toContain('Open a Testnet Legacy, PQ or ECDSA wallet');
 });
});

describe('Privacy Pool panel',()=>{
 let host:HTMLDivElement,root:Root;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
 afterEach(()=>{act(()=>root.unmount());host.remove();jest.clearAllMocks();});
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(x=>x.textContent===text);
 const wallet=(address:string):any=>({network:'xna-test',rpc:jest.fn().mockResolvedValue(manifest.genesis),getAddresses:()=>[address]});
 it('keeps an unlocked identity across wallet sections, but never for another wallet',async()=>{
  const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  const first=wallet('tFirstAddress');
  act(()=>root.render(<PrivacyPanel active wallet={first}/>));
  const input=host.querySelector('input[aria-label="Backup password"]') as HTMLInputElement;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'A sufficiently long TEST password');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{button('Create privacy wallet')!.click();await Promise.resolve();});
  await act(async()=>{await worker.onmessage({data:{type:'identity',recipient:{owner:'aa'},backup:{v:1}}});await worker.onmessage({data:{type:'done'}});});
  expect(button('Save encrypted JSON')).toBeDefined();
  act(()=>root.render(<PrivacyPanel active={false} wallet={first}/>));
  expect((host.firstChild as HTMLElement).hidden).toBe(true);
  act(()=>root.render(<PrivacyPanel active wallet={first}/>));
  expect((host.firstChild as HTMLElement).hidden).toBe(false);
  expect(button('Save encrypted JSON')).toBeDefined();expect(button('Lock')).toBeDefined();
  expect(worker.terminate).not.toHaveBeenCalled();expect(createPoolWorker).toHaveBeenCalledTimes(1);
  act(()=>root.render(<PrivacyPanel active wallet={wallet('tSecondAddress')}/>));
  expect(button('Create privacy wallet')).toBeDefined();expect(button('Save encrypted JSON')).toBeUndefined();
  expect(worker.terminate).toHaveBeenCalled();
 });
});

describe('Privacy Pool wallet-word identities',()=>{
 let host:HTMLDivElement,root:Root;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();mockCheckpoints.clear();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
 afterEach(()=>{act(()=>root.unmount());host.remove();jest.clearAllMocks();});
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(x=>x.textContent===text);
 const type=(selector:string,value:string)=>{const input=host.querySelector(selector) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
 it('offers opening from the wallet words, and explains when the words are not available',()=>{
  const withWords=renderToStaticMarkup(<PrivacyPool wallet={{network:'xna-test'} as any} mnemonic="w1 w2" passphrase=""/>);
  expect(withWords).toContain('Open private wallet');expect(withWords).toContain('ZK passphrase');
  expect(withWords).not.toContain('opened without its words');expect(withWords).toContain('Use an encrypted backup file instead');
  const without=renderToStaticMarkup(<PrivacyPool wallet={{network:'xna-test'} as any}/>);
  expect(without).toContain('This wallet was opened without its words');
 });
 it.each(['xna-test','xna-ecdsa-test','xna-pq-strict-test'])('unlocks deposit controls for %s after deriving and scanning the private wallet',async(network)=>{
  const family=network==='xna-test'?'legacy':network==='xna-ecdsa-test'?'ecdsa':'pq';
  const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  const wallet:any={network,rpc:jest.fn().mockResolvedValue(manifest.genesis),getAddresses:()=>['tWalletAddress']};
  act(()=>root.render(<PrivacyPool wallet={wallet} mnemonic="w1 w2" passphrase="P"/>));
  expect(button('Prepare deposit coin')!.disabled).toBe(true);
  act(()=>type('input[aria-label="ZK passphrase"]','zk words'));
  await act(async()=>{button('Open private wallet')!.click();await Promise.resolve();await Promise.resolve();});
  expect(worker.postMessage).toHaveBeenCalledWith({type:'derive',family,mnemonic:'w1 w2',passphrase:'P',zkPassphrase:'zk words',account:0});
  const info=(index:number,issued:number)=>({kind:'derived',derivation:'NeuraiZK/v2',family,storageId:'ab'.repeat(32),fingerprint:'ce62fe35',account:0,gap:20,issued,maxUsed:-1,
   current:{index,address:'tnzk1qyaddress'+index},used:[]});
  await act(async()=>{await worker.onmessage({data:{type:'identity',recipient:{owner:'aa'},backup:null,addresses:info(0,0)}});});
  await act(async()=>{await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(worker.postMessage).toHaveBeenLastCalledWith({type:'scan',gap:20,issued:0});
  expect(host.textContent).toContain('tnzk1qyaddress0');expect(host.textContent).toContain('ce62fe35');
  expect(button('New address \u2192')).toBeDefined();expect(button('Save encrypted JSON')).toBeUndefined();
  expect(host.textContent).not.toContain('Save your encrypted backup in step 1');
  const empty={balanceAtomic:'0',reserveAtomic:'0',height:1,notes:[],transitions:[]};
  await act(async()=>{await worker.onmessage({data:{type:'scan',result:empty,recipient:{owner:'aa'},addresses:info(0,0)}});await worker.onmessage({data:{type:'done'}});await Promise.resolve();});
  expect(button('Prepare deposit coin')!.disabled).toBe(false);
  expect(button('Build and verify proof')!.disabled).toBe(false);
  await act(async()=>{button('New address \u2192')!.click();await Promise.resolve();});
  expect(worker.postMessage).toHaveBeenLastCalledWith({type:'new-address',force:false});
  await act(async()=>{await worker.onmessage({data:{type:'addresses',recipient:{owner:'bb'},addresses:info(1,1)}});await worker.onmessage({data:{type:'done'}});await Promise.resolve();});
  expect(host.textContent).toContain('tnzk1qyaddress1');expect(host.textContent).toContain('New receiving address ready');
  expect(JSON.parse(localStorage.getItem('neurai-privacy-zk:v2:'+JSON.stringify([network,'tWalletAddress',family,0,'ab'.repeat(32)]))!)).toEqual({gap:20,issued:1});
 });
 it('resumes the scan from the encrypted checkpoint saved for this derived wallet',async()=>{
  const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  const wallet:any={network:'xna-test',rpc:jest.fn().mockResolvedValue(manifest.genesis),getAddresses:()=>['tWalletAddress']};
  const key='neurai-privacy-zk:v2:'+JSON.stringify(['xna-test','tWalletAddress','legacy',0,'ab'.repeat(32)])+':scan';
  mockCheckpoints.set(key,'sealed-before');
  act(()=>root.render(<PrivacyPool wallet={wallet} mnemonic="w1 w2" passphrase="P"/>));
  await act(async()=>{button('Open private wallet')!.click();await Promise.resolve();await Promise.resolve();});
  const info={kind:'derived',derivation:'NeuraiZK/v2',family:'legacy',storageId:'ab'.repeat(32),fingerprint:'ce62fe35',account:0,gap:20,issued:0,maxUsed:-1,current:{index:0,address:'tnzk1qyaddress0'},used:[]};
  await act(async()=>{await worker.onmessage({data:{type:'identity',recipient:{owner:'aa'},backup:null,addresses:info}});await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(worker.postMessage).toHaveBeenLastCalledWith({type:'scan',gap:20,issued:0,checkpoint:'sealed-before'});
  const empty={balanceAtomic:'0',reserveAtomic:'0',height:1,notes:[],transitions:[]};
  await act(async()=>{await worker.onmessage({data:{type:'scan',result:empty,recipient:{owner:'aa'},addresses:info,checkpoint:'sealed-after'}});await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(mockCheckpoints.get(key)).toBe('sealed-after');
  // A scan without a checkpoint, for example after a storage error in the worker, keeps the saved one.
  await act(async()=>{button('Refresh notes')!.click();await new Promise(r=>setTimeout(r,0));});
  expect(worker.postMessage).toHaveBeenLastCalledWith({type:'scan',checkpoint:'sealed-after'});
  await act(async()=>{await worker.onmessage({data:{type:'scan',result:empty,recipient:{owner:'aa'},addresses:info,checkpoint:null}});await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(mockCheckpoints.get(key)).toBe('sealed-after');
 });

 // A Legacy P2PKH output, the only coin shape `confirmedPoolCoins` accepts here.
 const P2PKH='76a914'+'ab'.repeat(20)+'88ac';
 /** A testnet wallet whose confirmed coins hold exactly these XNA amounts. */
 const walletHolding=(xna:number[]):any=>({
  network:'xna-test',baseCurrency:'XNA',getAddresses:()=>['tWalletAddress'],
  getUTXOs:async()=>xna.map((value,i)=>({txid:String(i+1).padStart(64,'0'),outputIndex:0,script:P2PKH,
   satoshis:Math.round(value*1e8),assetName:'XNA',address:'tWalletAddress'})),
  rpc:jest.fn(async(method:string)=>method==='gettxout'?{confirmations:1}:manifest.genesis),
 });
 /** Derive the identity and land on an empty scan, the state deposits start from. */
 async function openPrivateWallet(wallet:any) {
  const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  act(()=>root.render(<PrivacyPool wallet={wallet} mnemonic="w1 w2" passphrase="P"/>));
  await act(async()=>{button('Open private wallet')!.click();await Promise.resolve();await Promise.resolve();});
  const info={kind:'derived',derivation:'NeuraiZK/v2',family:'legacy',storageId:'ab'.repeat(32),fingerprint:'ce62fe35',
   account:0,gap:20,issued:0,maxUsed:-1,current:{index:0,address:'tnzk1qyaddress0'},used:[]};
  await act(async()=>{await worker.onmessage({data:{type:'identity',recipient:{owner:'aa'},backup:null,addresses:info}});
   await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  const empty={balanceAtomic:'0',reserveAtomic:'0',height:1,notes:[],transitions:[]};
  await act(async()=>{await worker.onmessage({data:{type:'scan',result:empty,recipient:{owner:'aa'},addresses:info}});
   await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  // Let the coin read that follows the unlocked identity settle.
  await act(async()=>{await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));});
  return worker;
 }
 it('keeps the proof step shut while no coin matches the deposit exactly',async()=>{
  // One large coin: enough XNA, but the pool spends a coin of the exact amount.
  await openPrivateWallet(walletHolding([100]));
  expect(button('Prepare deposit coin')!.disabled).toBe(false);
  expect(button('Prepare deposit coin')!.className).toContain('neurai-btn--primary');
  expect(button('Build and verify proof')!.disabled).toBe(true);
  expect(host.textContent).toContain('No confirmed coin matches this deposit');
 });
 it('opens the proof step once the exact coin and a separate fee coin are confirmed',async()=>{
  // The default form deposits 10 XNA with a 0.1 XNA fee.
  await openPrivateWallet(walletHolding([10,1]));
  expect(button('Build and verify proof')!.disabled).toBe(false);
  // The first step is done, so it stops asking to be pressed.
  expect(button('Prepare deposit coin')).toBeUndefined();
  expect(button('Prepare another')!.className).toContain('neurai-btn--secondary');
  expect(host.textContent).not.toContain('No confirmed coin matches this deposit');
 });
 it('names the fee coin as the blocker when only the deposit coin is there',async()=>{
  await openPrivateWallet(walletHolding([10]));
  expect(button('Build and verify proof')!.disabled).toBe(true);
  expect(host.textContent).toContain('A separate confirmed supported XNA coin is needed for the fee');
 });
 /** A wallet whose node accepts the self-transfer that prepares a deposit coin. */
 const fundingWallet=()=>{
  const wallet=walletHolding([100]);
  // 100 XNA in, 10 XNA out plus 89.9 change, so the visible fee is 0.1 XNA.
  wallet.createTransaction=jest.fn().mockResolvedValue({debug:{signedTransaction:'00'}});
  wallet.rpc=jest.fn(async(method:string)=>method==='gettxout'?{confirmations:1,value:100}
   :method==='testmempoolaccept'?[{allowed:true}]
   :method==='sendrawtransaction'?'cd'.repeat(32)
   :method==='decoderawtransaction'?{txid:'cd'.repeat(32),vin:[{txid:'ab'.repeat(32),vout:0}],vout:[{value:10},{value:89.9}]}
   :manifest.genesis);
  return wallet;
 };
 it('puts the review for the prepared coin between its own step and the next',async()=>{
  const wallet=fundingWallet();
  await openPrivateWallet(wallet);
  await act(async()=>{button('Prepare deposit coin')!.click();await new Promise(r=>setTimeout(r,0));});
  const rows=Array.from(host.querySelectorAll('ol > li')).map(li=>li.textContent??'');
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain('Prepare an exact coin');
  expect(rows[1]).toContain('Review and publish');
  expect(rows[1]).toContain('0.1 XNA');
  expect(rows[2]).toContain('Create the private note');
  // The next step stays shut while the one before it is still being reviewed.
  expect(button('Build and verify proof')!.disabled).toBe(true);
  expect(button('Publish TEST transaction')!.disabled).toBe(false);
 });
 it('shows the published coin as waiting instead of asking to prepare it again',async()=>{
  const wallet=fundingWallet();
  await openPrivateWallet(wallet);
  await act(async()=>{button('Prepare deposit coin')!.click();await new Promise(r=>setTimeout(r,0));});
  await act(async()=>{button('Publish TEST transaction')!.click();await new Promise(r=>setTimeout(r,0));});
  // The node is still handing back only the old coin, so nothing is confirmed.
  const prepare=button('Prepare deposit coin')!;
  expect(prepare.disabled).toBe(true);
  expect(prepare.className).toContain('neurai-btn--secondary');
  expect(host.textContent).toContain('Pending in the mempool. It becomes usable once a block includes it.');
  expect(host.textContent).toContain('Step B opens once a block includes it');
  expect(button('Build and verify proof')!.disabled).toBe(true);
 });
 it('holds the note step after publishing, then refreshes the notes when the block lands',async()=>{
  // Both coins confirmed, so the proof step is the one that can run.
  const wallet=walletHolding([10,1]);
  wallet.getPrivateKeyByAddress=()=>'WIF';
  let confirmations=0;
  wallet.rpc=jest.fn(async(method:string)=>method==='gettxout'?{confirmations:1,value:100}
   :method==='testmempoolaccept'?[{allowed:true}]
   :method==='sendrawtransaction'?'cd'.repeat(32)
   :method==='getrawtransaction'?{txid:'cd'.repeat(32),confirmations}
   :method==='decoderawtransaction'?{txid:'cd'.repeat(32)}
   :manifest.genesis);
  const worker=await openPrivateWallet(wallet);
  await act(async()=>{button('Build and verify proof')!.click();await new Promise(r=>setTimeout(r,0));});
  await act(async()=>{await worker.onmessage({data:{type:'prepared',result:{raw:'00',form:'Deposit',feeAtomic:'10000000',amountAtomic:'1000000000',inputPoints:[{txid:'ab'.repeat(32),vout:0}]}}});
   await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(button('Publish TEST transaction')).toBeDefined();

  await act(async()=>{button('Publish TEST transaction')!.click();await new Promise(r=>setTimeout(r,0));});
  // The proof step must not look ready again while its transaction is pending.
  expect(button('Build and verify proof')!.disabled).toBe(true);
  expect(host.textContent).toContain('Waiting for a confirmation. The notes refresh on their own once the block lands.');
  expect(button('Prepare another')!.disabled).toBe(true);

  // The block arrives: the wait ends and the notes are read again unprompted.
  confirmations=1;
  worker.postMessage.mockClear();
  await act(async()=>{button('Check transaction status')!.click();await new Promise(r=>setTimeout(r,0));});
  expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'scan'}));
  expect(host.textContent).not.toContain('Waiting for a confirmation');
 });
 it('steps back over addresses nobody has paid, and stops at the last used one',async()=>{
  const worker=await openPrivateWallet(walletHolding([100]));
  const info=(index:number,issued:number,maxUsed:number)=>({kind:'derived',derivation:'NeuraiZK/v2',family:'legacy',
   storageId:'ab'.repeat(32),fingerprint:'ce62fe35',account:0,gap:20,issued,maxUsed,
   current:{index,address:'tnzk1qyaddress'+index},used:[]});
  // Nothing issued and nothing used: there is nowhere to step back to.
  expect(button('\u2190 Previous')!.disabled).toBe(true);

  await act(async()=>{button('New address \u2192')!.click();await Promise.resolve();});
  await act(async()=>{await worker.onmessage({data:{type:'addresses',recipient:{owner:'bb'},addresses:info(1,1,-1)}});
   await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(host.textContent).toContain('tnzk1qyaddress1');
  expect(button('\u2190 Previous')!.disabled).toBe(false);

  // Stepping back lowers the issued counter, which is what moved it forward.
  worker.postMessage.mockClear();
  await act(async()=>{button('\u2190 Previous')!.click();await new Promise(r=>setTimeout(r,0));});
  expect(worker.postMessage).toHaveBeenCalledWith({type:'scan',gap:20,issued:0,checkpoint:undefined});

  // An address that already received a note is not one to hand out again.
  await act(async()=>{await worker.onmessage({data:{type:'scan',result:{balanceAtomic:'0',reserveAtomic:'0',height:1,notes:[],transitions:[]},
   recipient:{owner:'bb'},addresses:info(1,1,0)}});await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(button('\u2190 Previous')!.disabled).toBe(true);
 });
 it('shows the XNA held by the whole pool beside the private balance',async()=>{
  const worker=await openPrivateWallet(walletHolding([100]));
  const info={kind:'derived',derivation:'NeuraiZK/v2',family:'legacy',storageId:'ab'.repeat(32),fingerprint:'ce62fe35',
   account:0,gap:20,issued:0,maxUsed:-1,current:{index:0,address:'tnzk1qyaddress0'},used:[]};
  await act(async()=>{button('Refresh notes')!.click();await new Promise(r=>setTimeout(r,0));});
  await act(async()=>{await worker.onmessage({data:{type:'scan',result:{balanceAtomic:'250000000',reserveAtomic:'1234500000000',height:7,
   notes:[{cm:'11'.repeat(32),amountAtomic:'250000000',address:{chain:0,index:0}}],transitions:[]},recipient:{owner:'aa'},addresses:info}});
   await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  const row=Array.from(host.querySelectorAll('p')).find(p=>p.textContent?.startsWith('Total in the pool, all wallets'));
  expect(row?.textContent).toContain('12345 XNA');
 });
 it('puts the receiving address above the recovery details',async()=>{
  await openPrivateWallet(walletHolding([100]));
  const text=host.textContent??'';
  expect(text.indexOf('Confirmed private balance')).toBeLessThan(text.indexOf('Receive privately'));
  expect(text.indexOf('Receive privately')).toBeLessThan(text.indexOf('Recovered from the wallet words'));
 });
 it('rejects an invalid account before contacting the worker',async()=>{
  const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  const wallet:any={network:'xna-test',rpc:jest.fn().mockResolvedValue(manifest.genesis),getAddresses:()=>['tWalletAddress']};
  act(()=>root.render(<PrivacyPool wallet={wallet} mnemonic="w1 w2"/>));
  act(()=>type('input[aria-label="Account"]','-1'));
  await act(async()=>{button('Open private wallet')!.click();await Promise.resolve();});
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Account must be a whole number');
  expect(worker.postMessage).not.toHaveBeenCalled();
 });
});
