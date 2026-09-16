import type { Wallet } from "@neuraiproject/neurai-jswallet";
import React from "react";
import { Events, addEventListener, triggerEvent, removeEventListener } from "../Events";
import type { MempoolAsset } from "../utils";

const EMPTY: MempoolAsset[] = [];

export function useMempool(wallet: Wallet | null, blockCount: number) {
  const [snapshot, setSnapshot] = React.useState<{ wallet: Wallet | null; entries: MempoolAsset[] }>({ wallet: null, entries: EMPTY });
  const previous = React.useRef(snapshot);

  React.useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    let request = 0;
    const retries = new Set<ReturnType<typeof setTimeout>>();

    const fetchMempool = async () => {
      const currentRequest = ++request;
      try {
        const result = await wallet.getMempool();
        if (cancelled || currentRequest !== request || !Array.isArray(result)) return;
        const entries: MempoolAsset[] = result;
        const fewerEntries = previous.current.wallet === wallet && previous.current.entries.length > entries.length;
        const next = { wallet, entries };
        previous.current = next;
        setSnapshot(next);
        if (fewerEntries) triggerEvent(Events.SUSPICION__NEW_BLOCK);
      } catch {
        // Retain the last successful response during a temporary RPC failure.
      }
    };

    const onTransfer = () => {
      for (const timer of retries) clearTimeout(timer);
      retries.clear();
      void fetchMempool();
      // The RPC index can briefly lag behind sendrawtransaction acceptance.
      for (const delay of [1000, 3000]) {
        const timer = setTimeout(() => {
          retries.delete(timer);
          void fetchMempool();
        }, delay);
        retries.add(timer);
      }
    };

    addEventListener(Events.INFO__TRANSFER_IN_PROCESS, onTransfer);
    const interval = setInterval(fetchMempool, 10000);
    void fetchMempool();
    return () => {
      cancelled = true;
      clearInterval(interval);
      for (const timer of retries) clearTimeout(timer);
      removeEventListener(Events.INFO__TRANSFER_IN_PROCESS, onTransfer);
    };
  }, [wallet, blockCount]);

  // Never display a previous wallet's pending amounts during a network switch.
  return wallet && snapshot.wallet === wallet ? snapshot.entries : EMPTY;
}
