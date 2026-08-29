import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

const xnaLogo = new URL("../public/neurai-xna-logo.png", import.meta.url);

import networkInfo from "./networkInfo";
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

const imgClass =
  "max-w-[80px] max-h-[80px] rounded-lg mr-2.5 bg-white";

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
    const promise = wallet.rpc("getassetdata", [assetName]) as Promise<IAsset | null>;
    promise.then(setAssetData);
  }, [assetName, wallet.baseCurrency]);

  if (isXnaBase) {
    return (
      <div>
        <img className={imgClass} src={xnaLogo.href} />
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
            className={imgClass}
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              target.classList.add("hidden");
            }}
          />
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
