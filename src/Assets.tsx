import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { getAssetBalanceIncludingMempool, isBaseAssetName } from "./utils";
import { AssetName } from "./AssetName";

import networkInfo from "./networkInfo";
import { formatNumberWith8Decimals } from "./formatNumberWith8Decimals";
import "./Assets.css";
import { AssetPlaceholder } from "./components/AssetPlaceholder";

interface IAsset {
  assetName: string;
  balance: number;
}
export function Assets({ wallet, assets, mempool }) {
  const allAssets = getAssetBalanceIncludingMempool(wallet, assets, mempool);

  return (
    <article>
      <h5>Assets / Tokens</h5>
      <table role="grid">
        <thead>
          <tr>
            <th>Name</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(allAssets).map((assetName: string) => {
            if (isBaseAssetName(assetName, wallet.baseCurrency)) {
              return null; //Exclude base currency XNA
            }
            const balance = allAssets[assetName];
            if (balance === 0) {
              return null;
            }
            return (
              <tr key={assetName || Math.random()}>
                <td className="rebel-assets__cell">
                  <LinkToIPFS wallet={wallet} assetName={assetName} />
                </td>
                <td className="rebel-assets__cell">
                  {formatNumberWith8Decimals(balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
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
        <a href={url} target="asset" className="rebel-assets__link">
          <img
            src={imageURL}
            className="rebel-assets__thumb"
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
    <span className="rebel-assets__link">
      <AssetPlaceholder />
      <AssetName name={assetName} />
    </span>
  );
}
