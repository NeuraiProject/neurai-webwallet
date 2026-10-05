/** @jest-environment jsdom */
import React, {act} from 'react';
import {createRoot,Root} from 'react-dom/client';
jest.mock('@/privacy-benchmark/workerFactory',()=>({createPrivacyBenchmarkWorker:jest.fn(),createGroth16BenchmarkWorker:jest.fn()}));
jest.mock('@/privacy-pool/workerFactory',()=>({createPoolWorker:jest.fn(),createC5PoolWorker:jest.fn()}));
jest.mock('@/privacy-pool/scanCheckpointStore',()=>({scanCheckpointStore:()=>null}));
jest.mock('@neuraiproject/neurai-sign-transaction',()=>({__esModule:true,default:{sign:jest.fn()}}));
import {PrivacyPool} from '@/PrivacyPool';
import {C4_TESTNET_DEPLOYMENT} from '@/privacy-pool/deployment';
const manifest=C4_TESTNET_DEPLOYMENT.manifest;
const worker=()=>({postMessage:jest.fn(),terminate:jest.fn(),onmessage:null as any});
// View-only fixtures: structural manifest/proof validation is tested by the
// library and full browser/node harness, not these mocked worker tests.
const c5={...manifest,schema:'neurai-c5-xna-test-v1',zkProfile:2,commitment:'bb'.repeat(32)} as any;
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.clearAllMocks();});
const select=()=>host.querySelector<HTMLSelectElement>('#privacy-pool-version')!;
const change=(profile:string)=>act(()=>{select().value=profile;select().dispatchEvent(new Event('change',{bubbles:true}));});
const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(x=>x.textContent===text)!;
const wallet={network:'xna-test',rpc:jest.fn(async(method:string)=>method==='getblockchaininfo'?{zk_public_tree:{active_for_next_block:true}}:manifest.genesis)} as any;
function password(){const input=host.querySelector('input[aria-label="Backup password"]') as HTMLInputElement;
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'A sufficiently long TEST password');input.dispatchEvent(new Event('input',{bubbles:true}));});}
it('defaults to C4 and an unavailable C5 never invokes funding or a worker',()=>{
 act(()=>root.render(<PrivacyPool wallet={wallet} deployments={{C4:{manifest,createWorker:worker}}}/>));
 expect(select().value).toBe('C4');change('C5');expect(host.textContent).toContain('C5 TEST pool unavailable');
 expect(host.querySelector('input[aria-label="Backup password"]')).toBeNull();expect(wallet.rpc).not.toHaveBeenCalled();
 change('C4');expect(host.textContent).toContain('C4 TEST keys');
});
it('switching terminates the old worker and clears its identity, balance and backup',async()=>{
 const old=worker(),fresh=worker(),oldFactory=jest.fn(()=>old),newFactory=jest.fn(()=>fresh);
 act(()=>root.render(<PrivacyPool wallet={wallet} deployments={{C4:{manifest,createWorker:oldFactory},C5:{manifest:c5,createWorker:newFactory}}}/>));
 password();await act(async()=>{button('Create privacy wallet').click();await Promise.resolve();});
 expect(select().disabled).toBe(true);
 await act(async()=>{await old.onmessage({data:{type:'identity',recipient:{owner:'old-identity'},backup:{encrypted:'old-backup'}}});await old.onmessage({data:{type:'done'}});});
 expect(select().disabled).toBe(false);expect(button('Save encrypted JSON')).toBeDefined();
 change('C5');expect(old.terminate).toHaveBeenCalledTimes(1);expect(newFactory).not.toHaveBeenCalled();
 expect(host.textContent).toContain('C5 TEST keys');expect(button('Save encrypted JSON')).toBeUndefined();
 expect(host.querySelector('input[aria-label="Backup password"]')?.getAttribute('value')).toBe('');
 await act(async()=>{await old.onmessage({data:{type:'identity',recipient:{owner:'late-old-identity'},backup:{}}});});
 expect(button('Save encrypted JSON')).toBeUndefined();
 password();await act(async()=>{button('Create privacy wallet').click();await Promise.resolve();await Promise.resolve();});
 expect(newFactory).toHaveBeenCalledTimes(1);expect(fresh.postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'create'}));
});

it('an old RPC node cannot create a C5 identity or start its worker',async()=>{
 const factory=jest.fn(worker);
 const oldRpc=jest.fn(async(method:string)=>method==='getblockchaininfo'?{}:manifest.genesis);
 act(()=>root.render(<PrivacyPool wallet={{...wallet,rpc:oldRpc}} deployment={{manifest:c5,createWorker:factory}}/>));
 password();await act(async()=>{button('Create privacy wallet').click();await Promise.resolve();await Promise.resolve();});
 expect(host.textContent).toContain('does not have C5 public-tree validation active');
 expect(factory).not.toHaveBeenCalled();
 expect(oldRpc.mock.calls.map(x=>x[0])).toEqual(['getblockhash','getblockchaininfo']);
});
