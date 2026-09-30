/** Loaded only when a benchmark starts, so the cryptographic worker stays out of the initial wallet route. */
export function createPrivacyBenchmarkWorker(): Worker {
  return new Worker(new URL("./PrivacyBenchmark.worker.ts", import.meta.url), { type: "module" });
}

/** The GPL-3.0 snarkjs prover is bundled only in this optional worker. */
export function createGroth16BenchmarkWorker(): Worker {
  return new Worker(new URL("./Groth16Benchmark.worker.ts", import.meta.url), { type: "module" });
}
