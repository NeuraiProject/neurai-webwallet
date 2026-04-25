import React from "react";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { betterAlert, betterConfirm, betterToast } from "./betterDialog";

type Mode =
  | "root"
  | "sub"
  | "depin"
  | "unique"
  | "qualifier"
  | "restricted"
  | "reissue";

type AssetOpResult = {
  transactionId: string | null;
  fee: number;
  burnAmount: number;
};

const MODE_LABELS: Record<Mode, string> = {
  root: "Root",
  sub: "Sub",
  depin: "DePIN",
  unique: "NFT",
  qualifier: "Qualifier",
  restricted: "Restricted",
  reissue: "Reissue",
};

const MODE_HINTS: Record<Mode, string> = {
  root: "Standard token, fully fungible. Burn cost: 1000 XNA. Creates MYTOKEN + MYTOKEN! (owner token).",
  sub: "Child of an existing root you own (PARENT/SUB). Burn cost: 200 XNA. Requires PARENT! owner token.",
  depin: "DePIN-restricted asset (one-per-address rule). Burn cost: 100 XNA. Asset name must start with `&`.",
  unique: "One-of-a-kind NFT (ROOT#TAG). Burn cost: 10 XNA per NFT. Requires the parent root's owner token.",
  qualifier: "Qualifier asset (#NAME) used to tag addresses. Burn cost: 100 XNA.",
  restricted: "Restricted asset ($NAME) governed by a verifier string. Burn cost: 1500 XNA.",
  reissue: "Mint additional supply of an existing reissuable asset. Burn cost: 200 XNA.",
};

export function Asset({ wallet }: { wallet: Wallet }) {
  const [mode, setMode] = React.useState<Mode>("root");

  // Form state — kept across modes; each branch only reads what it needs.
  const [assetName, setAssetName] = React.useState("");
  const [parentName, setParentName] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [units, setUnits] = React.useState("0");
  const [reissuable, setReissuable] = React.useState(true);
  const [ipfsHash, setIpfsHash] = React.useState("");
  const [verifierString, setVerifierString] = React.useState("");
  const [tagsCsv, setTagsCsv] = React.useState("");
  const [toAddress, setToAddress] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);

  const reset = () => {
    setAssetName("");
    setParentName("");
    setQuantity("");
    setUnits("0");
    setReissuable(true);
    setIpfsHash("");
    setVerifierString("");
    setTagsCsv("");
    setToAddress("");
  };

  async function execute() {
    if (isBusy) return;
    if (!assetName.trim() && mode !== "unique") {
      betterAlert("Missing name", "Please enter an asset name.");
      return;
    }

    setIsBusy(true);
    try {
      const trimmedAssetName = assetName.trim().toUpperCase();
      const trimmedTo = toAddress.trim();
      const ipfs = ipfsHash.trim();
      const reissuableFlag = reissuable;
      const opts: { toAddress?: string } = trimmedTo
        ? { toAddress: trimmedTo }
        : {};

      let result: AssetOpResult;

      switch (mode) {
        case "root":
          result = (await wallet.issueRoot({
            assetName: trimmedAssetName,
            quantity: parseFloat(quantity),
            units: parseInt(units, 10),
            reissuable: reissuableFlag,
            ipfsHash: ipfs || undefined,
            ...opts,
          })) as AssetOpResult;
          break;

        case "sub": {
          const sub = trimmedAssetName.includes("/")
            ? trimmedAssetName
            : `${parentName.trim().toUpperCase()}/${trimmedAssetName}`;
          result = (await wallet.issueSub({
            assetName: sub,
            quantity: parseFloat(quantity),
            units: parseInt(units, 10),
            reissuable: reissuableFlag,
            ipfsHash: ipfs || undefined,
            ...opts,
          })) as AssetOpResult;
          break;
        }

        case "depin": {
          const depinName = trimmedAssetName.startsWith("&")
            ? trimmedAssetName
            : `&${trimmedAssetName}`;
          result = (await wallet.issueDepin({
            assetName: depinName,
            quantity: parseFloat(quantity),
            reissuable: reissuableFlag,
            ipfsHash: ipfs || undefined,
            ...opts,
          })) as AssetOpResult;
          break;
        }

        case "unique": {
          const tags = tagsCsv
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (tags.length === 0) {
            betterAlert("Missing tags", "Enter at least one NFT tag.");
            setIsBusy(false);
            return;
          }
          const ipfsList = ipfs
            ? ipfs.split(",").map((s) => s.trim() || undefined)
            : undefined;
          result = (await wallet.issueUnique({
            rootName: parentName.trim().toUpperCase(),
            assetTags: tags,
            ipfsHashes: ipfsList,
            ...opts,
          })) as AssetOpResult;
          break;
        }

        case "qualifier": {
          const qualName = trimmedAssetName.startsWith("#")
            ? trimmedAssetName
            : `#${trimmedAssetName}`;
          result = (await wallet.issueQualifier({
            assetName: qualName,
            quantity: parseFloat(quantity || "1"),
            ipfsHash: ipfs || undefined,
            ...opts,
          })) as AssetOpResult;
          break;
        }

        case "restricted": {
          const restName = trimmedAssetName.startsWith("$")
            ? trimmedAssetName
            : `$${trimmedAssetName}`;
          if (!verifierString.trim()) {
            betterAlert("Missing verifier", "Restricted assets require a verifier string.");
            setIsBusy(false);
            return;
          }
          result = (await wallet.issueRestricted({
            assetName: restName,
            quantity: parseFloat(quantity),
            verifierString: verifierString.trim(),
            units: parseInt(units, 10),
            reissuable: reissuableFlag,
            ipfsHash: ipfs || undefined,
            ...opts,
          })) as AssetOpResult;
          break;
        }

        case "reissue": {
          result = (await wallet.reissue({
            assetName: trimmedAssetName,
            quantity: parseFloat(quantity),
            units: units ? parseInt(units, 10) : undefined,
            reissuable: reissuableFlag,
            ipfsHash: ipfs || undefined,
            ...opts,
          })) as AssetOpResult;
          break;
        }
      }

      const ok = await betterConfirm(
        `${MODE_LABELS[mode]} created`,
        `Asset operation submitted.\nTransaction: ${result.transactionId ?? "(pending)"}\nFee: ${result.fee} XNA\nBurned: ${result.burnAmount} XNA\n\nClose?`
      );
      if (ok) {
        reset();
        betterToast("✓ Submitted");
      }
    } catch (e: any) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      betterAlert("Operation failed", message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="neurai-card neurai-stack">
      <h5 className="neurai-card__title">Assets</h5>
      <p className="text-sm text-base-content/70 m-0">
        Create or reissue assets on the Neurai chain.
      </p>

      {/* Mode tabs */}
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost border border-base-300"}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <p className="neurai-hint">{MODE_HINTS[mode]}</p>

      {/* Form fields — branched by mode */}
      <div className="flex flex-col gap-3">
        {mode === "sub" && (
          <Field label="Parent root asset" hint="The root you own. Owner token (PARENT!) required.">
            <input
              type="text"
              className="neurai-input"
              placeholder="PARENT"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
          </Field>
        )}

        {mode === "unique" && (
          <Field label="Parent root asset">
            <input
              type="text"
              className="neurai-input"
              placeholder="PARENT"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
          </Field>
        )}

        {mode !== "unique" && (
          <Field
            label={
              mode === "depin"
                ? "Asset name (& prefix added if missing)"
                : mode === "qualifier"
                  ? "Qualifier name (# prefix added if missing)"
                  : mode === "restricted"
                    ? "Restricted name ($ prefix added if missing)"
                    : "Asset name"
            }
          >
            <input
              type="text"
              className="neurai-input uppercase"
              placeholder="MYTOKEN"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
            />
          </Field>
        )}

        {mode === "unique" && (
          <Field
            label="NFT tags (comma-separated)"
            hint="Each tag becomes a separate NFT. Example: 001, 002, GENESIS"
          >
            <input
              type="text"
              className="neurai-input"
              placeholder="001, 002, GENESIS"
              value={tagsCsv}
              onChange={(e) => setTagsCsv(e.target.value)}
            />
          </Field>
        )}

        {(mode === "root" ||
          mode === "sub" ||
          mode === "depin" ||
          mode === "qualifier" ||
          mode === "restricted" ||
          mode === "reissue") && (
          <Field
            label={mode === "qualifier" ? "Quantity (default 1)" : "Quantity"}
          >
            <input
              type="number"
              className="neurai-input"
              placeholder={mode === "reissue" ? "Additional supply" : "1000"}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0"
              step="any"
            />
          </Field>
        )}

        {(mode === "root" ||
          mode === "sub" ||
          mode === "restricted" ||
          mode === "reissue") && (
          <Field label="Units" hint="0 = whole units only, 8 = up to 8 decimals">
            <input
              type="number"
              className="neurai-input"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              min="0"
              max="8"
            />
          </Field>
        )}

        {mode === "restricted" && (
          <Field label="Verifier string" hint="Logical expression of qualifiers, e.g. #KYC & #ADULT">
            <input
              type="text"
              className="neurai-input"
              placeholder="#KYC & #ADULT"
              value={verifierString}
              onChange={(e) => setVerifierString(e.target.value)}
            />
          </Field>
        )}

        {(mode === "root" ||
          mode === "sub" ||
          mode === "depin" ||
          mode === "qualifier" ||
          mode === "restricted" ||
          mode === "reissue") && (
          <Field label="IPFS hash (optional)">
            <input
              type="text"
              className="neurai-input"
              placeholder="Qm..."
              value={ipfsHash}
              onChange={(e) => setIpfsHash(e.target.value)}
            />
          </Field>
        )}

        {mode === "unique" && (
          <Field label="IPFS hashes (comma-separated, optional)">
            <input
              type="text"
              className="neurai-input"
              placeholder="Qm..., Qm..."
              value={ipfsHash}
              onChange={(e) => setIpfsHash(e.target.value)}
            />
          </Field>
        )}

        {(mode === "root" ||
          mode === "sub" ||
          mode === "depin" ||
          mode === "unique" ||
          mode === "qualifier" ||
          mode === "restricted") && (
          <Field
            label="Recipient address (optional)"
            hint="Leave blank to receive in this wallet."
          >
            <input
              type="text"
              className="neurai-input"
              placeholder="tnq1..."
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
            />
          </Field>
        )}

        {(mode === "root" ||
          mode === "sub" ||
          mode === "depin" ||
          mode === "restricted" ||
          mode === "reissue") && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={reissuable}
              onChange={(e) => setReissuable(e.target.checked)}
            />
            <span className="text-sm">
              Reissuable
              <span className="text-base-content/60 text-xs ml-2">
                (allow minting more supply later)
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="neurai-btn--primary"
          onClick={execute}
          disabled={isBusy}
          aria-busy={isBusy}
        >
          {isBusy
            ? "Processing…"
            : mode === "reissue"
              ? "Reissue"
              : `Create ${MODE_LABELS[mode]}`}
        </button>
        <button
          type="button"
          className="neurai-btn--secondary"
          onClick={reset}
          disabled={isBusy}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="neurai-label">{label}</label>
      {children}
      {hint && <p className="neurai-hint">{hint}</p>}
    </div>
  );
}
