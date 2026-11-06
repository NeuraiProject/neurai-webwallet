/** @jest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
jest.mock('@neuraiproject/neurai-sign-transaction',()=>({__esModule:true,default:{sign:jest.fn()}}));
jest.mock('@/privacy-pool/workerFactory',()=>({createC7PoolWorker:jest.fn()}));
// The pinned instance stays unconfigured here, so the panel shows it as unavailable.
jest.mock('@/privacy-pool/c7Deployment',()=>({C7_XNA_TESTNET_RUNTIME:null,C7_XNA_UNAVAILABLE_REASON:'No application-pinned C7 deployment'}));
import {PrivacyPanel,PrivacyPool} from '@/PrivacyPool';
import {createC7PoolWorker} from '@/privacy-pool/workerFactory';

const wallet=(own:string):any=>({network:'xna-ecdsa-test',getAddresses:()=>[own],rpc:jest.fn()});

describe('Privacy Pool panel',()=>{
 let host:HTMLDivElement,root:Root;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
 afterEach(()=>{act(()=>root.unmount());host.remove();});

 it('offers only the C7 pool, with no version selector',()=>{
  act(()=>root.render(<PrivacyPanel active wallet={wallet('tFirstAddress')} mnemonic="TEST words"/>));
  expect(host.querySelector('#privacy-pool-version')).toBeNull();
  expect(host.textContent).toContain('C7 TEST pool unavailable');
  expect(host.textContent).toContain('No application-pinned C7 deployment');
  expect(createC7PoolWorker).not.toHaveBeenCalled();
 });

 it('loads the C7 wallet for a pinned instance without starting its worker',()=>{
  const runtime:any={config:{},createWorker:jest.fn()};
  act(()=>root.render(<PrivacyPool wallet={wallet('tFirstAddress')} c7={runtime}/>));
  expect(host.textContent).toContain('Loading C7 wallet');
  expect(runtime.createWorker).not.toHaveBeenCalled();
  act(()=>root.render(<PrivacyPool wallet={wallet('tFirstAddress')} c7={null}/>));
  expect(host.textContent).toContain('C7 TEST pool unavailable');
 });

 it('keeps the pool mounted across wallet sections, but never for another wallet',()=>{
  const first=wallet('tFirstAddress');
  act(()=>root.render(<PrivacyPanel active wallet={first}/>));
  const pool=host.querySelector('section[role="status"]');
  expect(pool).not.toBeNull();
  act(()=>root.render(<PrivacyPanel active={false} wallet={first}/>));
  expect((host.firstChild as HTMLElement).hidden).toBe(true);
  act(()=>root.render(<PrivacyPanel active wallet={first}/>));
  expect((host.firstChild as HTMLElement).hidden).toBe(false);
  expect(host.querySelector('section[role="status"]')).toBe(pool);
  act(()=>root.render(<PrivacyPanel active wallet={wallet('tSecondAddress')}/>));
  expect(host.querySelector('section[role="status"]')).not.toBe(pool);
 });
});
