import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

const xnaLogo = new URL("../public/neurai-xna-logo.png", import.meta.url);

import networkInfo from "./networkInfo";
import "./AssetLink.css";
import { AssetPlaceholder } from "./components/AssetPlaceholder";
import { isBaseAssetName, normalizeAssetName } from "./utils";

interface LinkToIPFSProps {
  wallet: Wallet;
  assetName: string;
}
interface IAsset {
  ipfs_hash: string;
  assetName: string;
}
export function AssetLink({ wallet, assetName }: LinkToIPFSProps) {
  const [assetData, setAssetData] = React.useState<IAsset | null>(null);
  const isBaseAsset = isBaseAssetName(assetName, wallet.baseCurrency);
  const isXnaBase = isBaseAsset && normalizeAssetName(wallet.baseCurrency) === "XNA";

  React.useEffect(() => {
    //Skip base currency, should not have IPFS
    if (isBaseAssetName(assetName, wallet.baseCurrency)) {
      setAssetData(null);
      return;
    }
    const promise = wallet.rpc("getassetdata", [assetName]);
    promise.then(setAssetData);
  }, [assetName, wallet.baseCurrency]);

  if (isXnaBase) {
    return (
      <div>
        <img className="rebel-asset-link__image" src={xnaLogo.href}></img>
      </div>
    );
  }

  if (assetData && assetData.ipfs_hash) {
    const url = "https://gateway.pinata.cloud/ipfs/" + assetData.ipfs_hash;

    const imageURL = networkInfo[wallet.network].getThumbnailURL(assetName);

    return (
      <div>
        <a href={url} target="asset">
          <img
            src={imageURL}
            className="rebel-asset-link__image"
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              target.classList.add("rebel-asset-link__image--hidden");
            }}
          ></img>
        </a>
      </div>
    );
  }
  return (
    <div>
      <AssetPlaceholder />
    </div>
  );
}
