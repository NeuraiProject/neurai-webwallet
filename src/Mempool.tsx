import React from "react";
import { getHistory, IDelta } from "@neuraiproject/neurai-history-list";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { AssetLink } from "./AssetLink";
import { AssetName } from "./AssetName";
import { formatNumberWith8Decimals } from "./formatNumberWith8Decimals";

export interface IMempoolProps {
  mempool: IDelta[];
  wallet: Wallet;
}

export function Mempool({ mempool, wallet }: IMempoolProps) {
  const history = getHistory(mempool);

  if (history.length > 0) {
    return (
      <div
        id="mempool"
        tabIndex={0}
        aria-busy="true"
        className="neurai-card neurai-card--compact"
      >
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {history.map((item, index: number) => {
            const asset = item.assets[0];
            const name = asset.assetName;
            const amount = Math.abs(asset.satoshis) / 1e8;
            return (
              <li key={index}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    {item.isSent === true ? "sending" : "receiving"}{" "}
                    {formatNumberWith8Decimals(amount)} <AssetName name={name} />
                  </div>
                  <div>
                    <AssetLink wallet={wallet} assetName={name} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  return <span id="mempool" tabIndex={0} />;
}
