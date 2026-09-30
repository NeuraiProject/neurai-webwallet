/// <reference lib="webworker" />

// The only worker that loads snarkjs. No wallet keys or live pool notes are passed here.
import * as snarkjs from "snarkjs";
import { C3_TESTNET_ARTIFACTS as artifacts } from '@neuraiproject/neurai-privacy/client';
import { loadVerifiedArtifact } from '@neuraiproject/neurai-privacy/worker';
// Pinned size and SHA-256 are checked by the library before snarkjs sees a byte.
async function loadArtifact(path:string):Promise<File> {
  const bytes=await loadVerifiedArtifact({path,artifacts,fetchArtifact:p=>fetch('/privacy-c3/'+p),
    missingMessage:'Install the C3 TEST artifacts on this webwallet server first'});
  return new File([bytes],path.split('/').slice(-1)[0]);
}

type Files = { input: File; wasm: File; zkey: File; vk: File };
type Start = { type: "start"; files?: Files; form?: string };
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
    let files=event.data.files;
    if(event.data.form) {
      const entry=(artifacts.forms as Record<string,any>)[event.data.form];if(!entry)throw new Error('Unknown C3 circuit');
      files={input:await loadArtifact(entry.input),wasm:await loadArtifact(entry.wasm),zkey:await loadArtifact(entry.zkey),vk:await loadArtifact(entry.vk)};
      expected=JSON.parse(await (await loadArtifact(entry.public)).text());
    }
    if(!files)throw new Error('TEST files or C3 form required');
    const {input,wasm,zkey,vk}=files;
    if (!input || !wasm || !zkey || !vk) throw new Error("Select all four TEST files");
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

    // Chromium cannot fetch a multi-GiB Blob URL as a single ArrayBuffer.
    // fastfile's bigMem source accepts 4 MiB pages and snarkjs reads sections from it.
    let zkeySource: string | { type: "bigMem"; data: Uint8Array[] };
    if (zkey.size > 256 * 1024 * 1024) {
      const pageSize = 1 << 22;
      const pages: Uint8Array[] = [];
      let lastPercent = -1;
      for (let offset = 0; offset < zkey.size; offset += pageSize) {
        pages.push(new Uint8Array(await zkey.slice(offset, Math.min(offset + pageSize, zkey.size)).arrayBuffer()));
        const percent = Math.floor(Math.min(offset + pageSize, zkey.size) * 100 / zkey.size / 10) * 10;
        if (percent > lastPercent) {
          lastPercent = percent;
          self.postMessage({ type: "key-load", percent });
        }
      }
      zkeySource = { type: "bigMem", data: pages };
    } else {
      const zkeyUrl = URL.createObjectURL(zkey);
      urls.push(zkeyUrl);
      zkeySource = zkeyUrl;
    }

    // Blob URLs keep selected files off the application server. snarkjs reads them inside this worker.
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
    if(expected && JSON.stringify(expected.map(String))!==JSON.stringify(publicSignals.map(String)))throw new Error('C3 public input mismatch');

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
