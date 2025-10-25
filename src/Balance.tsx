import React from "react";

import { Wallet } from "@neuraiproject/neurai-jswallet";
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const unitPriceText = price?.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3, // Adjust the number of decimal places
    maximumFractionDigits: 6, // You can adjust this as needed
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
      </h1>
      {dollarValue && (
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

function useUSDPrice(wallet: Wallet) {
  const [price, setPrice] = React.useState(0);

  React.useEffect(() => {
    const isNeurai = wallet && wallet.baseCurrency === "XNA";
    const work = () => {
      if (isNeurai === true) {
        // CoinGecko API gratuita sin registro
        const URL = "https://api.coingecko.com/api/v3/simple/price?ids=neurai&vs_currencies=usd";
        fetch(URL)
          .then((response) => response.json())
          .then((obj) => {
            // La respuesta es: { "neurai": { "usd": 0.00123 } }
            if (obj.neurai && obj.neurai.usd) {
              setPrice(parseFloat(obj.neurai.usd));
            }
          })
          .catch((error) => {
            console.error("Error fetching Neurai price:", error);
            setPrice(0);
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
