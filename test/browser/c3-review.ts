// TEST-only entry. It is not part of the production wallet HTML or bundle.
import {Wallet} from '@neuraiproject/neurai-jswallet';
import {entropyToMnemonic} from 'bip39';
import Signer from '@neuraiproject/neurai-sign-transaction';
import {createPoolWorker} from '../../src/privacy-pool/workerFactory';
const report:any={success:false,checks:[],transactions:[],stages:[]};
(window as any).c3Report=report;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const check=(label:string,ok:boolean)=>{report.checks.push({label,passed:ok});if(!ok)throw new Error(label);};
async function rpc(method:string,params:unknown[]=[]):Promise<any>{const r=await (await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})})).json();if(r.error)throw new Error(r.error);return r.result;}
class Person {
 worker=createPoolWorker();recipient:any;backup:any;scan:any;resolve:any;reject:any;result:any;label='';
 constructor(){this.worker.onmessage=async({data})=>{
   if(data.type==='rpc'){try{this.worker.postMessage({type:'rpc-result',id:data.id,result:await rpc(data.method,data.params)});}catch(e){this.worker.postMessage({type:'rpc-result',id:data.id,error:String(e)});}return;}
   if(data.type==='stage'){document.getElementById('status')!.textContent=data.message;report.stages.push({label:this.label,stage:data.message,time:new Date().toISOString()});}
   if(data.type==='identity'){this.recipient=data.recipient;this.backup=data.backup;}
   if(data.type==='scan')this.scan=data.result;
   if(data.type==='prepared')this.result=data.result;
   if(data.type==='done')this.resolve(this.result);
   if(data.type==='error')this.reject(new Error(data.message));
  };this.worker.onerror=e=>this.reject(new Error(e.message));}
 run(type:string,data:any={}){this.result=null;this.label=data.action??type;return new Promise<any>((resolve,reject)=>{this.resolve=resolve;this.reject=reject;this.worker.postMessage({type,...data});});}
 stop(){this.worker.terminate();}
}
async function confirmed(txid:string){for(let i=0;i<120;i++){const tx=await rpc('getrawtransaction',[txid,true]);if(tx.confirmations>0)return tx;await sleep(2000);}throw new Error('TEST transaction awaiting public miners: '+txid);}
(window as any).runC3Review=async()=>{
 const people:Person[]=[];
 try {
  const entropy=crypto.getRandomValues(new Uint8Array(16));const mnemonic=entropyToMnemonic(Array.from(entropy,b=>b.toString(16).padStart(2,'0')).join(''));entropy.fill(0);
  const wallet=new Wallet();await wallet.init({network:'xna-test',mnemonic,offlineMode:true});
  const addresses=wallet.getAddresses().slice(0,9);
  const fundingTxid=await rpc('testFund',[addresses]);report.fundingTxid=fundingTxid;
  const funding=await confirmed(fundingTxid);report.fundingBlock=funding.blockhash;
  const coins=addresses.map(address=>{const out=funding.vout.find((o:any)=>o.scriptPubKey.addresses?.includes(address));return {address,txid:fundingTxid,vout:out.n,outputIndex:out.n,valueSats:String(Math.round(out.value*1e8)),satoshis:Math.round(out.value*1e8),script:out.scriptPubKey.hex,scriptHex:out.scriptPubKey.hex};});
  let alice=new Person(),bob=new Person();people.push(alice,bob);
  await alice.run('create',{password:'Browser TEST Alice password 2026'});await bob.run('create',{password:'Browser TEST Bob password 2026'});
  await alice.run('scan');check('Public pool starts with no reserve',alice.scan.reserveAtomic==='0');
  let feeIndex=2;
  async function operate(who:Person,action:string,extra:any){
   const sponsor=coins[feeIndex++];const start=performance.now();const p=await who.run('prepare',{action,sponsor,feeAtomic:'10000000',...extra});
   const own=[...(extra.funding?[extra.funding]:[]),sponsor];const keys=Object.fromEntries(own.map(c=>[c.address,wallet.getPrivateKeyByAddress(c.address)]));
   const raw=Signer.sign('xna-test',p.raw,own as any,keys);for(const k of Object.keys(keys))delete keys[k];
   const accepted=await rpc('testmempoolaccept',[[raw]]);check(p.form+' browser-generated proof, witness and signatures admitted',accepted[0].allowed);
   const decoded=await rpc('decoderawtransaction',[raw]);const before=await rpc('decoderawtransaction',[p.raw]);
   check(p.form+' partial signer preserves state and reserve witnesses',JSON.stringify(decoded.vin.map((x:any)=>x.txinwitness))===JSON.stringify(before.vin.map((x:any)=>x.txinwitness)));
   const txid=await rpc('sendrawtransaction',[raw]);report.transactions.push({form:p.form,txid,prepareMs:performance.now()-start});
   await confirmed(txid);await who.run('scan');return p;
  }
  await operate(alice,'deposit',{funding:coins[0],amountAtomic:'1000000000'});
  await operate(bob,'deposit',{funding:coins[1],amountAtomic:'200000000'});
  await alice.run('scan');const a10=alice.scan.notes.find((n:any)=>n.amountAtomic==='1000000000');
  await operate(alice,'transfer',{note:a10.cm,amountAtomic:'400000000',recipient:JSON.stringify(bob.recipient)});
  const saved=bob.backup;bob.stop();bob=new Person();people.push(bob);await bob.run('restore',{backup:saved,password:'Browser TEST Bob password 2026'});await bob.run('scan');
  check('Second worker recovers Bob notes from encrypted backup and public chain',bob.scan.balanceAtomic==='600000000'&&bob.scan.notes.length===2);
  const b4=bob.scan.notes.find((n:any)=>n.amountAtomic==='400000000');
  await operate(bob,'transfer',{note:b4.cm,amountAtomic:'400000000',recipient:JSON.stringify(alice.recipient)});
  const b2=bob.scan.notes.find((n:any)=>n.amountAtomic==='200000000');
  await operate(bob,'withdraw',{note:b2.cm,payout:coins[1].scriptHex});
  await alice.run('scan');const a6=alice.scan.notes.find((n:any)=>n.amountAtomic==='600000000');
  await operate(alice,'withdraw',{note:a6.cm,payout:coins[0].scriptHex});
  const a4=alice.scan.notes.find((n:any)=>n.amountAtomic==='400000000');await operate(alice,'withdraw',{note:a4.cm,payout:coins[0].scriptHex});
  await bob.run('scan');check('Both private balances and shared reserve return to zero',alice.scan.balanceAtomic==='0'&&bob.scan.balanceAtomic==='0'&&alice.scan.reserveAtomic==='0');
  check('All six C3 forms confirmed',new Set(report.transactions.map((x:any)=>x.form)).size===6);report.success=true;
 }catch(e){report.error=e instanceof Error?e.stack:String(e);throw e;}
 finally{people.forEach(p=>p.stop());}
 return report;
};
