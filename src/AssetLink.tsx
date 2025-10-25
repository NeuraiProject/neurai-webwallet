import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";

const xnaLogo = new URL("../neurai-xna-logo.png", import.meta.url);

import networkInfo from "./networkInfo";

const imageStyle = {
  maxWidth: "80px",
  maxHeight: "80px",
  borderRadius: "10px",
  marginRight: "10px",

  background: "white",
};
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

  React.useEffect(() => {
    //Skip base currency, should not have IPFS
    if (assetName !== wallet.baseCurrency) {
      const promise = wallet.rpc("getassetdata", [assetName]);
      promise.then(setAssetData);
    }
  }, [assetName]);

  if (assetName === wallet.baseCurrency && wallet.baseCurrency === "XNA") {
    return (
      <div>
        <img style={imageStyle} src={xnaLogo.href}></img>
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
            style={imageStyle}
            onError={(event) => {
              const target = event.target as HTMLImageElement;
              target.style.display = "none";
            }}
          ></img>
        </a>
      </div>
    );
  }
  return (
    <div>
      <img
        style={imageStyle}
        src="placeholder-image.png"
      ></img>
    </div>
  );
}
