/// <reference lib="webworker" />

import { BrowserTestIdentity, deriveOwner, deriveViewPublic, poseidonBytes } from "@neuraiproject/neurai-privacy/browser";
import type { BenchmarkMetric, BenchmarkReport, BenchmarkStageId, BenchmarkWorkerMessage } from "./types";

const DOMAIN = "01".repeat(32);
const ASSET_ID = "02".repeat(32);
const POSEIDON_EMPTY_VECTOR = "067761295e881eec953a764e4d72bbccedf07472b57b9a3f754dcb5012441956";
const stages: { id: BenchmarkStageId; label: string }[] = [
  { id: "checks", label: "Browser and cryptography checks" },
  { id: "poseidon", label: "Poseidon hashes" },
  { id: "vault-create", label: "Create encrypted TEST vault" },
  { id: "deposit-note", label: "Prepare deposit notes" },
  { id: "transfer-notes", label: "Prepare two-recipient transfers" },
  { id: "withdraw-note", label: "Open notes and derive nullifiers" },
  { id: "scan-candidates", label: "Reject unrelated encrypted records" },
  { id: "vault-restore", label: "Restore encrypted TEST vault" },
];

function send(message: BenchmarkWorkerMessage): void {
  self.postMessage(message);
}

function hex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("");
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function makeMetric(id: BenchmarkStageId, label: string, times: number[]): BenchmarkMetric {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    id,
    label,
    count: times.length,
    medianMs: rounded(sorted[Math.floor(sorted.length / 2)]),
    minMs: rounded(sorted[0]),
    maxMs: rounded(sorted[sorted.length - 1]),
    totalMs: rounded(times.reduce((sum, value) => sum + value, 0)),
  };
}

async function benchmark(
  id: BenchmarkStageId,
  label: string,
  count: number,
  operation: () => void | Promise<void>,
): Promise<BenchmarkMetric> {
  const index = stages.findIndex(stage => stage.id === id) + 1;
  send({ type: "stage-start", id, index, total: stages.length, label });
  const times: number[] = [];
  for (let run = 0; run < count; run++) {
    const start = performance.now();
    await operation();
    times.push(performance.now() - start);
    if (run % 10 === 9) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  const metric = makeMetric(id, label, times);
  send({ type: "stage-done", metric, index, total: stages.length });
  return metric;
}

let running = false;
self.onmessage = async (event: MessageEvent<{ type: "start"; userAgent: string; hardwareConcurrencyHint: number | null; deviceMemoryGiBHint: number | null }>) => {
  if (event.data?.type !== "start" || running) return;
  running = true;
  const started = performance.now();
  const metrics: BenchmarkMetric[] = [];
  let wallet: BrowserTestIdentity | undefined;
  let restored: BrowserTestIdentity | undefined;
  try {
    metrics.push(await benchmark("checks", stages[0].label, 1, () => {
      if (!self.isSecureContext || !self.crypto?.getRandomValues) {
        throw new Error("A secure localhost or HTTPS origin with Web Crypto is required");
      }
      if (hex(poseidonBytes(new Uint8Array())) !== POSEIDON_EMPTY_VECTOR) {
        throw new Error("Poseidon implementation does not match the TEST vector");
      }
    }));
    metrics.push(await benchmark("poseidon", stages[1].label, 100,
      () => { poseidonBytes(new Uint8Array(169)); }));

    const password = hex(self.crypto.getRandomValues(new Uint8Array(32)));
    metrics.push(await benchmark("vault-create", stages[2].label, 1, async () => {
      wallet = await BrowserTestIdentity.create({ domain: DOMAIN, assetId: ASSET_ID, password });
    }));
    if (!wallet) throw new Error("TEST identity creation failed");
    const identity = wallet;
    const recipient = identity.recipient();
    const otherSpend = self.crypto.getRandomValues(new Uint8Array(32));
    const otherView = self.crypto.getRandomValues(new Uint8Array(32));
    const secondRecipient = {
      domain: DOMAIN,
      asset_id: ASSET_ID,
      owner: hex(deriveOwner(new Uint8Array(32).fill(1), otherSpend)),
      view_pub: hex(deriveViewPublic(otherView)),
    };
    otherSpend.fill(0);
    otherView.fill(0);

    metrics.push(await benchmark("deposit-note", stages[3].label, 20, () => {
      identity.createNote(recipient, 100_000_000n);
    }));
    metrics.push(await benchmark("transfer-notes", stages[4].label, 10, () => {
      identity.createNote(recipient, 40_000_000n);
      identity.createNote(secondRecipient, 60_000_000n);
    }));
    const { cm, record } = identity.createNote(recipient, 100_000_000n);
    metrics.push(await benchmark("withdraw-note", stages[5].label, 20, () => {
      const opened = identity.openRecord(record, cm);
      if (opened.amountAtomic !== 100_000_000n || opened.nf.length !== 32) {
        throw new Error("TEST note round-trip failed");
      }
    }));

    const unrelated = identity.createNote(secondRecipient, 100_000_000n);
    metrics.push(await benchmark("scan-candidates", stages[6].label, 100, () => {
      try {
        identity.openRecord(unrelated.record, unrelated.cm);
      } catch {
        return; // Authentication must fail for this valid note owned by another TEST recipient.
      }
      throw new Error("Other recipient’s encrypted record was accepted");
    }));
    metrics.push(await benchmark("vault-restore", stages[7].label, 1, async () => {
      restored = await BrowserTestIdentity.fromBackup({
        backup: identity.backupJson(), password, domain: DOMAIN, assetId: ASSET_ID,
      });
      if (restored.openRecord(record, cm).amountAtomic !== 100_000_000n) {
        throw new Error("Recovered identity could not open its TEST note");
      }
    }));

    const report: BenchmarkReport = {
      kind: "neurai-privacy-browser-benchmark-v1",
      measuredAt: new Date().toISOString(),
      userAgent: event.data.userAgent,
      hardwareConcurrencyHint: event.data.hardwareConcurrencyHint,
      deviceMemoryGiBHint: event.data.deviceMemoryGiBHint,
      totalMs: rounded(performance.now() - started),
      metrics,
      proofStatus: "not-measured",
      note: "Only local TEST primitives were measured. No Groth16 witness/proof, blockchain scan, RPC, signing, transaction or peak RAM was measured.",
    };
    send({ type: "done", report });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    restored?.lock();
    wallet?.lock();
    running = false;
  }
};
