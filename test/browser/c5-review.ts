// Real browser integration. All private keys, notes and proofs originate here.
// Only public addresses, RPC reads and signed transactions leave this browser.
import Key,{entropyToMnemonic} from '@neuraiproject/neurai-key';
import Signer from '@neuraiproject/neurai-sign-transaction';
import {PoolWorkerClient} from '@neuraiproject/neurai-privacy/client';
import {createC5ReviewWorker} from './c5-worker-factory';
const report:any={success:false,checks:[],transactions:[],stages:[],cancellations:[]};
(window as any).c5Report=report;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function check(label:string,ok:boolean,detail?:unknown){report.checks.push({label,passed:!!ok,detail});if(!ok)throw new Error(label);}
export async function rpc(method:string,params:unknown[]=[]):Promise<any>{const r=await(await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})})).json();if(r.error)throw new Error(r.error);return r.result;}
class Person {
 client:PoolWorkerClient; recipient:any; backup:any; scan:any;label='';hook:(s:string)=>void=()=>{};
 constructor(corrupt=false){this.client=new PoolWorkerClient({worker:createC5ReviewWorker(corrupt),rpc,onStage:stage=>{
   document.getElementById('status')!.textContent=stage;report.stages.push({label:this.label,stage,at:performance.now()});this.hook(stage);
 }});}
 async create(){const x=await this.client.create({password:'C5 browser TEST backup password'});this.recipient=x.recipient;this.backup=x.backup;}
 async restore(backup:string){const x=await this.client.restore({backup,password:'C5 browser TEST backup password'});this.recipient=x.recipient;this.backup=x.backup;}
 async refresh(){this.scan=(await this.client.scan()).result;return this.scan;}
 stop(){this.client.terminate();}
}
(window as any).runC5Review=async()=>{
 const people:Person[]=[];
 try {
  const entropy=crypto.getRandomValues(new Uint8Array(16));const words=entropyToMnemonic(Array.from(entropy,b=>b.toString(16).padStart(2,'0')).join(''));entropy.fill(0);
  const material:any[]=[];
  const family=['legacy','pq','ecdsa'];
  for(let i=0;i<33;i++){
    const type=family[i%3];const key=type==='pq'?Key.getPQAddress('xna-pq-test',words,0,i):Key.getAddressPair(type==='legacy'?'xna-legacy-test':'xna-test',words,0,i).external;
    material.push({type,key});
  }
  const amounts=['90000000000','10000000000','20000000000',...Array(30).fill('200000000')];
  const funded=await rpc('testFund',[material.map((x,i)=>({address:x.key.address,atomic:amounts[i]}))]);
  const coins=material.map((x,i)=>{const o=funded.vout.find((v:any)=>v.scriptPubKey.addresses?.includes(x.key.address));if(!o)throw new Error('Funding missing');return {address:x.key.address,txid:funded.txid,vout:o.n,outputIndex:o.n,valueSats:amounts[i],satoshis:amounts[i],value:amounts[i],assetName:'XNA',script:o.scriptPubKey.hex,scriptHex:o.scriptPubKey.hex,type:x.type,key:x.key};});
  const alice=new Person(),bob=new Person(),carol=new Person(),dave=new Person();people.push(alice,bob,carol,dave);
  for(const p of people)await p.create();
  let sponsorIndex=3;
  const usedFamilies=new Set<string>(),withdrawals=new Set<string>();
  async function operate(who:Person,action:string,extra:any){
    const sponsor=coins[sponsorIndex++];who.label=action;const started=performance.now();
    // Secret key fields are not sent into the private-pool worker.
    const publicCoin=(c:any)=>{const {key,...rest}=c;return rest;};
    const funding=extra.funding;const request={...extra,...(funding?{funding:publicCoin(funding)}:{}),action,sponsor:publicCoin(sponsor),feeAtomic:'10000000'};
    const p=await who.client.prepare(request);const proveMs=performance.now()-started;
    const own=[...(funding?[funding]:[]),sponsor];
    const keys=Object.fromEntries(own.map(c=>[c.address,c.type==='pq'?{seedKey:c.key.seedKey}:c.key.WIF]));
    const signAt=performance.now();const raw=Signer.sign('xna-test',p.raw,own,keys);const signMs=performance.now()-signAt;
    Object.keys(keys).forEach(k=>delete keys[k]);
    const decoded=await rpc('decoderawtransaction',[raw]),before=await rpc('decoderawtransaction',[p.raw]);
    const contractInputs=p.form==='D0'?1:2;
    check(p.form+' signer preserves every contract witness',decoded.vin.slice(0,contractInputs).every((v:any,i:number)=>JSON.stringify(v.txinwitness)===JSON.stringify(before.vin[i].txinwitness)));
    const admission=await rpc('testmempoolaccept',[[raw]]);
    check(p.form+' browser proof and local signatures admitted',admission[0].allowed,admission[0]['reject-reason']);
    const txid=await rpc('sendrawtransaction',[raw]);const tx=await rpc('getrawtransaction',[txid,true]);
    check(p.form+' confirmed in isolated node',tx.confirmations>0);
    own.forEach(c=>usedFamilies.add(c.type));
    if(action==='withdraw')withdrawals.add(extra.family);
    report.transactions.push({form:p.form,txid,proveMs,signMs,sponsor:sponsor.type,funding:funding?.type,withdrawal:extra.family});
    await who.refresh();return p;
  }
  // Integrity and cancellation are tested before any deposit changes the pool.
  const bad=new Person(true);people.push(bad);await bad.restore(alice.backup);
  let error='';try{await bad.client.prepare({action:'deposit',funding:coins[0],sponsor:coins[3],amountAtomic:amounts[0],feeAtomic:'10000000'});}catch(e){error=String(e);}
  check('corrupted downloaded WASM rejected',/integrity/.test(error),error);bad.stop();
  for(const phase of ['Loading final.zkey','Generating D0 proof']){
    const cancelled=new Person();people.push(cancelled);await cancelled.restore(alice.backup);
    let hit=false;let at=0;cancelled.hook=stage=>{if(!hit&&stage.startsWith(phase)){hit=true;at=performance.now();setTimeout(()=>cancelled.stop(),phase.startsWith('Generating')?500:10);}};
    let stopped='';try{await cancelled.client.prepare({action:'deposit',funding:coins[0],sponsor:coins[3],amountAtomic:amounts[0],feeAtomic:'10000000'});}catch(e){stopped=String(e);}
    check('cancellation interrupts '+phase,hit&&/stopped|terminated/i.test(stopped),stopped);
    report.cancellations.push({phase,elapsedMs:performance.now()-at});
    check('cancelled worker cannot be reused',cancelled.client.stopped);
    await alice.refresh();check('cancellation leaves pool empty',alice.scan.reserveAtomic==='0');
  }
  await operate(alice,'deposit',{funding:coins[0],amountAtomic:amounts[0]});
  await operate(bob,'deposit',{funding:coins[1],amountAtomic:amounts[1]});
  await operate(alice,'deposit',{funding:coins[2],amountAtomic:amounts[2]});
  await alice.refresh();
  await operate(alice,'transfer',{note:alice.scan.notes.find((n:any)=>n.amountAtomic===amounts[0]).cm,amountAtomic:amounts[0],recipients:[
    {recipient:JSON.stringify(bob.recipient),amountAtomic:'40000000000'},
    {recipient:JSON.stringify(carol.recipient),amountAtomic:'30000000000'},
    {recipient:JSON.stringify(dave.recipient),amountAtomic:'20000000000'}]});
  await bob.refresh();
  await operate(bob,'transfer',{note:bob.scan.notes.find((n:any)=>n.amountAtomic==='40000000000').cm,amountAtomic:'40000000000',recipients:
    [alice,carol,dave,bob].map(p=>({recipient:JSON.stringify(p.recipient),amountAtomic:'10000000000'}))});
  await bob.refresh();
  await operate(bob,'transfer',{note:bob.scan.notes[0].cm,amountAtomic:'4000000000',recipient:JSON.stringify(alice.recipient)});
  await alice.refresh();
  await operate(alice,'transfer',{note:alice.scan.notes.find((n:any)=>n.amountAtomic==='20000000000').cm,amountAtomic:'20000000000',recipient:JSON.stringify(bob.recipient)});
  const recovered=new Person();people.push(recovered);await recovered.restore(bob.backup);await recovered.refresh();await bob.refresh();
  check('new wallet restores Bob full spendable balance',recovered.scan.balanceAtomic===bob.scan.balanceAtomic&&JSON.stringify(recovered.scan.notes)===JSON.stringify(bob.scan.notes));bob.stop();
  let wi=0;
  for(const who of [alice,recovered,carol,dave]){
    await who.refresh();
    while(who.scan.notes.length){const dest=coins[wi++%3];await operate(who,'withdraw',{note:who.scan.notes[0].cm,amountAtomic:'0',payout:dest.scriptHex,family:dest.type});}
  }
  await alice.refresh();check('pool returns to zero reserve',alice.scan.reserveAtomic==='0');
  check('all eight forms proved and confirmed',new Set(report.transactions.map((t:any)=>t.form)).size===8);
  check('all three transparent funding families signed locally',usedFamilies.size===3);
  check('all three withdrawal families confirmed',withdrawals.size===3);
  check('RPC never signs browser pool transactions',!(await(await fetch('/stats')).json()).methods.signrawtransaction);
  report.success=true;
 }catch(e){report.error=e instanceof Error?e.stack:String(e);throw e;}
 finally{people.forEach(p=>p.stop());}
 return report;
};
