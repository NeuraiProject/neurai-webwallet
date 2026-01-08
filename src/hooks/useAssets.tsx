import { Wallet } from "@neuraiproject/neurai-jswallet";
import React from "react";
import { IAsset } from "../Types";
import { isBaseAssetName } from "../utils";

export function useAssets(wallet: Wallet | null, blockCount: number) {
  const [assets, setAssets] = React.useState<IAsset[]>([]);

  React.useEffect(() => {
    if (wallet) {
      wallet.getAssets().then((nextAssets) => {
        const filtered = Array.isArray(nextAssets)
          ? nextAssets.filter((asset) => !isBaseAssetName(asset.assetName, wallet.baseCurrency))
          : [];
        setAssets(filtered);
      }).catch(() => {
        // ignore while offline
      });
    }
  }, [wallet, blockCount]);
  return assets;
}
