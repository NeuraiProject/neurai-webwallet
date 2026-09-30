import React from "react";
import type { BenchmarkMetric, BenchmarkReport, BenchmarkStageId, BenchmarkWorkerMessage } from "./types";
import { createGroth16BenchmarkWorker, createPrivacyBenchmarkWorker } from "./workerFactory";
import "../styles/privacy-benchmark.css";

type RunStatus = "idle" | "running" | "done" | "error" | "cancelled";
type ProofFile = "input" | "wasm" | "zkey" | "vk";
type ProofStage = ProofFile | "witness" | "proof" | "verify";
type ProofResult = { proof?: unknown; publicSignals?: string[]; form?: string; manifestId?: string; totalMs: number; wasmBytes: number; zkeyBytes: number; publicSignalCount: number; proofVerified: true; stages: Partial<Record<"input" | "witness" | "proof" | "verify", number>> };
const PROOF_STAGES = ["input", "witness", "proof", "verify"] as const;
const PROOF_FILES: { id: ProofFile; label: string; accept: string }[] = [
  { id: "input", label: "TEST circuit input (.json)", accept: ".json,application/json" },
  { id: "wasm", label: "Matching circuit (.wasm)", accept: ".wasm,application/wasm" },
  { id: "zkey", label: "Matching TEST proving key (.zkey)", accept: ".zkey" },
  { id: "vk", label: "Matching verification key (.json)", accept: ".json,application/json" },
];

const STEPS: { id: BenchmarkStageId; label: string; detail: string }[] = [
  { id: "checks", label: "Environment", detail: "Secure random source and Poseidon vector" },
  { id: "poseidon", label: "Poseidon", detail: "100 commitment hashes" },
  { id: "vault-create", label: "Create vault", detail: "Argon2id, 64 MiB, 3 passes" },
  { id: "deposit-note", label: "Deposit preparation", detail: "20 encrypted notes and commitments" },
  { id: "transfer-notes", label: "Private assignment", detail: "10 pairs of encrypted recipient notes" },
  { id: "withdraw-note", label: "Withdrawal preparation", detail: "20 note openings and nullifiers" },
  { id: "scan-candidates", label: "Candidate scan", detail: "100 synthetic encrypted records rejected" },
  { id: "vault-restore", label: "Restore vault", detail: "Decrypt backup and reopen a note" },
];

function ms(value: number | undefined): string {
  return value === undefined ? "—" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(2)} ms`;
}

function ConsoleLine({ text }: { text: string }) {
  return <div className="privacy-console__line">{text}</div>;
}

export function PrivacyBenchmark() {
  const [status, setStatus] = React.useState<RunStatus>("idle");
  const [doneCount, setDoneCount] = React.useState(0);
  const [activeStage, setActiveStage] = React.useState<BenchmarkStageId | null>(null);
  const [metrics, setMetrics] = React.useState<BenchmarkMetric[]>([]);
  const [report, setReport] = React.useState<BenchmarkReport | null>(null);
  const [lines, setLines] = React.useState<string[]>([
    "NEURAI PRIVACY LAB  /  LOCAL TEST BENCHMARK",
    "C:\\NEURAI> READY. NO WALLET KEYS OR FUNDS ARE USED.",
  ]);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const workerRef = React.useRef<Worker | null>(null);
  const proofWorkerRef = React.useRef<Worker | null>(null);
  const [c3Form,setC3Form] = React.useState("D0");
  const [proofElapsed,setProofElapsed] = React.useState(0);
  const proofStarted=React.useRef(0);
  const [proofFiles, setProofFiles] = React.useState<Partial<Record<ProofFile, File>>>({});
  const [proofStatus, setProofStatus] = React.useState<RunStatus>("idle");
  const [proofStage, setProofStage] = React.useState<ProofStage | null>(null);
  const [proofStageTimes, setProofStageTimes] = React.useState<ProofResult["stages"]>({});
  const [proofResult, setProofResult] = React.useState<ProofResult | null>(null);
  const [proofError, setProofError] = React.useState("");
  const proofStageTimesRef = React.useRef<ProofResult["stages"]>({});
  const startedAtRef = React.useRef(0);
  const consoleRef = React.useRef<HTMLDivElement | null>(null);

  const append = React.useCallback((line: string) => {
    setLines(previous => [...previous.slice(-100), line]);
  }, []);

  React.useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 100);
    return () => window.clearInterval(timer);
  }, [status]);

  React.useEffect(() => {
    if(proofStatus!=="running")return;
    const id=setInterval(()=>setProofElapsed(performance.now()-proofStarted.current),200);
    return()=>clearInterval(id);
  },[proofStatus]);

  React.useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  React.useEffect(() => () => {
    workerRef.current?.terminate();
    proofWorkerRef.current?.terminate();
  }, []);

  const stopProof = React.useCallback(() => {
    proofWorkerRef.current?.terminate();
    proofWorkerRef.current = null;
    setProofStatus("cancelled");
    setProofStage(null);
    append("[STOP] Groth16 TEST worker terminated.");
  }, [append]);

  const runProof = (form?: string) => {
    if (proofWorkerRef.current || proofStatus === "running") return;
    if (!form && (!proofFiles.input || !proofFiles.wasm || !proofFiles.zkey || !proofFiles.vk)) {
      setProofError("Select the four matching TEST files first.");
      return;
    }
    setProofError("");
    setProofResult(null);
    setProofStageTimes({});
    proofStageTimesRef.current = {};
    setProofStage(null);
    proofStarted.current=performance.now();setProofElapsed(0);
    setProofStatus("running");
    append(form ? `[INFO] C3 ${form} TEST · one thread · pinned artifacts.` : `[INFO] Local TEST artifacts · one thread.`);
    try {
      const worker = createGroth16BenchmarkWorker();
      proofWorkerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{
        type: "progress" | "key-load" | "done" | "error"; percent?: number; stage?: "input" | "witness" | "proof" | "verify";
        ms?: number; message?: string; totalMs?: number; wasmBytes?: number; zkeyBytes?: number;
        publicSignalCount?: number; proofVerified?: true; proof?:unknown; publicSignals?:string[]; form?:string; manifestId?:string;
      }>) => {
        const message = event.data;
        if (message.type === "progress" && message.stage) {
          if (message.ms === undefined) {
            setProofStage(message.stage);
            append(`[RUN ZK] ${message.stage.toUpperCase()}...`);
          } else {
            proofStageTimesRef.current = { ...proofStageTimesRef.current, [message.stage]: message.ms };
            setProofStageTimes(proofStageTimesRef.current);
            append(`[ OK ZK] ${message.stage.toUpperCase()}: ${ms(message.ms)}`);
          }
        } else if (message.type === "key-load") {
          append(`[LOAD ZK] Proving key ${message.percent ?? 0}%`);
        } else if (message.type === "done") {
          setProofResult({
            proof:message.proof,publicSignals:message.publicSignals,form:message.form,manifestId:message.manifestId,
            totalMs: message.totalMs!, wasmBytes: message.wasmBytes!, zkeyBytes: message.zkeyBytes!,
            publicSignalCount: message.publicSignalCount!, proofVerified: true, stages: proofStageTimesRef.current,
          });
          setProofStatus("done");
          setProofStage(null);
          append(`[DONE] Groth16 proof verified in ${ms(message.totalMs)}.`);
          worker.terminate();
          proofWorkerRef.current = null;
        } else if (message.type === "error") {
          setProofError(message.message || "Groth16 benchmark failed");
          setProofStatus("error");
          setProofStage(null);
          append(`[FAIL ZK] ${message.message || "Unknown error"}`);
          worker.terminate();
          proofWorkerRef.current = null;
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        setProofError(event.message || "Unable to load Groth16 worker");
        setProofStatus("error");
        setProofStage(null);
        worker.terminate();
        proofWorkerRef.current = null;
      };
      worker.postMessage({ type: "start", ...(form?{form}:{files:proofFiles}) });
    } catch (error) {
      setProofError(error instanceof Error ? error.message : String(error));
      setProofStatus("error");
    }
  };

  const finish = React.useCallback((nextStatus: RunStatus) => {
    setElapsedMs(performance.now() - startedAtRef.current);
    setStatus(nextStatus);
    setActiveStage(null);
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const run = () => {
    if (workerRef.current || status === "running") return;
    setDoneCount(0);
    setMetrics([]);
    setReport(null);
    setActiveStage(null);
    setElapsedMs(0);
    setLines([
      "NEURAI PRIVACY LAB  /  LOCAL TEST BENCHMARK",
      "C:\\NEURAI> BENCHMARK /LOCAL /TEST",
      "[INFO] Disposable TEST secrets only. No RPC or transactions.",
    ]);
    startedAtRef.current = performance.now();
    setStatus("running");
    try {
      const worker = createPrivacyBenchmarkWorker();
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<BenchmarkWorkerMessage>) => {
        const message = event.data;
        if (message.type === "stage-start") {
          setActiveStage(message.id);
          append(`[RUN ${String(message.index).padStart(2, "0")}/${message.total}] ${message.label}...`);
        } else if (message.type === "stage-done") {
          setDoneCount(message.index);
          setMetrics(previous => [...previous, message.metric]);
          append(`[ OK ${String(message.index).padStart(2, "0")}/${message.total}] ${message.metric.label}: ${ms(message.metric.medianMs)} median (${message.metric.count} run${message.metric.count === 1 ? "" : "s"})`);
        } else if (message.type === "done") {
          setReport(message.report);
          append(`[DONE] Browser primitives completed in ${ms(message.report.totalMs)}.`);
          append("[WAIT] Groth16 witness/proof: NOT MEASURED on this device.");
          append("C:\\NEURAI> _");
          finish("done");
        } else if (message.type === "error") {
          append(`[FAIL] ${message.message}`);
          finish("error");
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        append(`[FAIL] Worker error: ${event.message || "unable to load benchmark modules"}`);
        finish("error");
      };
      worker.postMessage({
        type: "start",
        userAgent: navigator.userAgent,
        hardwareConcurrencyHint: navigator.hardwareConcurrency ?? null,
        deviceMemoryGiBHint: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      });
    } catch (error) {
      append(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
      finish("error");
    }
  };

  const cancel = () => {
    if (status !== "running") return;
    append("[STOP] Benchmark cancelled; disposable worker terminated.");
    finish("cancelled");
  };

  const download = () => {
    if (!report && !proofResult) return;
    const result = report
      ? { ...report, groth16Test: proofResult ?? { status: "not-measured" } }
      : {
        kind: "neurai-privacy-browser-benchmark-v1",
        measuredAt: new Date().toISOString(),
        note: "Only the selected TEST Groth16 circuit was measured; note operations and peak RAM were not measured in this run.",
        groth16Test: proofResult,
      };
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `neurai-privacy-benchmark-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const progress = Math.round(doneCount / STEPS.length * 100);
  const byId = Object.fromEntries(metrics.map(metric => [metric.id, metric])) as Partial<Record<BenchmarkStageId, BenchmarkMetric>>;

  return (
    <div className="neurai-stack min-w-0">
      <section className="neurai-card privacy-bench-hero min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="neurai-eyebrow">TEST DATA · LOCAL DEVICE LAB</p>
            <h2 className="neurai-card__title privacy-bench-hero__title">Privacy Pool benchmark</h2>
            <p className="mb-0 mt-3 max-w-2xl text-sm text-base-content/75">
              Test the browser operations needed to prepare a private deposit, assign two private notes,
              and inspect a withdrawal. Everything runs on this device with disposable TEST secrets.
            </p>
          </div>
          <div className="privacy-bench-hero__badge" aria-label="Local only">LOCAL ONLY <span aria-hidden="true">●</span></div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="neurai-btn--primary" onClick={run} disabled={status === "running" || proofStatus === "running"}>
            {status === "running" ? "Benchmark running…" : status === "done" ? "Run again" : "Start local benchmark"}
          </button>
          {status === "running" && <button type="button" className="neurai-btn--secondary" onClick={cancel}>Stop</button>}
          {(report || proofResult) && <button type="button" className="neurai-btn--secondary" onClick={download}>Download results</button>}
          <span className="text-xs text-base-content/65">No wallet words, backup, RPC or funds are read.</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <section className="neurai-card min-w-0" aria-labelledby="privacy-bench-progress-title">
          <div className="flex items-center justify-between gap-3">
            <h3 id="privacy-bench-progress-title" className="neurai-card__title">Local run</h3>
            <span className="font-mono text-sm text-base-content/70">{(elapsedMs / 1000).toFixed(1)} s</span>
          </div>
          <div className="privacy-bench-progress mt-5" role="progressbar" aria-label="Local benchmark progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="privacy-bench-progress__fill" style={{ width: `${progress}%` }} />
            {status === "running" && <div className="privacy-bench-progress__pulse" style={{ left: `${progress}%` }} />}
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs text-base-content/65">
            <span>{status === "running" ? "RUNNING" : status === "done" ? "FOUNDATION COMPLETE" : status.toUpperCase()}</span>
            <span>{doneCount}/{STEPS.length} · {progress}%</span>
          </div>
          <ol className="privacy-bench-steps mt-5">
            {STEPS.map((step, index) => {
              const metric = byId[step.id];
              const active = activeStage === step.id;
              return <li key={step.id} className={`privacy-bench-step ${metric ? "is-done" : active ? "is-active" : ""}`}>
                <span className="privacy-bench-step__index" aria-hidden="true">{metric ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{step.label}</strong>
                  <span className="block text-xs text-base-content/60">{step.detail}</span>
                </span>
                <span className="font-mono text-xs text-base-content/70">{metric ? ms(metric.medianMs) : active ? "working" : "—"}</span>
              </li>;
            })}
          </ol>
        </section>

        <section className="neurai-card min-w-0" aria-labelledby="privacy-bench-readout-title">
          <h3 id="privacy-bench-readout-title" className="neurai-card__title">What this device can do</h3>
          <p className="mt-1 text-xs text-base-content/65">Measured medians on this browser. Preparing a note is only part of a pool transaction.</p>
          <div className="privacy-bench-readouts mt-5">
            <div><span>Deposit · encrypted note</span><strong>{ms(byId["deposit-note"]?.medianMs)}</strong></div>
            <div><span>Assign · two private notes</span><strong>{ms(byId["transfer-notes"]?.medianMs)}</strong></div>
            <div><span>Withdraw · note + nullifier</span><strong>{ms(byId["withdraw-note"]?.medianMs)}</strong></div>
            <div><span>Restore · encrypted backup</span><strong>{ms(byId["vault-restore"]?.medianMs)}</strong></div>
          </div>
          <div className="privacy-bench-proof mt-6">
            <span className="privacy-bench-proof__eyebrow">CRITICAL PATH · {proofResult ? "MEASURED WITH TEST ARTIFACTS" : "OPTIONAL TEST"}</span>
            <h4 className="m-0 mt-1 text-base font-semibold">Groth16 witness + proof</h4>
            <p className="m-0 mt-2 text-xs leading-relaxed text-base-content/70">
              Deposits, private assignments and withdrawals need a ZK proof. Run the optional test below with
              matching circuit files to measure the actual witness and prover. Peak RAM is not exposed by most browsers.
            </p>
          </div>
          <div className="mt-5 text-xs text-base-content/60">
            CPU threads reported: {navigator.hardwareConcurrency ?? "unknown"} · Device RAM hint: {(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "unknown"} GiB.
            These are browser hints, not measured CPU use or free RAM.
          </div>
        </section>
      </div>

      <section className="neurai-card min-w-0" aria-labelledby="privacy-bench-groth16-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="neurai-eyebrow">OPTIONAL · LOCAL TEST FILES</p>
            <h3 id="privacy-bench-groth16-title" className="neurai-card__title">Real Groth16 proof benchmark</h3>
            <p className="mt-2 mb-0 max-w-3xl text-xs leading-relaxed text-base-content/70">
              Choose one matching TEST input, circuit WASM, proving key and verification key. The files stay in this browser
              and are never sent to RPC. Start with a small TEST circuit. Pool circuits can require desktop-class RAM.
            </p>
          </div>
          <span className="font-mono text-xs text-base-content/60">snarkjs 0.7.6 · GPL-3.0</span>
        </div>
        <div className="privacy-pool__actions">
          <label>C3 operation<select aria-label="C3 benchmark operation" value={c3Form} disabled={proofStatus==="running"} onChange={e=>setC3Form(e.target.value)}>{["D0","D1","T1","T2","W_partial","W_full"].map(f=><option key={f}>{f}</option>)}</select></label>
          <button className="btn btn-primary" disabled={status==="running"||proofStatus==="running"} onClick={()=>runProof(c3Form)}>Run C3 benchmark</button>
          {proofStatus==="running"&&<span role="status">{proofStage??"Loading parameters"} · {(proofElapsed/1000).toFixed(1)} s elapsed · working locally</span>}
        </div>
        <details><summary>Advanced: choose your own matching TEST files</summary>
        <div className="privacy-bench-files mt-5">
          {PROOF_FILES.map(file => <label key={file.id} className="privacy-bench-file">
            <span>{file.label}</span>
            <input type="file" accept={file.accept} disabled={proofStatus === "running"} onChange={event => {
              const selected = event.currentTarget.files?.[0];
              setProofFiles(previous => ({ ...previous, [file.id]: selected }));
              setProofResult(null);
            }} />
            {proofFiles[file.id] && <small>{proofFiles[file.id]!.name} · {(proofFiles[file.id]!.size / 1048576).toFixed(1)} MiB</small>}
          </label>)}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="neurai-btn--primary" onClick={() => runProof()} disabled={status === "running" || proofStatus === "running" || !PROOF_FILES.every(file => proofFiles[file.id])}>
            {proofStatus === "running" ? "Generating TEST proof…" : "Benchmark full TEST proof"}
          </button>
          {proofStatus === "running" && <button type="button" className="neurai-btn--secondary" onClick={stopProof}>Stop proof</button>}
          <span className="text-xs text-base-content/60">Stop terminates the worker; a browser may close before it can report an out-of-memory error.</span>
        </div>
        </details>
        {proofStatus === "running" && <button className="btn btn-outline" onClick={stopProof}>Stop C3 proof</button>}
        {proofError && <p role="alert" className="mt-3 text-sm text-error">{proofError}</p>}
        <div className="privacy-bench-proof-stages mt-5" role="progressbar" aria-label="Groth16 TEST progress" aria-valuemin={0} aria-valuemax={4} aria-valuenow={proofResult ? 4 : PROOF_STAGES.indexOf(proofStage as typeof PROOF_STAGES[number]) + 1}>
          {PROOF_STAGES.map((stage, index) => <div key={stage} className={`privacy-bench-proof-stage ${proofStageTimes[stage] !== undefined ? "is-done" : proofStage === stage ? "is-active" : ""}`}>
            <span>{index + 1}. {stage === "input" ? "Read input" : stage === "witness" ? "Build witness" : stage === "proof" ? "Generate proof" : "Verify proof"}</span>
            <strong>{ms(proofStageTimes[stage])}</strong>
          </div>)}
        </div>
        {proofResult && <p className="mt-4 mb-0 text-sm">
          <strong>Proof verified.</strong> Total {ms(proofResult.totalMs)} · {proofResult.publicSignalCount} public signals · key {(proofResult.zkeyBytes / 1048576).toFixed(1)} MiB.
        </p>}
        <p className="mt-3 mb-0 text-xs leading-relaxed text-warning">
          The C3 TEST keys range from about 35 to 111 MiB. Proving uses one thread. Key size is not peak RAM; mobile measurements are collected separately.
        </p>
        <p className="mt-3 mb-0 text-xs text-base-content/60">
          This measures one selected circuit, not a complete deposit, transfer or withdrawal. It does not measure chain scan,
          RPC, transaction signing, broadcast or peak RAM. TEST proving keys must never secure real funds.
        </p>
      </section>

      <section className="neurai-card min-w-0" aria-labelledby="privacy-bench-console-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 id="privacy-bench-console-title" className="neurai-card__title">Run log</h3>
          <span className="text-xs text-base-content/55">Disposable TEST operations · no network</span>
        </div>
        <div className="privacy-console" role="log" aria-live="polite" aria-label="Benchmark command-line output" ref={consoleRef}>
          <div className="privacy-console__titlebar"><span>NEURAI.EXE</span><span>PRIVACY LAB / DOS MODE</span></div>
          <div className="privacy-console__body">
            {lines.map((line, index) => <ConsoleLine key={`${index}-${line}`} text={line} />)}
            {status === "running" && <div className="privacy-console__cursor" aria-hidden="true">█</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
