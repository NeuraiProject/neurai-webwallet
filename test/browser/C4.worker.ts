/// <reference lib="webworker" />
// Isolated regtest TEST entry. The deployment file is generated before bundling,
// not downloaded at runtime. It is deliberately absent from the production build.
import * as snarkjs from 'snarkjs';
import {startPoolWorker} from '@neuraiproject/neurai-privacy/worker';
import config from './generated/c4-deployment.json';
const corrupt = new URL(self.location.href).searchParams.has('corrupt');
startPoolWorker({scope:self as any,snarkjs:snarkjs as any,manifest:config.manifest as any,
  artifacts:config.artifacts as any,expectedGenesis:config.genesis,expectedCommitment:config.pin,
  maxArtifactBytes:256*1048576,network:'testnet',singleThread:true,
  fetchArtifact:async path=>{
    const response=await fetch('/artifacts/'+path);
    if(!corrupt||!path.endsWith('.wasm'))return response;
    // Negative test: fail integrity before using untrusted proving parameters.
    const body=new Uint8Array(await response.arrayBuffer());body[0]^=1;return new Response(body);
  }});
