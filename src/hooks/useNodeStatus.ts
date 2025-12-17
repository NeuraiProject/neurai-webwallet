import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

export type SyncHealth = "unknown" | "offline" | "syncing" | "ok";

type UseNodeStatusOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

const DEFAULT_INTERVAL = 30_000;
const DEFAULT_TIMEOUT = 4_500;

export function useNodeStatus(wallet: Wallet | null, options?: UseNodeStatusOptions) {
  const [syncHealth, setSyncHealth] = React.useState<SyncHealth>("unknown");
  const [syncHint, setSyncHint] = React.useState("Checking RPC connectivity and node sync status…");

  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  React.useEffect(() => {
    if (!wallet) {
      setSyncHealth("offline");
      setSyncHint("No RPC connectivity");
      return;
    }

    let cancelled = false;

    const withTimeout = async <T,>(promise: Promise<T>) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      });

      try {
        return (await Promise.race([promise, timeoutPromise])) as T;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const checkSync = async () => {
      try {
        const info: any = await withTimeout(wallet.rpc("getblockchaininfo", []));

        if (cancelled) return;

        const blocks = typeof info?.blocks === "number" ? info.blocks : null;
        const headers = typeof info?.headers === "number" ? info.headers : null;
        const ibd = !!info?.initialblockdownload;
        const verificationProgress =
          typeof info?.verificationprogress === "number" ? info.verificationprogress : null;

        const isLikelySynced =
          !ibd &&
          (blocks === null || headers === null || Math.abs(headers - blocks) <= 2) &&
          (verificationProgress === null || verificationProgress >= 0.999);

        if (isLikelySynced) {
          setSyncHealth("ok");
          setSyncHint("RPC connected • Node synced");
          return;
        }

        setSyncHealth("syncing");
        if (ibd) {
          setSyncHint("RPC connected • Node syncing (IBD)");
        } else if (blocks !== null && headers !== null && headers > blocks) {
          setSyncHint(`RPC connected • Node syncing (${blocks}/${headers})`);
        } else {
          setSyncHint("RPC connected • Node not ready / not synced");
        }
      } catch (e: any) {
        if (cancelled) return;

        const message = String(e?.message || e || "");

        if (
          message.toLowerCase().includes("whitelist") ||
          message.toLowerCase().includes("not in whitelist")
        ) {
          setSyncHealth("syncing");
          setSyncHint("RPC connected • Sync status unavailable");
          return;
        }

        setSyncHealth("offline");
        setSyncHint("No RPC connectivity");
      }
    };

    checkSync();
    const intervalId = setInterval(checkSync, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [intervalMs, timeoutMs, wallet]);

  return { syncHealth, syncHint };
}
