import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { IAsset } from "../Types";
import { CopyButton } from "../components/CopyButton";
import { useUniqueAssets } from "./useUniqueAssets";
import { useSignature } from "./useSignature";
import { useAddressObject } from "./useAddressObject";
import { CopyIcon } from "../icons";

export function Sign({ assets, wallet }: { assets: IAsset[]; wallet: Wallet }) {
  const [text, setText] = React.useState("");
  const [selectedAsset, setSelectedAsset] = React.useState<string>("");

  const uniqueAssets = useUniqueAssets(wallet, assets);
  const addressObject = useAddressObject(wallet, selectedAsset);
  const signature = useSignature(addressObject, text);

  if (uniqueAssets) {
    uniqueAssets.sort(function (a, b) {
      return a.assetName.localeCompare(b.assetName);
    });
  }

  if (!uniqueAssets || uniqueAssets.length === 0) {
    return (
      <div className="neurai-card">
        <h5 className="neurai-card__title">Sign</h5>
        <p className="text-sm text-base-content/80 mt-2">
          You do not have any unique assets.
          <br />
          You need a unique asset to sign messages
        </p>
      </div>
    );
  }
  return (
    <div className="neurai-card neurai-stack">
      <h5 className="neurai-card__title">Sign</h5>

      <div>
        <label className="neurai-label">Select asset</label>
        <div className="flex items-center gap-2">
          <select
            className="neurai-select flex-1"
            onChange={(event) => setSelectedAsset(event.target.value)}
            value={selectedAsset}
          >
            <option>-</option>
            {uniqueAssets.map((asset) => (
              <option key={asset.assetName} value={asset.assetName}>
                {asset.assetName}
              </option>
            ))}
          </select>
          <CopyButton value={selectedAsset} title="Copy asset name" />
        </div>
      </div>

      <hr className="neurai-divider" />

      <div>
        <label className="neurai-label">Address</label>
        <div className="flex items-center gap-2">
          <input
            className="neurai-input flex-1"
            disabled
            value={(addressObject && addressObject.address) || ""}
          />
          <CopyButton
            value={(addressObject && addressObject.address) || ""}
            title="Copy address"
          />
        </div>
      </div>

      <hr className="neurai-divider" />

      <div>
        <label className="neurai-label">Message to sign</label>
        <div className="flex items-start gap-2">
          <textarea
            className="neurai-textarea flex-1"
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
          <CopyButton value={text} title="Copy message" />
        </div>
      </div>

      <hr className="neurai-divider" />

      <div>
        <label className="neurai-label">Signature</label>
        <textarea className="neurai-textarea" value={signature} readOnly />
      </div>

      <button
        type="button"
        className="neurai-btn--primary inline-flex items-center gap-2 self-start"
        onClick={() => navigator.clipboard.writeText(signature)}
      >
        <CopyIcon />
        Copy signature
      </button>
    </div>
  );
}
