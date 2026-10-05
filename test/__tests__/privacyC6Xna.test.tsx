/** @jest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {C6XnaPrivacyPool} from '../../src/privacy-pool/C6XnaPrivacyPool';
const mock={derive:jest.fn(),openJournal:jest.fn(),scan:jest.fn(),prepare:jest.fn(),rebuild:jest.fn(),recordSigned:jest.fn(),broadcastAttempt:jest.fn(),backup:jest.fn(),terminate:jest.fn(),newAddress:jest.fn(),releaseDraft:jest.fn()};
jest.mock('@neuraiproject/neurai-privacy/client',()=>{
 const a=jest.requireActual('@neuraiproject/neurai-privacy/client');return {...a,C6WorkerClient:jest.fn(()=>mock),IndexedDbSponsorStore:jest.fn(()=>({close:jest.fn()})),admitTransaction:jest.fn(async()=>({txid:'aa'.repeat(32)})),publishTransaction:jest.fn(async()=> 'aa'.repeat(32)),inspectFundingTransaction:jest.fn(async()=>({points:[],feeAtomic:1000000n}))};
});
jest.mock('@neuraiproject/neurai-sign-transaction',()=>({__esModule:true,default:{sign:jest.fn()}}));
jest.mock('../../src/privacy-pool/walletNetwork',()=>({...jest.requireActual('../../src/privacy-pool/walletNetwork'),signPoolInputs:jest.fn(()=> 'SIGNED_TEST_DEPOSIT')}));
const runtime:any={config:{network:'testnet',deployment:{genesis:'01'.repeat(32)},manifest:{fees:{D:['10000000'],T1:['10000000'],T2:['10000000'],T3:['10000000'],W:['10000000'],J2:['10000000']}}},createWorker:jest.fn(()=>({}))};
const wallet:any={network:'xna-ecdsa-test',baseCurrency:'XNA',getAddresses:()=>['own'],getUTXOs:jest.fn(async()=>[]),getPrivateKeyByAddress:jest.fn(async()=> 'TEST KEY'),rpc:jest.fn()};
const address={kind:'derived',current:{address:'nzkTEST',index:0},used:[]};
const state={scan:{result:{tip:{height:22485,hash:'11'.repeat(32)},balanceAtomic:'90000000000',spendableAtomic:'90000000000',notes:[{cm:'02'.repeat(32),amountAtomic:'90000000000',spendable:true}]},addresses:address},journal:{operations:[]}};
function deferred(){let resolve!:(x:any)=>void;const promise=new Promise<any>(r=>{resolve=r;});return {resolve,promise};}
describe('C6 XNA private wallet lifecycle',()=>{
 let host:HTMLDivElement,root:Root;
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();wallet.getUTXOs.mockResolvedValue([]);wallet.createTransaction=jest.fn(async()=>({debug:{signedTransaction:'SIGNED_FUNDING'}}));wallet.rpc.mockResolvedValue(22485);host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
  mock.derive.mockResolvedValue({identity:{addresses:address}});mock.openJournal.mockResolvedValue({journal:{operations:[]}});mock.scan.mockResolvedValue(state);mock.backup.mockResolvedValue({cipher:'ENCRYPTED TEST'});URL.createObjectURL=jest.fn(()=>'blob:test');URL.revokeObjectURL=jest.fn();jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 });
 afterEach(()=>{act(()=>root.unmount());host.remove();jest.restoreAllMocks();});
 async function open(){act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private wallet').click();await new Promise(r=>setTimeout(r,0));});}
 it('shows every operation and balance placeholder while locked without starting crypto',()=>{
  act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
  expect(host.querySelector('[aria-label="C6 private wallet setup"]')).not.toBeNull();expect(host.querySelector('[aria-label="C6 private operations"]')).not.toBeNull();
  const cards=host.querySelectorAll('[aria-label="Available C6 operations"] button');expect(cards).toHaveLength(4);cards.forEach(b=>expect((b as HTMLButtonElement).disabled).toBe(true));
  expect(host.textContent).toContain('First use here:');expect(host.textContent).toContain('ZK passphrase (optional)');expect(host.textContent).toContain('Confirmed private balance');
  expect(host.querySelector('[aria-label="C6 amount"]')!.matches(':disabled')).toBe(true);expect(mock.derive).not.toHaveBeenCalled();expect(runtime.createWorker).not.toHaveBeenCalled();
 });
 it('explains mainnet, unsupported families and unavailable words separately',()=>{
  act(()=>root.render(<C6XnaPrivacyPool wallet={{...wallet,network:'xna'}} mnemonic="TEST words" runtime={runtime}/>));expect(host.querySelector('[role="alert"]')!.textContent).toContain('mainnet');
  act(()=>root.render(<C6XnaPrivacyPool wallet={{...wallet,network:'xna-pq-test'}} mnemonic="TEST words" runtime={runtime}/>));expect(host.querySelector('[role="alert"]')!.textContent).toContain('generic AuthScript');
  act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} runtime={runtime}/>));expect(host.querySelector('[role="alert"]')!.textContent).toContain('no recovery words');expect(button('Open private wallet').disabled).toBe(true);expect(mock.derive).not.toHaveBeenCalled();
 });
 it('enables operation cards after opening and resets the visible status on lock',async()=>{
  await open();const withdraw=host.querySelector('[aria-label="Available C6 operations"] button:nth-child(3)') as HTMLButtonElement;expect(withdraw.disabled).toBe(false);
  act(()=>withdraw.click());expect(host.querySelector('[aria-label="C6 withdrawal destination"]')).not.toBeNull();
  act(()=>button('Lock private wallet').click());expect(Array.from(host.querySelectorAll('[role="status"]')).at(-1)!.textContent).toContain('Private wallet locked');expect(host.textContent).not.toContain('900 XNA');expect(host.querySelector('[aria-label="C6 withdrawal destination"]')!.matches(':disabled')).toBe(true);
 });
 it('local cancellation stops a pending open and never exposes a late result',async()=>{
  const job=deferred();mock.scan.mockImplementationOnce(()=>job.promise);act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
  await act(async()=>{button('Open private wallet').click();await new Promise(r=>setTimeout(r,0));});act(()=>button('Cancel local work and lock').click());
  await act(async()=>{job.resolve(state);await new Promise(r=>setTimeout(r,0));});expect(host.textContent).not.toContain('900 XNA');expect(mock.terminate).toHaveBeenCalled();expect(Array.from(host.querySelectorAll('[role="status"]')).at(-1)!.textContent).toContain('Private wallet locked');
 });
 it('opens durable encrypted history without requiring a downloaded backup and keeps families separate',async()=>{
  await open();expect(mock.derive).toHaveBeenCalledWith(expect.objectContaining({family:'ecdsa',mnemonic:'TEST words'}));expect(mock.openJournal).toHaveBeenCalledWith({create:false,backup:undefined});
  expect(host.textContent).toContain('Checked through block 22,485');expect(host.textContent).toContain('900 XNA');expect(button('Prepare operation').disabled).toBe(true);expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async()=>{button('Save encrypted backup').click();await new Promise(r=>setTimeout(r,0));});expect(button('Prepare operation').disabled).toBe(true);expect(URL.createObjectURL).toHaveBeenCalled();
  act(()=>(host.querySelector('[role=tab][data-action=withdraw]') as HTMLButtonElement).click());expect(button('Prepare operation').disabled).toBe(false);
 });
 it('never silently creates missing history or substitutes another pool',async()=>{
  mock.openJournal.mockRejectedValueOnce(Error('History missing; restore backup'));await open();expect(host.textContent).toContain('History missing');expect(mock.scan).not.toHaveBeenCalled();expect(mock.terminate).toHaveBeenCalled();
 });
 it('locks and discards a delayed scan after changing the wallet',async()=>{
  const job=deferred();mock.scan.mockImplementationOnce(()=>job.promise);act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
  await act(async()=>{button('Open private wallet').click();await new Promise(r=>setTimeout(r,0));});
  act(()=>root.render(<C6XnaPrivacyPool wallet={{...wallet,network:'xna-pq-strict-test'}} mnemonic="other TEST words" runtime={runtime}/>));
  await act(async()=>{job.resolve(state);await new Promise(r=>setTimeout(r,0));});expect(host.textContent).not.toContain('900 XNA');expect(host.textContent).toContain('Open private wallet');expect(mock.terminate).toHaveBeenCalled();
 });
 it('does not export a late backup after locking',async()=>{
  await open();const job=deferred();mock.backup.mockImplementationOnce(()=>job.promise);
  await act(async()=>{button('Save encrypted backup').click();await new Promise(r=>setTimeout(r,0));});act(()=>button('Lock private wallet').click());
  await act(async()=>{job.resolve({cipher:'late'});await new Promise(r=>setTimeout(r,0));});expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
 it('refuses mainnet and offers voluntary two-note consolidation',async()=>{
  act(()=>root.render(<C6XnaPrivacyPool wallet={{network:'xna'} as any} mnemonic="TEST words" runtime={runtime}/>));expect(button('Open private wallet').disabled).toBe(true);expect(mock.derive).not.toHaveBeenCalled();
  await open();expect(host.querySelector('[role=tab][data-action=join]')?.textContent).toContain('Join notes');
 });
 it('opens the wallet before scanning and permits retry after a failed scan',async()=>{
  mock.scan.mockRejectedValueOnce(Error('RPC scan temporarily unavailable'));await open();
  expect(host.textContent).toContain('RPC scan temporarily unavailable');expect(button('Scan now').disabled).toBe(false);expect(mock.terminate).not.toHaveBeenCalled();
  await act(async()=>{button('Scan now').click();await new Promise(r=>setTimeout(r,0));});expect(host.textContent).toContain('900 XNA');
 });
 it('shows a cancellable open wallet while the first scan is pending',async()=>{
  const job=deferred();mock.scan.mockImplementationOnce(()=>job.promise);await open();
  expect(button('Lock private wallet')).toBeDefined();expect(host.querySelector('time')).not.toBeNull();expect(button('Scan now').disabled).toBe(true);
  act(()=>button('Cancel local work and lock').click());await act(async()=>{job.resolve(state);await new Promise(r=>setTimeout(r,0));});expect(host.textContent).not.toContain('900 XNA');
 });

 it('does not automatically repeat a failed scan until a manual retry succeeds',async()=>{
  jest.useFakeTimers();try{
   mock.scan.mockRejectedValueOnce(Error('RPC timeout'));
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
   await act(async()=>{button('Open private wallet').click();await Promise.resolve();});
   expect(host.textContent).toContain('RPC timeout');expect(mock.scan).toHaveBeenCalledTimes(1);
   await act(async()=>jest.advanceTimersByTime(120000));expect(mock.scan).toHaveBeenCalledTimes(1);
   await act(async()=>{button('Scan now').click();await Promise.resolve();});expect(host.textContent).toContain('900 XNA');
   await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(2);
  }finally{jest.useRealTimers();}
 });

 it('recovers read-only without history and never silently creates reservations',async()=>{
  mock.openJournal.mockRejectedValueOnce(Error('C6 private journal missing: restore the encrypted backup or explicitly create a new history'));await open();
  expect(host.textContent).toContain('Read-only recovery');expect(host.textContent).toContain('encrypted');
  expect(mock.scan).toHaveBeenCalledTimes(1);expect(mock.openJournal).toHaveBeenCalledTimes(1);expect(mock.openJournal).toHaveBeenCalledWith({create:false,backup:undefined});
  expect(button('Save encrypted backup').disabled).toBe(true);expect(mock.prepare).not.toHaveBeenCalled();
 });

 it('detects the existing confirmed 1000.1 funding coin, preserves the form and prepares only once',async()=>{
  jest.useFakeTimers();try{
   const txid='985c0e09401a51ea26f2af69c764c8ea00fe455cc2311623bc36a5d88c560f4c';
   const script='532073f9f7eae10c4c92b5c5a8f98bc08bbe095137620d83ac65bf8fe8929b8ce0ce';
   const row={txid,outputIndex:0,script,satoshis:100010000000,assetName:'XNA',address:'own'};
   wallet.getUTXOs.mockResolvedValue([row]);wallet.rpc.mockImplementation(async method=>method==='getbestblockhash'?'11'.repeat(32):method==='getblockcount'?22486:{confirmations:16,value:1000.1,scriptPubKey:{hex:script}});
   mock.prepare.mockResolvedValue({operationId:'test-op',transaction:{raw:'UNSIGNED',form:'D1',feeAtomic:'10000000',funding:{point:txid+':0',valueAtomic:'100010000000',index:2}}});
   mock.recordSigned.mockResolvedValue({operationId:'test-op',raw:'SIGNED_TEST_DEPOSIT',txid:'ab'.repeat(32),inputPoints:[]});
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
   await act(async()=>{button('Open private wallet').click();await Promise.resolve();});
   act(()=>{const input=host.querySelector('[aria-label="C6 amount"]') as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'1000');input.dispatchEvent(new Event('input',{bubbles:true}));});
   await act(async()=>jest.advanceTimersByTime(1000));
   expect(host.querySelector('[aria-label="C6 funding status"]')!.textContent).toContain('Confirmed funding ready: 1000.1 XNA');
   expect(button('Prepare funding coin').disabled).toBe(true);
   expect(host.textContent).toContain('Operation history saves encrypted in this browser automatically');
   expect(URL.createObjectURL).not.toHaveBeenCalled();
   await act(async()=>jest.advanceTimersByTime(120000));
   expect(mock.scan).toHaveBeenCalledTimes(1);expect(button('Prepare operation').disabled).toBe(false);
   expect((host.querySelector('[aria-label="C6 amount"]') as HTMLInputElement).value).toBe('1000');
   await act(async()=>{button('Prepare operation').click();await Promise.resolve();});
   expect(mock.prepare).toHaveBeenCalledWith(expect.objectContaining({action:'deposit',amountAtomic:'100000000000',fundingValue:'100010000000',fundingPoint:txid+':0'}));
   expect(mock.recordSigned).toHaveBeenCalledWith('test-op','SIGNED_TEST_DEPOSIT');
   expect(mock.scan).toHaveBeenCalledTimes(1);expect(button('Publish operation').disabled).toBe(false);
   expect(URL.createObjectURL).not.toHaveBeenCalled();
   const card=host.querySelector('[aria-label="Review private operation"]')!;expect(card.className).toContain('neurai-card');expect(card.textContent).toContain('1000 XNA');expect(card.textContent).toContain('0.1 XNA');expect(card.querySelector('code')?.textContent).toBe('ab'.repeat(32));
   expect(mock.prepare).toHaveBeenCalledTimes(1);
   // Publication scans immediately; confirmation and maturity must follow
   // automatically from a new tip, with no manual Scan now or backup export.
   await act(async()=>button('Publish operation').click());expect(mock.broadcastAttempt).toHaveBeenCalledWith('test-op');expect(mock.scan).toHaveBeenCalledTimes(2);
   let chain='22'.repeat(32);wallet.rpc.mockImplementation(async method=>method==='getbestblockhash'?chain:method==='getblockcount'?22487:{confirmations:16,value:1000.1,scriptPubKey:{hex:script}});
   mock.scan.mockResolvedValueOnce({...state,scan:{...state.scan,result:{...state.scan.result,tip:{height:22487,hash:chain},balanceAtomic:'190000000000',spendableAtomic:'90000000000'}},journal:{operations:[{id:'test-op',action:'deposit',phase:'confirmed',outcome:'confirmed',txid:'ab'.repeat(32)}]}});
   await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(3);expect(host.textContent).toContain('1900 XNA');expect(host.textContent).toContain('Available: 900 XNA');expect(host.querySelector('[aria-label="C6 amount"]')!.matches(':disabled')).toBe(false);
   chain='33'.repeat(32);mock.scan.mockResolvedValueOnce({...state,scan:{...state.scan,result:{...state.scan.result,tip:{height:22488,hash:chain},balanceAtomic:'190000000000',spendableAtomic:'190000000000'}}});
   await act(async()=>jest.advanceTimersByTime(20000));expect(host.textContent).toContain('Available: 1900 XNA');expect(URL.createObjectURL).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
 });
 it('keeps forms enabled during a pending confirmation poll and discards its reply on lock',async()=>{
  jest.useFakeTimers();try{
   const job=deferred();wallet.getUTXOs.mockImplementationOnce(()=>job.promise);
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
   await act(async()=>{button('Open private wallet').click();await Promise.resolve();});
   await act(async()=>jest.advanceTimersByTime(500));
   expect(host.querySelector('[aria-label="C6 amount"]')!.matches(':disabled')).toBe(false);
   expect(button('Scan now').disabled).toBe(false);expect(mock.scan).toHaveBeenCalledTimes(1);
   act(()=>button('Lock private wallet').click());await act(async()=>{job.resolve([]);await Promise.resolve();});
   expect(host.textContent).not.toContain('Confirmed funding ready');expect(mock.scan).toHaveBeenCalledTimes(1);
  }finally{jest.useRealTimers();}
 });

 it('shows a styled funding review with captured amount and fee, without publishing or exporting',async()=>{
  jest.useFakeTimers();try{
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));
   await act(async()=>{button('Open private wallet').click();await Promise.resolve();});await act(async()=>jest.advanceTimersByTime(1000));
   await act(async()=>{button('Prepare funding coin').click();await Promise.resolve();});
   const card=host.querySelector('[aria-label="Review funding transaction"]')!;expect(card.className).toContain('neurai-card');expect(card.textContent).toContain('100.1 XNA');expect(card.textContent).toContain('0.01 XNA');expect(card.querySelector('code')?.textContent).toBe('aa'.repeat(32));
   expect(button('Publish funding coin').disabled).toBe(false);expect(button('Prepare operation').disabled).toBe(true);expect(URL.createObjectURL).not.toHaveBeenCalled();
   const {publishTransaction}=jest.requireMock('@neuraiproject/neurai-privacy/client');expect(publishTransaction).not.toHaveBeenCalled();
   await act(async()=>button('Discard funding preview').click());expect(host.querySelector('[aria-label="Review funding transaction"]')).toBeNull();expect(mock.releaseDraft).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
 });

 it('does not report an older notification sample as a newer chain tip',async()=>{wallet.rpc.mockResolvedValue(22484);await open();expect(host.textContent).not.toContain('Chain is at block 22,484');expect(host.textContent).toContain('Checked through block 22,485');});

 it('disables a deposit immediately after amount or fee edits until an exact confirmed coin is found',async()=>{
  jest.useFakeTimers();try{
   const first='aa'.repeat(32),second='bb'.repeat(32),script='76a914'+'11'.repeat(20)+'88ac';
   wallet.getUTXOs.mockResolvedValue([{txid:first,outputIndex:0,script,satoshis:10010000000,assetName:'XNA',address:'own'},{txid:second,outputIndex:0,script,satoshis:20010000000,assetName:'XNA',address:'own'}]);
   wallet.rpc.mockImplementation(async(method,params)=>method==='getblockcount'?22485:{confirmations:2,value:params[0]===first?100.1:200.1,scriptPubKey:{hex:script}});
   const fees={...runtime,config:{...runtime.config,manifest:{...runtime.config.manifest,fees:{...runtime.config.manifest.fees,D:['10000000','20000000']}}}};
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={fees}/>));
   await act(async()=>{button('Open private wallet').click();await Promise.resolve();});expect(button('Prepare operation').disabled).toBe(true);
   await act(async()=>jest.advanceTimersByTime(500));expect(button('Prepare operation').disabled).toBe(false);
   const setAmount=(value:string)=>act(()=>{const input=host.querySelector('[aria-label="C6 amount"]') as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
   setAmount('200');expect(button('Prepare operation').disabled).toBe(true);act(()=>button('Prepare operation').click());expect(mock.prepare).not.toHaveBeenCalled();
   await act(async()=>jest.advanceTimersByTime(500));expect(button('Prepare operation').disabled).toBe(false);expect(host.querySelector('[aria-label="C6 funding status"]')!.textContent).toContain('Confirmed funding ready: 200.1 XNA');
   act(()=>{const select=host.querySelector('[aria-label="C6 fee"]') as HTMLSelectElement;select.value='20000000';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(button('Prepare operation').disabled).toBe(true);
   await act(async()=>jest.advanceTimersByTime(500));expect(button('Prepare operation').disabled).toBe(true);expect(host.querySelector('[aria-label="C6 funding status"]')!.textContent).toContain('No confirmed funding coin for 200.2 XNA');
   setAmount('');expect(button('Prepare operation').disabled).toBe(true);await act(async()=>jest.advanceTimersByTime(500));expect(button('Prepare operation').disabled).toBe(true);expect(mock.prepare).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
 });
 it('does not enable a deposit from an old confirmation response after editing its amount',async()=>{
  jest.useFakeTimers();try{
   const old=deferred(),first='aa'.repeat(32),second='bb'.repeat(32),script='76a914'+'11'.repeat(20)+'88ac';
   wallet.getUTXOs.mockImplementationOnce(()=>old.promise).mockResolvedValue([{txid:second,outputIndex:0,script,satoshis:20010000000,assetName:'XNA',address:'own'}]);
   wallet.rpc.mockImplementation(async(method,params)=>method==='getblockcount'?22485:{confirmations:2,value:params[0]===first?100.1:200.1,scriptPubKey:{hex:script}});
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private wallet').click();await Promise.resolve();});await act(async()=>jest.advanceTimersByTime(500));
   act(()=>{const input=host.querySelector('[aria-label="C6 amount"]') as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'200');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(button('Prepare operation').disabled).toBe(true);
   await act(async()=>jest.advanceTimersByTime(500));expect(button('Prepare operation').disabled).toBe(false);
   await act(async()=>{old.resolve([{txid:first,outputIndex:0,script,satoshis:10010000000,assetName:'XNA',address:'own'}]);await Promise.resolve();});
   expect(button('Prepare operation').disabled).toBe(false);expect(host.querySelector('[aria-label="C6 funding status"]')!.textContent).toContain('200.1 XNA');expect(host.querySelector('[aria-label="C6 funding status"]')!.textContent).not.toContain('100.1 XNA');expect(mock.prepare).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
 });
 it('waits for confirmation even when an exact funding output already exists',async()=>{
  jest.useFakeTimers();try{
   let confirmations=0;const script='76a914'+'11'.repeat(20)+'88ac';wallet.getUTXOs.mockResolvedValue([{txid:'aa'.repeat(32),outputIndex:0,script,satoshis:10010000000,assetName:'XNA',address:'own'}]);
   wallet.rpc.mockImplementation(async method=>method==='getblockcount'?22485:{confirmations,value:100.1,scriptPubKey:{hex:script}});
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private wallet').click();await Promise.resolve();});await act(async()=>jest.advanceTimersByTime(500));expect(button('Prepare operation').disabled).toBe(true);
   confirmations=1;await act(async()=>jest.advanceTimersByTime(20000));expect(button('Prepare operation').disabled).toBe(false);expect(mock.prepare).not.toHaveBeenCalled();
  }finally{jest.useRealTimers();}
 });

 it('automatically recovers confirmed deposits and incoming notes without blocking the form',async()=>{
  jest.useFakeTimers();try{
   let tip='11'.repeat(32);wallet.rpc.mockImplementation(async m=>m==='getbestblockhash'?tip:22485);
   act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private wallet').click();await Promise.resolve();});
   await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(1);
   const job=deferred();mock.scan.mockImplementationOnce(()=>job.promise);tip='22'.repeat(32);await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(2);
   expect(host.querySelector('[aria-label="C6 amount"]')!.matches(':disabled')).toBe(false);expect(host.querySelector('time')).toBeNull();expect(host.textContent).toContain('Updating private balance in the background');
   await act(async()=>job.resolve({...state,scan:{...state.scan,result:{...state.scan.result,tip:{height:22486,hash:tip},balanceAtomic:'100000000000',spendableAtomic:'0'}}}));
   expect(host.textContent).toContain('1000 XNA');expect(host.textContent).toContain('Available: 0 XNA');expect(host.textContent).toContain('Checked through block 22,486');
   await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(2);
   tip='33'.repeat(32);mock.scan.mockResolvedValueOnce({...state,scan:{...state.scan,result:{...state.scan.result,tip:{height:22487,hash:tip},balanceAtomic:'100000000000',spendableAtomic:'100000000000'}}});await act(async()=>jest.advanceTimersByTime(20000));expect(host.textContent).toContain('Available: 1000 XNA');
  }finally{jest.useRealTimers();}
 });
 it('queues a manual worker action behind a silent scan rather than dropping it or overlapping',async()=>{
  jest.useFakeTimers();try{
   wallet.rpc.mockResolvedValue('22'.repeat(32));act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private wallet').click();await Promise.resolve();});
   const job=deferred();mock.scan.mockImplementationOnce(()=>job.promise);await act(async()=>jest.advanceTimersByTime(20000));expect(mock.scan).toHaveBeenCalledTimes(2);
   await act(async()=>{button('Save encrypted backup').click();await Promise.resolve();});expect(mock.backup).not.toHaveBeenCalled();expect(host.textContent).toContain('Waiting for balance refresh');
   await act(async()=>job.resolve(state));expect(mock.backup).toHaveBeenCalledTimes(1);expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  }finally{jest.useRealTimers();}
 });
 it('does not expose a late background balance after locking and can immediately reopen',async()=>{
  jest.useFakeTimers();try{
   wallet.rpc.mockResolvedValue('22'.repeat(32));act(()=>root.render(<C6XnaPrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open private wallet').click();await Promise.resolve();});
   const job=deferred();mock.scan.mockImplementationOnce(()=>job.promise);await act(async()=>jest.advanceTimersByTime(20000));act(()=>button('Lock private wallet').click());
   await act(async()=>{button('Open private wallet').click();await Promise.resolve();});expect(mock.derive).toHaveBeenCalledTimes(2);
   await act(async()=>job.resolve({...state,scan:{...state.scan,result:{...state.scan.result,balanceAtomic:'999000000000'}}}));expect(host.textContent).not.toContain('9990 XNA');expect(host.textContent).toContain('900 XNA');
  }finally{jest.useRealTimers();}
 });

});
