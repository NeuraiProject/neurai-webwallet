import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { WALLET_ADDRESS } from "../utils";

type AddressObject = {
  address: string;
  privateKey?: string;
  publicKey?: string;
  [key: string]: unknown;
};

export function useAddressObject(wallet: Wallet, assetName: string) {
  const [addressObject, setAddressObject] = React.useState<AddressObject | null>(null);

  React.useEffect(() => {
    if (!assetName) {
      setAddressObject(null);
      return;
    }

    if (assetName === WALLET_ADDRESS) {
      const firstAddress = wallet.getAddressObjects()[0];
      setAddressObject(firstAddress);
      return;
    }
    //Find the address for the asset, listaddressesbyasset "asset_name"
    const promise = wallet.rpc("listaddressesbyasset", [assetName]);
    promise.then((data) => {
      const addresses = data && typeof data === "object" ? Object.keys(data as Record<string, unknown>) : [];
      const addy = addresses[0];
      if (!addy) {
        setAddressObject(null);
        return;
      }
      const addressObject = wallet
        .getAddressObjects()
        .find((obj) => obj.address === addy);
      setAddressObject(addressObject);
    });
  }, [assetName]);

  if (assetName === "-") {
    return null;
  }
  return addressObject;
}
