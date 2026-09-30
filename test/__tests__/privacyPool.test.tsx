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
import { C3_TESTNET_MANIFEST as manifest } from '@neuraiproject/neurai-privacy/client';

describe('Privacy Pool controls',()=>{
 let host:HTMLDivElement,root:Root;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;HTMLElement.prototype.scrollTo=jest.fn();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
 afterEach(()=>{act(()=>root.unmount());host.remove();jest.useRealTimers();jest.clearAllMocks();});
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(x=>x.textContent===text)!;
 it('opens and closes the benchmark without replacing the pool route',()=>{
  act(()=>root.render(<PrivacyPool/>));
  act(()=>button('Open benchmark').click());expect(host.textContent).toContain('Run C3 benchmark');
  act(()=>button('Back to pool').click());expect(host.textContent).toContain('Build and verify proof');
  expect(host.textContent).not.toContain('Run C3 benchmark');
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
  expect(html).toContain('Create or open your private wallet in step 1.');
  const pq=renderToStaticMarkup(<PrivacyPool wallet={{network:'xna-pq-strict-test'} as any}/>);
  expect(pq).toContain('Open a Testnet Legacy wallet');
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
 it('derives in the worker, scans automatically, shows the tnzk address and keeps rotation state locally',async()=>{
  const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  const wallet:any={network:'xna-test',rpc:jest.fn().mockResolvedValue(manifest.genesis),getAddresses:()=>['tWalletAddress']};
  act(()=>root.render(<PrivacyPool wallet={wallet} mnemonic="w1 w2" passphrase="P"/>));
  act(()=>type('input[aria-label="ZK passphrase"]','zk words'));
  await act(async()=>{button('Open private wallet')!.click();await Promise.resolve();await Promise.resolve();});
  expect(worker.postMessage).toHaveBeenCalledWith({type:'derive',mnemonic:'w1 w2',passphrase:'P',zkPassphrase:'zk words',account:0});
  const info=(index:number,issued:number)=>({kind:'derived',fingerprint:'ce62fe35',account:0,gap:20,issued,maxUsed:-1,
   current:{index,address:'tnzk1qyaddress'+index},used:[]});
  await act(async()=>{await worker.onmessage({data:{type:'identity',recipient:{owner:'aa'},backup:null,addresses:info(0,0)}});});
  await act(async()=>{await worker.onmessage({data:{type:'done'}});await new Promise(r=>setTimeout(r,0));});
  expect(worker.postMessage).toHaveBeenLastCalledWith({type:'scan',gap:20,issued:0});
  expect(host.textContent).toContain('tnzk1qyaddress0');expect(host.textContent).toContain('ce62fe35');
  expect(button('New address')).toBeDefined();expect(button('Save encrypted JSON')).toBeUndefined();
  expect(host.textContent).not.toContain('Save your encrypted backup in step 1');
  const empty={balanceAtomic:'0',reserveAtomic:'0',height:1,notes:[],transitions:[]};
  await act(async()=>{await worker.onmessage({data:{type:'scan',result:empty,recipient:{owner:'aa'},addresses:info(0,0)}});await worker.onmessage({data:{type:'done'}});await Promise.resolve();});
  await act(async()=>{button('New address')!.click();await Promise.resolve();});
  expect(worker.postMessage).toHaveBeenLastCalledWith({type:'new-address',force:false});
  await act(async()=>{await worker.onmessage({data:{type:'addresses',recipient:{owner:'bb'},addresses:info(1,1)}});await worker.onmessage({data:{type:'done'}});await Promise.resolve();});
  expect(host.textContent).toContain('tnzk1qyaddress1');expect(host.textContent).toContain('New receiving address ready');
  expect(JSON.parse(localStorage.getItem('neurai-privacy-zk:xna-test:tWalletAddress:ce62fe35:0')!)).toEqual({gap:20,issued:1});
 });
 it('resumes the scan from the encrypted checkpoint saved for this derived wallet',async()=>{
  const worker:any={postMessage:jest.fn(),terminate:jest.fn()};(createPoolWorker as jest.Mock).mockReturnValue(worker);
  const wallet:any={network:'xna-test',rpc:jest.fn().mockResolvedValue(manifest.genesis),getAddresses:()=>['tWalletAddress']};
  const key='neurai-privacy-zk:xna-test:tWalletAddress:ce62fe35:0:scan';
  mockCheckpoints.set(key,'sealed-before');
  act(()=>root.render(<PrivacyPool wallet={wallet} mnemonic="w1 w2" passphrase="P"/>));
  await act(async()=>{button('Open private wallet')!.click();await Promise.resolve();await Promise.resolve();});
  const info={kind:'derived',fingerprint:'ce62fe35',account:0,gap:20,issued:0,maxUsed:-1,current:{index:0,address:'tnzk1qyaddress0'},used:[]};
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
