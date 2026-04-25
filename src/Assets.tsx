import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { getAssetBalanceIncludingMempool, isBaseAssetName } from "./utils";
import { AssetName } from "./AssetName";

import networkInfo from "./networkInfo";
import { formatNumberWith8Decimals } from "./formatNumberWith8Decimals";
import { AssetPlaceholder } from "./components/AssetPlaceholder";

export function Assets({ wallet, assets, mempool }) {
  const allAssets = getAssetBalanceIncludingMempool(wallet, assets, mempool);

  return (
    <div className="neurai-card">
      <h5 className="neurai-card__title mb-3">Assets / Tokens</h5>
      <table className="table w-full">
        <thead>
          <tr>
            <th className="text-left">Name</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(allAssets).map((assetName: string) => {
            if (isBaseAssetName(assetName, wallet.baseCurrency)) {
              return null;
            }
            const balance = allAssets[assetName];
            if (balance === 0) {
              return null;
            }
            return (
              <tr key={assetName || Math.random()}>
                <td>
                  <LinkToIPFS wallet={wallet} assetName={assetName} />
                </td>
                <td className="text-right tabular-nums">
                  {formatNumberWith8Decimals(balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface LinkToIPFSProps {
  wallet: Wallet;
  assetName: string;
}
interface IAsset {
  ipfs_hash: string;
  assetName: string;
}

const linkClass = "inline-flex items-center gap-2 no-underline hover:text-primary";
const thumbClass = "w-10 h-10 rounded-md bg-white object-contain";

function LinkToIPFS({ wallet, assetName }: LinkToIPFSProps) {
  const [assetData, setAssetData] = React.useState<IAsset | null>(null);

  React.useEffect(() => {
    if (isBaseAssetName(assetName, wallet.baseCurrency)) {
      setAssetData(null);
      return;
    }
    const promise = wallet.rpc("getassetdata", [assetName]);
    promise.then(setAssetData);
  }, [assetName, wallet.baseCurrency]);

  if (assetData && assetData.ipfs_hash) {
    const url = "https://gateway.pinata.cloud/ipfs/" + assetData.ipfs_hash;
    const imageURL = networkInfo[wallet.network].getThumbnailURL(assetName);

    return (
      <div>
        <a href={url} target="asset" className={linkClass}>
          <img
            src={imageURL}
            className={thumbClass}
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
          <AssetName name={assetName} />
        </a>
      </div>
    );
  }
  return (
    <span className={linkClass}>
      <AssetPlaceholder />
      <AssetName name={assetName} />
    </span>
  );
}
