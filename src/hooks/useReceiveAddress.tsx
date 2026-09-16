import { Wallet } from "@neuraiproject/neurai-jswallet";
import React from "react";

export function useReceiveAddress(wallet: Wallet | null, blockCount: number) {
  const [snapshot, setSnapshot] = React.useState<{wallet: Wallet; address: string} | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (wallet) {
      wallet.getReceiveAddress().then(address => {
        if (!cancelled) setSnapshot(previous => previous?.wallet === wallet && previous.address === address ? previous : {wallet, address});
      }).catch(() => { /* Keep the current wallet's last address while offline. */ });
    }
    return () => { cancelled = true; };
  }, [wallet, blockCount]);
  return snapshot?.wallet === wallet ? snapshot?.address ?? '' : '';
}
