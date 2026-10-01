// Isolated regtest UI harness. Public TEST words only; never production funding.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Key from '@neuraiproject/neurai-key';
import {PrivacyPool,type PrivacyPoolDeployment} from '../../src/PrivacyPool';
import {createC4ReviewWorker} from './c4-worker-factory';
import config from './generated/c4-deployment.json';
import '../../src/styles/tailwind.css';
import '../../src/styles/primitives.css';
import '../../src/App.css';
const WORDS='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const rpc=async(method:string,params:unknown[]=[])=>{
 const body=await(await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})})).json();if(body.error)throw new Error(body.error);return body.result;
};
const deployment:PrivacyPoolDeployment={manifest:config.manifest as any,createWorker:createC4ReviewWorker,explorerBaseUrl:null};
async function start(){
 const people=await Promise.all(['Alice','Bob','Charlie'].map(async(name,account)=>{
  const network=['xna-ecdsa-test','xna-pq-strict-test','xna-test'][account];
  const keys=Array.from({length:7},(_,i)=>account===1?Key.getPQAddress('xna-pq-test',WORDS,account,i):Key.getAddressPair(account===0?'xna-test':'xna-legacy-test',WORDS,account,i).external);
  const funded=await rpc('testFund',[keys.map((key,i)=>({address:key.address,atomic:i===0&&account===0?'1000000000':'200000000'}))]);
  const coins=keys.map((key,i)=>{const v=funded.vout.find((x:any)=>x.scriptPubKey.addresses?.includes(key.address));return {address:key.address,assetName:'XNA',txid:funded.txid,outputIndex:v.n,satoshis:i===0&&account===0?'1000000000':'200000000',value:i===0&&account===0?'1000000000':'200000000',script:v.scriptPubKey.hex};});
  const wallet:any={network,baseCurrency:'XNA',rpc,getAddresses:()=>keys.map(k=>k.address),getUTXOs:async()=>coins,
    getPrivateKeyByAddress:(address:string)=>{const key:any=keys.find(k=>k.address===address);return account===1?{seedKey:key.seedKey}:key.WIF;}};
  return {name,passphrase:'C4 UI family separation',wallet};
 }));
 (window as any).c4UiTargets=people.map(p=>p.wallet.getAddresses()[0]);
 function App(){const [selected,setSelected]=React.useState(0);const person=people[selected];return <>
  <label htmlFor="review-wallet">TEST wallet</label><select id="review-wallet" value={selected} onChange={e=>setSelected(Number(e.target.value))}><option value={0}>Alice ECDSA</option><option value={1}>Bob PQ</option><option value={2}>Charlie Legacy</option></select>
  <PrivacyPool key={selected} wallet={person.wallet} mnemonic={WORDS} passphrase={person.passphrase} deployment={deployment}/>
 </>;}
 createRoot(document.getElementById('app')!).render(<App/>);
}
start().catch(e=>{document.getElementById('app')!.textContent=String(e);(window as any).c4UiError=String(e);});
