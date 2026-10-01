// Controlled TEST UI entry; not linked from the production application.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {PrivacyPool} from '../../src/PrivacyPool';
import '../../src/styles/tailwind.css';
import '../../src/styles/primitives.css';
import '../../src/App.css';
const wallet:any={network:'xna-test',getUTXOs:async()=>[],rpc:async(method:string,params:unknown[])=>{
 const r=await(await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})})).json();if(r.error)throw new Error(r.error);return r.result;
}};
// Public BIP-39 test vector words, TEST only: the private wallet uses the active NeuraiZK derivation.
const TEST_WORDS='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
createRoot(document.getElementById('app')!).render(<PrivacyPool wallet={wallet} mnemonic={TEST_WORDS} passphrase="TREZOR"/>);
