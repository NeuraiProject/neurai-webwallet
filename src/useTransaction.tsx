import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { ITransaction } from "./history/History";

const transactionCache = new Map<string, Promise<ITransaction>>();
export function useTransaction(wallet: Wallet, transactionId: string) {
  const [transaction, setTransaction] = React.useState<null | ITransaction>(
    null
  );

  React.useEffect(() => {
    const key = transactionId;

    if (!transactionCache.has(key)) {
      const promise = wallet.rpc("getrawtransaction", [transactionId, true]) as Promise<ITransaction>;
      transactionCache.set(key, promise);
    }

    const promise = transactionCache.get(key);
    if (!promise) return;
    promise.then((t) => setTransaction(t));
  }, [wallet, transactionId]);

  return transaction;
}
