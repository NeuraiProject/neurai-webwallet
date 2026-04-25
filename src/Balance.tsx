import React from "react";

import { Wallet } from "@neuraiproject/neurai-jswallet";
import { getAssetBalanceFromMempool, type MempoolAsset } from "./utils";
import "./Balance.css";

function isTestnet(wallet: Wallet | null | undefined): boolean {
  const net = wallet?.network;
  return net === "xna-test" || net === "xna-legacy-test" || net === "xna-pq-test";
}

export function Balance({
  balance,
  mempool,
  wallet,
}: {
  wallet: Wallet;
  balance: number;
  mempool: MempoolAsset[] | null;
}) {
  let pending = getAssetBalanceFromMempool(wallet.baseCurrency, mempool);
  const hasPending = pending !== 0;
  const onTestnet = isTestnet(wallet);
  const price = useUSDPrice(wallet, onTestnet);
  const _balance = balance + pending;

  const dollarValue = (price * _balance).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const balanceText = _balance.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const unitPriceText = price?.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
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
      <h1
        className={
          "rebel-balance" + (onTestnet ? " rebel-balance--no-price" : "")
        }
      >
        {balanceText} {wallet.baseCurrency}
      </h1>
      {!onTestnet && dollarValue && (
        <div className="rebel-balance__value-container">
          <div className="rebel-balance__dollar-value">{dollarValue} total</div>
          <div className="rebel-balance__base-currency-value">
            {unitPriceText} {wallet.baseCurrency}
          </div>
        </div>
      )}
    </div>
  );
}

function useUSDPrice(wallet: Wallet, skip: boolean) {
  const [price, setPrice] = React.useState(0);

  React.useEffect(() => {
    if (skip) {
      setPrice(0);
      return;
    }
    if (!wallet) return;

    const work = () => {
      const URL = "https://api.coingecko.com/api/v3/simple/price?ids=neurai&vs_currencies=usd";
      fetch(URL)
        .then((response) => response.json())
        .then((obj) => {
          if (obj.neurai && obj.neurai.usd) {
            setPrice(parseFloat(obj.neurai.usd));
          }
        })
        .catch((error) => {
          console.warn("Could not fetch Neurai price (likely CORS or network issue):", error);
          setPrice(0);
        });
    };
    const interval = setInterval(work, 60 * 1000);
    work();

    return function cleanUp() {
      clearInterval(interval);
    };
  }, [wallet, skip]);

  return price;
}
