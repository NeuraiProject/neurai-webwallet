/// <reference lib="webworker" />
// Secrets and circuit inputs remain in this dedicated, single-threaded worker.
// The pool logic lives in @neuraiproject/neurai-privacy; this file only supplies
// snarkjs (GPL-3.0, injected so the library does not depend on it) and the
// location of the pinned public C3 artifacts.
import * as snarkjs from 'snarkjs';
import { startPoolWorker, type SnarkjsLike } from '@neuraiproject/neurai-privacy/worker';

startPoolWorker({
  scope: self as unknown as Parameters<typeof startPoolWorker>[0]['scope'],
  snarkjs: snarkjs as unknown as SnarkjsLike,
  artifactBaseUrl: new URL('/privacy-c3/', self.location.origin).href,
  missingArtifactMessage: 'C3 TEST parameters are not installed on this webwallet server. See the Privacy setup instructions.',
});
