/** @jest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {useC6BackgroundSync} from '../../src/privacy-pool/useC6BackgroundSync';
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise<any>(r=>{resolve=r;});return {resolve,promise};}
describe('C6 silent confirmed-state refresh',()=>{
 let root:Root,host:HTMLDivElement,api:ReturnType<typeof useC6BackgroundSync>,hash:string,options:any;
 function Harness(){api=useC6BackgroundSync(options);return <><input aria-label="Amount"/><p>{api.syncing?'Refreshing':'Idle'}</p><span>{api.warning}</span></>;}
 const render=()=>act(()=>root.render(<Harness/>));
 beforeEach(()=>{jest.useFakeTimers();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;hash='11'.repeat(32);host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  options={active:true,paused:false,tip:{height:100,hash},rpc:jest.fn(async()=>hash),canStart:jest.fn(()=>true),scan:jest.fn(async()=>({scan:{result:{balanceAtomic:'10000000000'}}})),apply:jest.fn()};
 });
 afterEach(()=>{act(()=>root.unmount());host.remove();jest.restoreAllMocks();jest.useRealTimers();});
 const tick=()=>act(async()=>jest.advanceTimersByTime(20000));
 it('probes only the tip while unchanged, then recovers a changed hash without disabling inputs',async()=>{
  render();await tick();expect(options.rpc).toHaveBeenCalledWith('getbestblockhash',[]);expect(options.scan).not.toHaveBeenCalled();
  const job=deferred();options.scan.mockImplementationOnce(()=>job.promise);hash='22'.repeat(32);await tick();expect(api.isRunning()).toBe(true);expect(host.textContent).toContain('Refreshing');expect((host.querySelector('input') as HTMLInputElement).disabled).toBe(false);
  await tick();expect(options.scan).toHaveBeenCalledTimes(1);
  await act(async()=>job.resolve({scan:{result:{balanceAtomic:'20000000000'}}}));expect(options.apply).toHaveBeenCalledWith({scan:{result:{balanceAtomic:'20000000000'}}});expect(api.isRunning()).toBe(false);
 });
 it('detects a same-height reorganization and a lower tip through its changed hash',async()=>{
  render();hash='33'.repeat(32);await tick();expect(options.scan).toHaveBeenCalledTimes(1);options.tip={height:99,hash};render();await tick();expect(options.scan).toHaveBeenCalledTimes(1);
 });
 it('skips foreground work, reviews and hidden tabs, and refreshes on visibility return',async()=>{
  options.paused=true;render();hash='22'.repeat(32);await tick();expect(options.rpc).not.toHaveBeenCalled();options.paused=false;options.canStart.mockReturnValue(false);render();await tick();expect(options.rpc).not.toHaveBeenCalled();
  options.canStart.mockReturnValue(true);jest.spyOn(document,'visibilityState','get').mockReturnValue('hidden');await tick();expect(options.rpc).not.toHaveBeenCalled();
  jest.restoreAllMocks();await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(options.scan).toHaveBeenCalledTimes(1);
 });
 it('lets a foreground action acquire the worker during the tip probe and wait safely',async()=>{
  const probe=deferred();options.rpc.mockImplementationOnce(()=>probe.promise);render();await tick();const waiting=api.wait();options.canStart.mockReturnValue(false);
  await act(async()=>probe.resolve('22'.repeat(32)));await waiting;expect(options.scan).not.toHaveBeenCalled();expect(api.isRunning()).toBe(false);
 });
 it('waits for a real in-flight scan before the caller can send a worker command',async()=>{
  const job=deferred();options.scan.mockImplementationOnce(()=>job.promise);render();hash='22'.repeat(32);await tick();let finished=false;const waiter=api.wait().then(()=>{finished=true;});expect(finished).toBe(false);
  await act(async()=>job.resolve({scan:{}}));await waiter;expect(finished).toBe(true);expect(api.isRunning()).toBe(false);
 });
 it('retains the previous balance on failure and backs off before retrying',async()=>{
  options.scan.mockRejectedValueOnce(Error('TEST RPC unavailable'));render();hash='22'.repeat(32);await tick();expect(options.apply).not.toHaveBeenCalled();expect(api.warning).toContain('keeping the last checked balance');expect(api.isRunning()).toBe(false);
  await tick();expect(options.scan).toHaveBeenCalledTimes(1);await tick();expect(options.scan).toHaveBeenCalledTimes(2);expect(api.warning).toBe('');
 });
 it('discards late results after locking or changing the RPC scope',async()=>{
  const job=deferred();options.scan.mockImplementationOnce(()=>job.promise);render();hash='22'.repeat(32);await tick();options.active=false;render();await act(async()=>job.resolve({scan:{}}));expect(options.apply).not.toHaveBeenCalled();expect(api.isRunning()).toBe(false);
 });
 it('reset detaches an old scan so it cannot overwrite a newly opened session',async()=>{
  const old=deferred(),fresh=deferred();options.scan.mockImplementationOnce(()=>old.promise).mockImplementationOnce(()=>fresh.promise);render();hash='22'.repeat(32);await tick();act(()=>api.reset());await tick();expect(options.scan).toHaveBeenCalledTimes(2);
  await act(async()=>old.resolve({old:true}));expect(options.apply).not.toHaveBeenCalled();expect(api.isRunning()).toBe(true);
  await act(async()=>fresh.resolve({fresh:true}));expect(options.apply).toHaveBeenCalledWith({fresh:true});expect(api.isRunning()).toBe(false);
 });
});
