import React from "react";
import * as NeuraiMessage from "@neuraiproject/neurai-message";
import { IAddressObject } from "./IAddressObject";

export function useSignature(addressObject: Pick<IAddressObject, "privateKey"> | null, text: string) {
  const [signature, setSignature] = React.useState("");

  React.useEffect(() => {
    if (addressObject) {
      const privateKey = Buffer.from(addressObject.privateKey, "hex");
      if (!privateKey || !text) {
        setSignature("");
      } else {
        const s = NeuraiMessage.sign(text, privateKey);
        setSignature(s);
      }
    }
  }, [addressObject, text]);

  if (!addressObject) {
    return "";
  }
  return signature;
}
