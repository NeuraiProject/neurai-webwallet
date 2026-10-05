// Isolated browser TEST harness. No secrets or deployment data are embedded.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {C6PrivacyPool} from '../../src/privacy-pool/C6PrivacyPool';
import {IndexedDbSponsorStore} from '@neuraiproject/neurai-privacy/client';
import {c6SponsorWalletId} from '@neuraiproject/neurai-privacy/browser';
const words='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
async function start(){
 const config=await(await fetch('/config')).json();
 const rpc=async(method:string,params:any[]=[])=>{const reply=await(await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})})).json();if(reply.error)throw Object.assign(Error(reply.error.message),{code:reply.error.code});return reply.result;};
 const wallet:any={network:config.network,rpc,getAddresses:()=>[config.address],getPrivateKeyByAddress:()=>config.key};
 const runtime={deployments:[config.deployment],budgetAtomic:'30000000',actions:['Join two notes'],prepare:async()=>config.prepared};
 createRoot(document.getElementById('app')!).render(<C6PrivacyPool wallet={wallet} mnemonic={words} runtime={runtime}/>);
 // Public journal inspection only. No note plaintext or spending key export.
 (window as any).inspectC6=async()=>{const store=new IndexedDbSponsorStore(),walletId=await c6SponsorWalletId(words);try{return JSON.parse((await store.read(`neurai:c6:sponsors:${config.deployment.genesis}:${walletId}`))!);}finally{await store.close();}};
 (window as any).c6Ready=true;
}
start().catch(e=>{document.getElementById('app')!.textContent=String(e);});
