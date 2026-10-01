// Real public TEST smoke using the application's default C4 worker and pins.
// Only disposable browser-generated keys. No automatic wallet seed export.
import Key,{entropyToMnemonic} from '@neuraiproject/neurai-key';
import Signer from '@neuraiproject/neurai-sign-transaction';
import {PoolWorkerClient} from '@neuraiproject/neurai-privacy/client';
import {createPoolWorker} from '../../src/privacy-pool/workerFactory';
import {C4_TESTNET_DEPLOYMENT as config} from '../../src/privacy-pool/deployment';
const report:any={success:false,checks:[],transactions:[],stages:[],instance:config.manifest.address};
(window as any).c4Report=report;
const rpc=async(method:string,params:unknown[]=[])=>{const x=await(await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})})).json();if(x.error)throw new Error(x.error);return x.result;};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function check(label:string,ok:boolean){report.checks.push({label,passed:!!ok});if(!ok)throw new Error(label);}
async function confirmed(txid:string){
 for(let i=0;i<180;i++){try{const tx=await rpc('getrawtransaction',[txid,true]);if(tx.confirmations>0)return tx;}catch{/* Await P2P propagation. */}await pause(5000);}
 throw new Error('Public confirmation timeout: '+txid);
}
(window as any).runC4Review=async()=>{
 const client=new PoolWorkerClient({worker:createPoolWorker(),rpc,onStage:stage=>{report.stages.push(stage);document.getElementById('status')!.textContent=stage;}});
 try{
  check('real reset testnet',await rpc('getblockhash',[0])===config.genesis);
  const words=entropyToMnemonic(Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''));
  const keys:any[]=[Key.getPQAddress('xna-pq-test',words,0,0),Key.getAddressPair('xna-test',words,0,1).external,Key.getAddressPair('xna-legacy-test',words,0,2).external];
  const amounts=['100000000','200000000','200000000'];
  const funded=await confirmed(await rpc('testFund',[keys.map((key,i)=>({address:key.address,atomic:amounts[i]}))]));
  const coins=keys.map((key,i)=>{const o=funded.vout.find((v:any)=>v.scriptPubKey.addresses?.includes(key.address));return {address:key.address,txid:funded.txid,vout:o.n,outputIndex:o.n,valueSats:amounts[i],satoshis:amounts[i],value:amounts[i],assetName:'XNA',script:o.scriptPubKey.hex,scriptHex:o.scriptPubKey.hex};});
  await client.create({password:'Disposable C4 public TEST password'});
  let scan=(await client.scan()).result;
  check('default public C4 instance recovered',scan.reserveAtomic==='0');
  for(const action of ['deposit','withdraw']){
   const index=action==='deposit'?1:2;const own=action==='deposit'?[coins[0],coins[index]]:[coins[index]];
   const secret=Object.fromEntries(own.map(c=>{const i=coins.indexOf(c);return [c.address,i===0?{seedKey:keys[i].seedKey}:keys[i].WIF];}));
   const start=performance.now();const p=await client.prepare({action,sponsor:coins[index],feeAtomic:'10000000',...(action==='deposit'?{funding:coins[0],amountAtomic:amounts[0]}:{note:scan.notes[0].cm,amountAtomic:'0',payout:coins[2].scriptHex})} as any);
   const raw=Signer.sign('xna-test',p.raw,own,secret);Object.keys(secret).forEach(k=>delete secret[k]);
   const admitted=(await rpc('testmempoolaccept',[[raw]]))[0];check(p.form+' accepted by public RPC',!!admitted.allowed);
   const txid=await rpc('sendrawtransaction',[raw]);report.transactions.push({form:p.form,txid,prepareMs:performance.now()-start});
   const tx=await confirmed(txid);check(p.form+' publicly confirmed',tx.confirmations>0);
   scan=(await client.scan()).result;
   check(p.form+' confirmed wallet balance',scan.balanceAtomic===(action==='deposit'?'100000000':'0'));
  }
  check('pool emptied after smoke',scan.reserveAtomic==='0');report.success=true;
 }catch(e){report.error=e instanceof Error?e.stack:String(e);throw e;}finally{client.terminate();}
 return report;
};
