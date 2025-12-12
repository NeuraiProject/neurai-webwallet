import { Wallet } from "@neuraiproject/neurai-jswallet";
import React from "react";

export function useBlockCount(wallet: Wallet | null) {
  const [blockCount, setBlockCount] = React.useState(0);

  React.useEffect(() => {
    if (!wallet) {
      return;
    }

    let cancelled = false;
    const fetchBlockCount = async () => {
      if (!wallet) return;
      try {
        const b: any = await wallet.rpc("getblockcount", []);
        if (cancelled) return;
        if (typeof b === "number" && b !== blockCount) {
          setBlockCount(b);
        }
      } catch (e) {
        // ignore while offline
      }
    };

    const blockInterval = setInterval(fetchBlockCount, 15 * 1000);
    fetchBlockCount();

    return () => {
      cancelled = true;
      clearInterval(blockInterval);
    };
  }, [wallet]);

  return blockCount;
}
