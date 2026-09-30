export type BenchmarkStageId =
  | "checks" | "poseidon" | "vault-create" | "deposit-note"
  | "transfer-notes" | "withdraw-note" | "scan-candidates" | "vault-restore";

export interface BenchmarkMetric {
  id: BenchmarkStageId;
  label: string;
  count: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  totalMs: number;
}

export interface BenchmarkReport {
  kind: "neurai-privacy-browser-benchmark-v1";
  measuredAt: string;
  userAgent: string;
  hardwareConcurrencyHint: number | null;
  deviceMemoryGiBHint: number | null;
  totalMs: number;
  metrics: BenchmarkMetric[];
  proofStatus: "not-measured";
  note: string;
}

export type BenchmarkWorkerMessage =
  | { type: "stage-start"; id: BenchmarkStageId; index: number; total: number; label: string }
  | { type: "stage-done"; metric: BenchmarkMetric; index: number; total: number }
  | { type: "done"; report: BenchmarkReport }
  | { type: "error"; message: string };
