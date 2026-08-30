import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

export interface AssetMeta {
  name?: string;
  /** Total issued supply. */
  amount?: number;
  units?: number;
  reissuable?: number;
  has_ipfs?: number;
  ipfs_hash?: string;
}

/**
 * Chain metadata for the assets on screen: issuance, divisibility, IPFS.
 *
 * One `getassetdata` per asset, cached for the session. This is not new cost:
 * the previous assets list already made exactly this call per row to find its
 * IPFS thumbnail. It is the same request, used for more than one line of text.
 *
 * A failed lookup is remembered as "nothing known" rather than retried on every
 * render — the row simply falls back to naming the asset kind.
 */
export function useAssetMeta(wallet: Wallet, assetNames: string[]): Record<string, AssetMeta> {
  const [meta, setMeta] = React.useState<Record<string, AssetMeta>>({});
  const asked = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      for (const name of assetNames) {
        if (cancelled) return;
        if (asked.current.has(name)) continue;
        asked.current.add(name);
        try {
          const data = (await wallet.rpc("getassetdata", [name])) as AssetMeta | null;
          if (cancelled) return;
          setMeta((prev) => ({ ...prev, [name]: data ?? {} }));
        } catch {
          if (cancelled) return;
          setMeta((prev) => ({ ...prev, [name]: {} }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallet, assetNames]);

  return meta;
}
