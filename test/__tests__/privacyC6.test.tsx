/** @jest-environment jsdom */
jest.mock('@neuraiproject/neurai-sign-transaction',()=>({__esModule:true,default:{sign:jest.fn()}}));
// This suite explicitly tests an unconfigured deployment; the public pins have their own suite.
jest.mock('../../src/privacy-pool/c6Deployment',()=>({C6_XNA_TESTNET_RUNTIME:null,C6_XNA_UNAVAILABLE_REASON:'No application-pinned C6 deployment'}));
jest.mock('../../src/privacy-benchmark/workerFactory',()=>({createPrivacyBenchmarkWorker:jest.fn(),createGroth16BenchmarkWorker:jest.fn()}));
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {PrivacyPool} from '../../src/PrivacyPool';
import {C6PrivacyPool} from '../../src/privacy-pool/C6PrivacyPool';
const mockMethods={initialize:jest.fn(),scan:jest.fn(),snapshot:jest.fn(),tick:jest.fn(),authorize:jest.fn(),publish:jest.fn(),sweep:jest.fn(),pending:jest.fn(async()=>[]),backup:jest.fn()};
jest.mock('@neuraiproject/neurai-privacy/client',()=>{
 const actual=jest.requireActual('@neuraiproject/neurai-privacy/client');return {...actual,C6SponsorFlow:jest.fn(()=>mockMethods),IndexedDbSponsorStore:jest.fn(()=>({close:jest.fn()}))};
});
jest.mock('@neuraiproject/neurai-privacy/browser',()=>({c6SponsorWalletId:jest.fn(async()=>'aa'.repeat(32)),sealVault:jest.fn(),openVault:jest.fn()}));
jest.mock('../../src/privacy-pool/workerFactory',()=>({createPoolWorker:jest.fn(),createC5PoolWorker:jest.fn()}));
const snapshot={revision:1,genesis:'01'.repeat(32),walletId:'aa'.repeat(32),budgetAtomic:'30000000',authorizedAtomic:'10000000',tip:{height:123,hash:'ab'.repeat(32)},operations:[{operationId:'02'.repeat(32),budgetAtomic:'20000000',authorizedAtomic:'10000000',privateOperation:'pending',operationTxid:null,reservationClosed:false,privateExposed:true,notes:[{cm:'03'.repeat(32),nf:'04'.repeat(32)}],exposedOutpoints:['05'.repeat(32)+':0'],sponsors:[{offer:{outpoint:'05'.repeat(32)+':0'},spentBy:null,sweepTxid:null,status:'exposed'}]}]};
const runtime:any={deployments:[{genesis:'01'.repeat(32)}],budgetAtomic:'30000000',actions:['Join two notes'],prepare:jest.fn(async()=>({raw:'public-prepared-proof'}))};
const wallet:any={network:'xna-ecdsa-test',getAddresses:()=>['address'],rpc:jest.fn()};
describe('C6 TEST sponsor lifecycle UI',()=>{
 let host:HTMLDivElement,root:Root;
 const button=(name:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===name)!;
 beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);jest.clearAllMocks();mockMethods.initialize.mockResolvedValue(snapshot);mockMethods.scan.mockResolvedValue(snapshot);mockMethods.snapshot.mockResolvedValue(snapshot);mockMethods.tick.mockResolvedValue({snapshot,sweeps:[]});mockMethods.authorize.mockResolvedValue({operationId:'02'.repeat(32),txid:'09'.repeat(32)});});
 afterEach(()=>{act(()=>root.unmount());host.remove();});
 async function open(){act(()=>root.render(<C6PrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime}/>));await act(async()=>{button('Open C6 journal').click();await new Promise(r=>setTimeout(r,0));});expect(host.querySelector('[role=alert]')?.textContent??'').toBe('');}
 it('does not disguise C4/C5 as C6 or activate an unconfigured public deployment',async()=>{
  act(()=>root.render(<PrivacyPool wallet={wallet}/>));const selector=host.querySelector('select#privacy-pool-version')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(selector,'C6');selector.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(host.textContent).toContain('No application-pinned C6 deployment');expect(mockMethods.initialize).not.toHaveBeenCalled();
 });
 it('opens existing history without creating it; scans automatically and preserves reservations',async()=>{
  await open();expect(mockMethods.initialize).toHaveBeenCalledWith({create:false});expect(mockMethods.scan).toHaveBeenCalled();expect(host.textContent).toContain('Notes reserved');expect(host.textContent).toContain('0.1 / 0.3 XNA');
  await act(async()=>{button('Scan now').click();await new Promise(r=>setTimeout(r,0));});expect(mockMethods.tick).toHaveBeenCalledWith(expect.objectContaining({autoSweep:false}));
 });
 it('persists sponsorship before review and publishes only after the explicit button',async()=>{
  await open();await act(async()=>{button('Join two notes').click();await new Promise(r=>setTimeout(r,0));});expect(runtime.prepare).toHaveBeenCalledWith('Join two notes');expect(mockMethods.authorize).toHaveBeenCalledWith({raw:'public-prepared-proof'});expect(mockMethods.publish).not.toHaveBeenCalled();
  await act(async()=>{button('Publish C6 TEST transaction').click();await new Promise(r=>setTimeout(r,0));});expect(mockMethods.publish).toHaveBeenCalledWith('02'.repeat(32));
 });
 it('keeps a prepared sponsor blocked until the private backup gate is satisfied',async()=>{
  await open();act(()=>root.render(<C6PrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime} publishBlocked/>));
  await act(async()=>{button('Join two notes').click();await new Promise(r=>setTimeout(r,0));});
  expect(button('Publish C6 TEST transaction').disabled).toBe(true);expect(host.textContent).toContain('Save the updated private and sponsor backups');
  act(()=>root.render(<C6PrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime} publishBlocked={false}/>));
  expect(button('Publish C6 TEST transaction').disabled).toBe(false);
  act(()=>root.render(<C6PrivacyPool wallet={wallet} mnemonic="TEST words" runtime={runtime} requireBackupBeforePublish/>));
  expect(button('Publish C6 TEST transaction').disabled).toBe(true);expect(mockMethods.publish).not.toHaveBeenCalled();
 });
 it('requires explicit opt-in for automated ALL sweeps and stops on an RPC failure',async()=>{
  await open();const check=host.querySelector('input[type=checkbox]') as HTMLInputElement;
  act(()=>check.click());mockMethods.tick.mockRejectedValueOnce(Error('Incomplete active-chain scan'));
  await act(async()=>{button('Scan now').click();await new Promise(r=>setTimeout(r,0));});expect(check.checked).toBe(false);expect(host.textContent).toContain('reservations retained');expect(mockMethods.tick).toHaveBeenCalledWith(expect.objectContaining({autoSweep:true}));
 });
 it('offers explicit recovery for a pending sponsor without pretending it cancels the proof',async()=>{
  await open();await act(async()=>{button('Sweep this exposed sponsor').click();await new Promise(r=>setTimeout(r,0));});expect(mockMethods.sweep).toHaveBeenCalledWith('05'.repeat(32)+':0');expect(host.textContent).toContain('Notes reserved');
 });
 it('refuses mainnet and closes the session on wallet changes',async()=>{
  await open();const text=renderToStaticMarkup(<C6PrivacyPool wallet={{network:'xna'} as any} mnemonic="words" runtime={runtime}/>);expect(text).toContain('supported testnet wallet');
  act(()=>root.render(<C6PrivacyPool wallet={{...wallet,network:'xna-pq-strict-test'}} mnemonic="TEST words" runtime={runtime}/>));expect(host.textContent).toContain('Open C6 journal');expect(host.textContent).not.toContain('Notes reserved');
 });
// Insert inside privacyC6.test.tsx's existing describe block in a test snapshot.
// All deferred results are explicit TEST fixtures. No real secrets or RPC writes.
function deferred<T>() {
 let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
}

it('discards a proof that finishes after switching the transparent wallet',async()=>{
 await open();
 const proving=deferred<any>();
 runtime.prepare.mockImplementationOnce(()=>proving.promise);
 await act(async()=>{button('Join two notes').click();await new Promise(r=>setTimeout(r,0));});
 expect(runtime.prepare).toHaveBeenCalledWith('Join two notes');
 act(()=>root.render(<C6PrivacyPool wallet={{...wallet,network:'xna-pq-strict-test'}} mnemonic="TEST words" runtime={runtime}/>));
 await act(async()=>{proving.resolve({raw:'late-proof-from-previous-wallet'});await new Promise(r=>setTimeout(r,0));});
 expect(mockMethods.authorize).not.toHaveBeenCalled();
 expect(mockMethods.publish).not.toHaveBeenCalled();
 expect(host.textContent).not.toContain('Proof verified and sponsor exposure persisted.');
 expect(host.textContent).toContain('Open C6 journal');
});

it('does not sign when the owner key arrives after switching wallets',async()=>{
 const key=deferred<any>();
 const owner:any={...wallet,rpc:jest.fn(async()=>({vout:[{scriptPubKey:{addresses:['address']}}]})),getPrivateKeyByAddress:jest.fn(()=>key.promise)};
 act(()=>root.render(<C6PrivacyPool wallet={owner} mnemonic="TEST words" runtime={runtime}/>));
 await act(async()=>{button('Open C6 journal').click();await new Promise(r=>setTimeout(r,0));});
 const options=jest.requireMock('@neuraiproject/neurai-privacy/client').C6SponsorFlow.mock.calls.at(-1)[0];
 const signing=options.sign({raw:'public-TEST-transaction',offer:{outpoint:'05'.repeat(32)+':0',inputScript:'76a914'+'ab'.repeat(20)+'88ac',inputAtomic:'100000000'},hashType:1,index:0})
  .then(()=>({error:null}),(error:Error)=>({error:error.message}));
 await act(async()=>{await new Promise(r=>setTimeout(r,0));});
 expect(owner.getPrivateKeyByAddress).toHaveBeenCalledWith('address');
 act(()=>root.render(<C6PrivacyPool wallet={{...owner,network:'xna-pq-strict-test'}} mnemonic="TEST words" runtime={runtime}/>));
 key.resolve({WIF:'never-used-TEST-key'});
 expect((await signing).error).toMatch(/locked before signing/);
 expect(jest.requireMock('@neuraiproject/neurai-sign-transaction').default.sign).not.toHaveBeenCalled();
});

it('refuses another wallet owner before requesting any private key',async()=>{
 const owner:any={...wallet,rpc:jest.fn(async()=>({vout:[{scriptPubKey:{addresses:['another-wallet-address']}}]})),getPrivateKeyByAddress:jest.fn()};
 act(()=>root.render(<C6PrivacyPool wallet={owner} mnemonic="TEST words" runtime={runtime}/>));
 await act(async()=>{button('Open C6 journal').click();await new Promise(r=>setTimeout(r,0));});
 const options=jest.requireMock('@neuraiproject/neurai-privacy/client').C6SponsorFlow.mock.calls.at(-1)[0];
 await expect(options.sign({raw:'TEST',offer:{outpoint:'05'.repeat(32)+':0'},hashType:1,index:0})).rejects.toThrow(/owns this exposed sponsor/);
 expect(owner.getPrivateKeyByAddress).not.toHaveBeenCalled();
 expect(jest.requireMock('@neuraiproject/neurai-sign-transaction').default.sign).not.toHaveBeenCalled();
});

it('does not download an encrypted backup completed after switching wallets',async()=>{
 await open();
 const encrypted=deferred<string>();
 mockMethods.backup.mockResolvedValue({schema:'TEST-backup'});
 jest.requireMock('@neuraiproject/neurai-privacy/browser').sealVault.mockImplementationOnce(()=>encrypted.promise);
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 const create=jest.fn(()=>'blob:test-backup'),revoke=jest.fn();
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
 const download=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try {
  const input=host.querySelector('input[type=password]')!;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'TEST-backup-password');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(button('Save encrypted sponsor backup').disabled).toBe(false);
  await act(async()=>{button('Save encrypted sponsor backup').click();await new Promise(r=>setTimeout(r,0));});
  expect(jest.requireMock('@neuraiproject/neurai-privacy/browser').sealVault).toHaveBeenCalled();
  act(()=>root.render(<C6PrivacyPool wallet={{...wallet,network:'xna-pq-strict-test'}} mnemonic="TEST words" runtime={runtime}/>));
  await act(async()=>{encrypted.resolve('encrypted-TEST-backup');await new Promise(r=>setTimeout(r,0));});
  expect(create).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
 } finally {
  download.mockRestore();
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:oldCreate});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:oldRevoke});
 }
});

// Insert in privacyC6.test.tsx's existing describe block.
it.each([
 ['wallet change','reading'],['wallet change','encrypting'],
 ['wallet lock','reading'],['wallet lock','encrypting'],
 ['unmount','reading'],['unmount','encrypting'],
 ['passphrase change','reading'],['passphrase change','encrypting'],
 ['runtime change','reading'],['runtime change','encrypting'],
])('discards the backup after %s while %s',async(change,stage)=>{
 await open();
 const reading=deferred<any>(),encrypted=deferred<string>();
 mockMethods.backup.mockReset();
 mockMethods.backup.mockImplementationOnce(()=>stage==='reading'?reading.promise:Promise.resolve({schema:'TEST-backup'}));
 const vault=jest.requireMock('@neuraiproject/neurai-privacy/browser').sealVault;
 vault.mockReset();vault.mockImplementationOnce(()=>encrypted.promise);
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 const create=jest.fn(()=>'blob:TEST-session-backup'),revoke=jest.fn();
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
 const download=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 let mounted=true;
 try {
  const input=host.querySelector('input[type=password]')!;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'TEST-backup-password');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(button('Save encrypted sponsor backup').disabled).toBe(false);
  await act(async()=>{button('Save encrypted sponsor backup').click();await new Promise(r=>setTimeout(r,0));});
  expect(mockMethods.backup).toHaveBeenCalledTimes(1);
  if(stage==='encrypting')expect(vault).toHaveBeenCalledTimes(1);else expect(vault).not.toHaveBeenCalled();
  if(change==='unmount'){act(()=>root.unmount());mounted=false;}
  else act(()=>root.render(<C6PrivacyPool
   wallet={change==='wallet lock'?undefined:change==='wallet change'?{...wallet,network:'xna-pq-strict-test'}:wallet}
   mnemonic="TEST words"
   passphrase={change==='passphrase change'?'changed-TEST-passphrase':undefined}
   runtime={change==='runtime change'?{...runtime}:runtime}/>));
  await act(async()=>{
   if(stage==='reading')reading.resolve({schema:'old-session-TEST-backup'});
   else encrypted.resolve('encrypted-old-session-TEST-backup');
   await new Promise(r=>setTimeout(r,0));
  });
  expect(create).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
  if(stage==='reading')expect(vault).not.toHaveBeenCalled();
 }finally{
  download.mockRestore();
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:oldCreate});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:oldRevoke});
  // Keep the shared afterEach teardown valid after the unmount variant.
  if(!mounted)root=createRoot(host);
 }
});

it('downloads exactly one encrypted backup when the active session is unchanged',async()=>{
 await open();
 const payload={schema:'TEST-backup',journal:'TEST-journal'};
 mockMethods.backup.mockResolvedValueOnce(payload);
 const vault=jest.requireMock('@neuraiproject/neurai-privacy/browser').sealVault;
 vault.mockReset();vault.mockResolvedValueOnce('encrypted-TEST-backup');
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 const create=jest.fn(()=>'blob:TEST-valid-backup'),revoke=jest.fn();
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
 const download=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try {
  const input=host.querySelector('input[type=password]')!;
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'TEST-backup-password');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>{button('Save encrypted sponsor backup').click();await new Promise(r=>setTimeout(r,0));});
  expect(vault).toHaveBeenCalledWith(payload,'TEST-backup-password');
  expect(create).toHaveBeenCalledTimes(1);expect(download).toHaveBeenCalledTimes(1);
  const anchor=download.mock.instances[0];
  expect(anchor.download).toBe('neurai-c6-sponsors.encrypted.json');
  expect(anchor.href).toBe('blob:TEST-valid-backup');
  expect(host.querySelector('[role=alert]')).toBeNull();
  // Let the actual URL-cleanup timer run; no fake clock hides the side effect.
  await new Promise(r=>setTimeout(r,1100));
  expect(revoke).toHaveBeenCalledWith('blob:TEST-valid-backup');
 }finally{
  download.mockRestore();
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:oldCreate});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:oldRevoke});
 }
});

});
