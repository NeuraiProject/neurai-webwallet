/// <reference lib="webworker" />
// C5 public TEST parameters are pinned in the application, never supplied by RPC.
// Proofs, note secrets and circuit inputs remain in this dedicated worker.
import * as snarkjs from 'snarkjs';
import { startPoolWorker, type SnarkjsLike } from '@neuraiproject/neurai-privacy/worker';
import { C5_TESTNET_DEPLOYMENT as config } from './deployment';

if(!config)throw new Error('C5 TEST deployment is not installed');
startPoolWorker({
  scope: self as unknown as Parameters<typeof startPoolWorker>[0]['scope'],
  snarkjs: snarkjs as unknown as SnarkjsLike,
  manifest: config.manifest,
  artifacts: config.artifacts,
  expectedGenesis: config.genesis,
  expectedCommitment: config.pin,
  network: 'testnet',
  singleThread: true,
  maxArtifactBytes: 256 * 1048576,
  artifactBaseUrl: new URL('/privacy-c5/', self.location.origin).href,
  missingArtifactMessage: 'C5 TEST parameters are not installed on this webwallet server. See PRIVACY-TESTNET.md.',
});
