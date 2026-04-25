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
          {history.flatMap((item, itemIndex: number) => {
            // A single transaction can touch several assets at once. The most
            // common case is a reissue: the owner token (MYTOKEN!) is spent
            // and returned in the same tx, so its net delta is 0 and would
            // show as "receiving 0 MYTOKEN!" if we only looked at assets[0].
            // Drop net-zero entries and render every remaining asset.
            const meaningful = item.assets.filter((asset) => asset.satoshis !== 0);
            if (meaningful.length === 0) return [];
            return meaningful.map((asset, assetIndex) => {
              const name = asset.assetName;
              const amount = Math.abs(asset.satoshis) / 1e8;
              const isReceiving = asset.satoshis > 0;
              return (
                <li key={`${itemIndex}-${assetIndex}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      {isReceiving ? "receiving" : "sending"}{" "}
                      {formatNumberWith8Decimals(amount)} <AssetName name={name} />
                    </div>
                    <div>
                      <AssetLink wallet={wallet} assetName={name} />
                    </div>
                  </div>
                </li>
              );
            });
          })}
        </ul>
      </div>
    );
  }
  return <span id="mempool" tabIndex={0} />;
}
