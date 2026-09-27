import React from "react";
import { signMessage, type SigningAddress } from "./signMessage";

export function useSignature(addressObject: SigningAddress | null, text: string) {
  const [signature, setSignature] = React.useState("");

  React.useEffect(() => {
    if (addressObject) {
      if (!addressObject.privateKey || !text) {
        setSignature("");
      } else {
        try {
          setSignature(signMessage(text, addressObject));
        } catch (error) {
          console.error("Failed to sign message", error);
          setSignature("");
        }
      }
    }
  }, [addressObject, text]);

  if (!addressObject) {
    return "";
  }
  return signature;
}
