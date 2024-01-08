import React from "react";

import { Wallet } from "@ravenrebels/ravencoin-jswallet";
import { getAssetBalanceFromMempool } from "./utils";

export function Balance({
  balance,
  mempool,
  wallet,
}: {
  wallet: Wallet;
  balance: number;
  mempool: any;
}) {
  let pending = getAssetBalanceFromMempool(wallet.baseCurrency, mempool);
  const hasPending = pending !== 0;
  const price = useUSDPrice(wallet);
  const _balance = balance + pending;

  const dollarValue = (price * _balance).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const balanceText = _balance.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
  return (
    <div>
      {hasPending === true ? (
        <div>
          <small>* includes pending transactions</small>
        </div>
      ) : (
        ""
      )}
      <h1 className="rebel-balance">
        {balanceText} {wallet.baseCurrency}
        {wallet.baseCurrency === "XNA" && (
          <div className="rebel-balance__dollar-value">{dollarValue}</div>
        )}
      </h1>
    </div>
  );
}

function useUSDPrice(wallet: Wallet) {
  const [price, setPrice] = React.useState(0);

  React.useEffect(() => {
    const isRavencoin = wallet && wallet.baseCurrency === "XNA";

    const work = () => {
      if (isRavencoin === true) {
        const URL = "https://api.xeggex.com/api/v2/ticker/XNA_USDT";
        
        fetch(URL)
          .then((response) => response.json())
          .then((obj) => {
            setPrice(parseFloat(obj.last_price));
          });
      }
    };
    const interval = setInterval(work, 60 * 1000);
    work();

    return function cleanUp() {
      clearInterval(interval);
    };
  }, []);

  return price;
}
