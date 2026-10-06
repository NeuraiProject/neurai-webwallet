/** @jest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
jest.mock('@neuraiproject/neurai-sign-transaction',()=>({__esModule:true,default:{sign:jest.fn()}}));
jest.mock('@/privacy-benchmark/workerFactory',()=>({createPrivacyBenchmarkWorker:jest.fn(),createGroth16BenchmarkWorker:jest.fn()}));
jest.mock('@/privacy-pool/workerFactory',()=>({createPoolWorker:jest.fn(),createC5PoolWorker:jest.fn()}));
// Jest cannot load the lazy C6 views, so the XNA runtime stays unconfigured
// here while the asset pool is configured, to prove the wallet hides it.
jest.mock('@/privacy-pool/c6Deployment',()=>({C6_XNA_TESTNET_RUNTIME:null,C6_XNA_UNAVAILABLE_REASON:'No application-pinned C6 deployment',
 C6_ASSET_TESTNET_RUNTIME:{config:{manifest:{asset:'ASSET_TEST'},expectedCommitment:'aa'.repeat(32)},createWorker:jest.fn()}}));
import {PrivacyPanel,PrivacyPool} from '@/PrivacyPool';
import {createPoolWorker} from '@/privacy-pool/workerFactory';

const wallet=(own:string):any=>({network:'xna-ecdsa-test',getAddresses:()=>[own],rpc:jest.fn()});

describe('Privacy Pool panel',()=>{
 let host:HTMLDivElement,root:Root;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
 afterEach(()=>{act(()=>root.unmount());host.remove();});
 const options=()=>Array.from(host.querySelectorAll<HTMLOptionElement>('#privacy-pool-version option')).map(o=>o.value);

 it('offers only the C6 pool, for XNA',()=>{
  act(()=>root.render(<PrivacyPanel active wallet={wallet('tFirstAddress')} mnemonic="TEST words"/>));
  expect(options()).toEqual(['C6']);
  expect(host.querySelector('select[aria-label="C6 pool currency"]')).toBeNull();
  expect(host.textContent).toContain('No application-pinned C6 deployment');
  expect(host.textContent).not.toContain('Switching locks the private wallet');
  expect(createPoolWorker).not.toHaveBeenCalled();
 });

 it('the pool itself still offers every version and the asset pool unless told otherwise',()=>{
  act(()=>root.render(<PrivacyPool wallet={wallet('tFirstAddress')} versions={['C6']}/>));
  expect(options()).toEqual(['C6']);
  expect(host.querySelector('select[aria-label="C6 pool currency"]')).not.toBeNull();
  act(()=>root.render(<PrivacyPool key="all" wallet={wallet('tFirstAddress')}/>));
  expect(options()).toEqual(['C4','C5','C6']);
 });

 it('keeps the pool mounted across wallet sections, but never for another wallet',()=>{
  const first=wallet('tFirstAddress');
  act(()=>root.render(<PrivacyPanel active wallet={first}/>));
  const pool=host.querySelector('#privacy-pool-version');
  act(()=>root.render(<PrivacyPanel active={false} wallet={first}/>));
  expect((host.firstChild as HTMLElement).hidden).toBe(true);
  act(()=>root.render(<PrivacyPanel active wallet={first}/>));
  expect((host.firstChild as HTMLElement).hidden).toBe(false);
  expect(host.querySelector('#privacy-pool-version')).toBe(pool);
  act(()=>root.render(<PrivacyPanel active wallet={wallet('tSecondAddress')}/>));
  expect(host.querySelector('#privacy-pool-version')).not.toBe(pool);
 });
});
