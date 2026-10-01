// Exercise the exact application proving worker with public synthetic inputs.
import { createGroth16BenchmarkWorker } from '../../src/privacy-benchmark/workerFactory';
(window as any).runC4Benchmark = (form:string) => new Promise((resolve,reject) => {
  const worker = createGroth16BenchmarkWorker();
  worker.onmessage = ({data}) => {
    document.getElementById('status')!.textContent = JSON.stringify({type:data.type,stage:data.stage,form});
    if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
    if (data.type === 'done') { worker.terminate(); resolve(data); }
  };
  worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
  worker.postMessage({type:'start',form});
});

import {createPoolWorker} from '../../src/privacy-pool/workerFactory';
import {PoolWorkerClient} from '@neuraiproject/neurai-privacy/client';
// Public mnemonic vector; exercises the actual application worker without chain access.
(window as any).runC4WalletSmoke = async () => {
  const addresses:string[]=[];
  for (const family of ['legacy','ecdsa','pq'] as const) {
    const client = new PoolWorkerClient({worker:createPoolWorker(),rpc:async()=>{throw new Error('Wallet smoke must not use RPC');}});
    try {
      const result=await client.derive({family,mnemonic:'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',passphrase:'TREZOR'});
      if(result.addresses.family!==family || result.addresses.derivation!=='NeuraiZK/v2')throw new Error('Wrong private derivation context');
      addresses.push(result.addresses.current.address);
      await client.lock();
    } finally { client.terminate(); }
  }
  if(new Set(addresses).size!==3 || addresses.some(address=>!address.startsWith('tnzk1')))throw new Error('Family separation failed');
  return {passed:true,families:['legacy','ecdsa','pq'],count:addresses.length};
};
