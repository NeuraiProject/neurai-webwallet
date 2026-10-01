/// <reference lib="webworker" />

// The only worker that loads snarkjs. No wallet keys or live pool notes are passed here.
import * as snarkjs from "snarkjs";
import { C4_TESTNET_DEPLOYMENT } from '../privacy-pool/deployment';
import fixtures from './c4-fixtures.json';
const artifacts = C4_TESTNET_DEPLOYMENT.artifacts;
import { loadVerifiedArtifact } from '@neuraiproject/neurai-privacy/worker';
// Pinned size and SHA-256 are checked by the library before snarkjs sees a byte.
async function loadArtifact(path:string):Promise<File> {
  const bytes=await loadVerifiedArtifact({path,artifacts,fetchArtifact:p=>fetch('/privacy-c4/'+p),
    missingMessage:'Install the C4 TEST artifacts on this webwallet server first'});
  return new File([bytes],path.split('/').slice(-1)[0]);
}

type Start = { type: "start"; form: string };
type Stage = "input" | "witness" | "proof" | "verify";

function progress(stage: Stage, ms?: number): void {
  self.postMessage({ type: "progress", stage, ms });
}

let running = false;
self.onmessage = async (event: MessageEvent<Start>) => {
  if (event.data?.type !== "start" || running) return;
  running = true;
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 1, configurable: true });
  (self as any).Worker = undefined;
  let expected: string[] | undefined;
  const urls: string[] = [];
  const started = performance.now();
  try {
    const entry=(artifacts.forms as Record<string, {wasm:string;zkey:string;vk:string}>)[event.data.form];
    if (!Object.prototype.hasOwnProperty.call(fixtures.forms, event.data.form) || !entry) throw new Error('Unknown C4 circuit');
    if (fixtures.commitment !== C4_TESTNET_DEPLOYMENT.pin || fixtures.artifactsId !== artifacts.id) throw new Error('Benchmark deployment mismatch');
    const sample = (fixtures.forms as Record<string, { input: unknown; publicSignals: string[] }>)[event.data.form];
    // Public synthetic TEST witnesses are never sourced from a wallet or RPC.
    const input = new File([JSON.stringify(sample.input)], 'benchmark-input.json');
    const wasm = await loadArtifact(entry.wasm);
    const zkey = await loadArtifact(entry.zkey);
    const vk = await loadArtifact(entry.vk);
    expected = sample.publicSignals;
    if (input.size > 16 * 1024 * 1024 || vk.size > 16 * 1024 * 1024) {
      throw new Error("Input and verification key must each be at most 16 MiB");
    }
    progress("input");
    const inputStart = performance.now();
    const privateInput = JSON.parse(await input.text());
    const verificationKey = JSON.parse(await vk.text());
    if (!privateInput || typeof privateInput !== "object" || Array.isArray(privateInput)) {
      throw new Error("Circuit input must be a JSON object");
    }
    progress("input", performance.now() - inputStart);

    // Pinned C4 artifacts are capped at 256 MiB by loadVerifiedArtifact.
    const zkeyUrl = URL.createObjectURL(zkey);
    urls.push(zkeyUrl);
    const zkeySource = zkeyUrl;

    const wasmUrl = URL.createObjectURL(wasm);
    urls.push(wasmUrl);
    progress("witness");
    const witnessStart = performance.now();
    const witness: { type: "mem" } = { type: "mem" };
    await snarkjs.wtns.calculate(privateInput, wasmUrl, witness);
    progress("witness", performance.now() - witnessStart);

    progress("proof");
    const proofStart = performance.now();
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkeySource, witness, undefined, { singleThread: true });
    progress("proof", performance.now() - proofStart);
    if(expected && JSON.stringify(expected.map(String))!==JSON.stringify(publicSignals.map(String)))throw new Error('C4 public input mismatch');

    progress("verify");
    const verifyStart = performance.now();
    const valid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
    const verifyMs = performance.now() - verifyStart;
    if (!valid) throw new Error("Generated proof did not verify against the selected key");
    progress("verify", verifyMs);
    self.postMessage({
      type: "done",
      totalMs: performance.now() - started,
      wasmBytes: wasm.size,
      zkeyBytes: zkey.size,
      publicSignalCount: publicSignals.length,
      proofVerified: true,
      proof, publicSignals, form:event.data.form, manifestId:event.data.form?artifacts.id:undefined,
    });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    for (const url of urls) URL.revokeObjectURL(url);
    running = false;
  }
};
