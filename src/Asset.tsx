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
  root: "Standard token, fully fungible. Creates MYTOKEN + MYTOKEN! (owner token).",
  sub: "Child of an existing root you own (PARENT/SUB). Requires PARENT! owner token.",
  depin: "DePIN-restricted asset (one-per-address rule). Asset name must start with `&`.",
  unique: "One-of-a-kind NFT (ROOT#TAG). Requires the parent root's owner token.",
  qualifier: "Qualifier asset (#NAME) used to tag addresses.",
  restricted: "Restricted asset ($NAME) governed by a verifier string.",
  reissue: "Mint additional supply of an existing reissuable asset.",
};

const MODE_FEES: Record<Mode, string> = {
  root: "1000 XNA",
  sub: "200 XNA",
  depin: "100 XNA",
  unique: "10 XNA per NFT",
  qualifier: "100 XNA",
  restricted: "1500 XNA",
  reissue: "200 XNA",
};

type PanelMode = "create" | "configure";

const ALL_MODES: Mode[] = [
  "root",
  "sub",
  "depin",
  "unique",
  "qualifier",
  "restricted",
  "reissue",
];

type ConfigureMode =
  | "tag"
  | "untag"
  | "reissueRestricted"
  | "freeze"
  | "unfreeze";

const ALL_CONFIGURE_MODES: ConfigureMode[] = [
  "tag",
  "untag",
  "reissueRestricted",
  "freeze",
  "unfreeze",
];

const CONFIGURE_LABELS: Record<ConfigureMode, string> = {
  tag: "Tag",
  untag: "Untag",
  reissueRestricted: "Reissue $",
  freeze: "Freeze",
  unfreeze: "Unfreeze",
};

const CONFIGURE_HINTS: Record<ConfigureMode, string> = {
  tag: "Tag addresses with a qualifier (#NAME) you hold. Spends 1 unit of the qualifier per address.",
  untag: "Remove a qualifier tag (#NAME) from addresses.",
  reissueRestricted:
    "Mint additional supply of a restricted asset ($NAME) you administer.",
  freeze:
    "Freeze a restricted asset ($NAME) globally or on specific addresses.",
  unfreeze:
    "Unfreeze a restricted asset ($NAME) globally or on specific addresses.",
};

const CONFIGURE_FEES: Record<ConfigureMode, string> = {
  tag: "Network fee only",
  untag: "Network fee only",
  reissueRestricted: "200 XNA",
  freeze: "Network fee only",
  unfreeze: "Network fee only",
};

const CONFIGURE_BUTTON_LABEL: Record<ConfigureMode, string> = {
  tag: "Tag Addresses",
  untag: "Untag Addresses",
  reissueRestricted: "Reissue Asset",
  freeze: "Freeze",
  unfreeze: "Unfreeze",
};

export function Asset({ wallet }: { wallet: Wallet }) {
  const [panelMode, setPanelMode] = React.useState<PanelMode>("create");
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

  // Configure-panel state
  const [cfMode, setCfMode] = React.useState<ConfigureMode>("tag");
  const [cfSelectedAsset, setCfSelectedAsset] = React.useState("");
  const [cfAddresses, setCfAddresses] = React.useState("");
  const [cfIsGlobal, setCfIsGlobal] = React.useState(false);
  const [cfQuantity, setCfQuantity] = React.useState("");
  const [cfChangeVerifier, setCfChangeVerifier] = React.useState(false);
  const [cfNewVerifier, setCfNewVerifier] = React.useState("");
  const [cfReissuable, setCfReissuable] = React.useState(true);
  const [cfNewIpfs, setCfNewIpfs] = React.useState("");
  const [ownedAssets, setOwnedAssets] = React.useState<{
    qualifiers: string[]; // #NAME — for tag/untag
    restricted: string[]; // $NAME (derived from NAME!) — for restricted ops
    ownerBases: string[]; // NAME (the bare base of NAME!) — for reissue
  }>({ qualifiers: [], restricted: [], ownerBases: [] });
  const [ownedAssetsLoaded, setOwnedAssetsLoaded] = React.useState(false);
  const [ownedAssetsLoading, setOwnedAssetsLoading] = React.useState(false);

  const loadOwnedAssets = React.useCallback(async () => {
    setOwnedAssetsLoading(true);
    try {
      const list = (await wallet.getAssets()) ?? [];
      const qualifiers: string[] = [];
      const restricted: string[] = [];
      const ownerBases: string[] = [];
      for (const a of list) {
        if (!a || typeof a.assetName !== "string" || a.balance <= 0) continue;
        const name = a.assetName;
        if (name.startsWith("#") && !name.endsWith("!")) {
          qualifiers.push(name);
        } else if (!name.startsWith("#") && name.endsWith("!")) {
          const base = name.slice(0, -1);
          restricted.push(`$${base}`);
          ownerBases.push(base);
        }
      }
      setOwnedAssets({
        qualifiers: [...new Set(qualifiers)].sort(),
        restricted: [...new Set(restricted)].sort(),
        ownerBases: [...new Set(ownerBases)].sort(),
      });
      setOwnedAssetsLoaded(true);
    } catch (e) {
      // Loading errors are surfaced via the empty-state hints inline.
    } finally {
      setOwnedAssetsLoading(false);
    }
  }, [wallet]);

  // Auto-load owned assets on mount (and whenever the wallet instance
  // changes). The loader is reused by Create > Reissue and the whole
  // Configure panel, so neither needs an explicit refresh click.
  React.useEffect(() => {
    loadOwnedAssets();
  }, [loadOwnedAssets]);

  // Clear the asset-name input when entering Reissue, since the field is now
  // a dropdown bound to the same `assetName` state and a previous text-mode
  // value (e.g. "MYTOKEN" typed in Root) would not exist in the list.
  React.useEffect(() => {
    if (mode === "reissue" && !ownedAssets.ownerBases.includes(assetName)) {
      setAssetName("");
    }
    // We deliberately depend on `mode` only — switching away from reissue
    // shouldn't wipe whatever the user types in Root/Sub/etc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Reset the dropdown selection when the configure tab changes — different
  // tabs source from different lists (qualifiers vs restricted assets).
  React.useEffect(() => {
    setCfSelectedAsset("");
  }, [cfMode]);

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
          // ReissueBuilder reads `units` from on-chain assetData (we don't
          // pass it). The IPFS field is `newIpfs` — the wallet's `.d.ts`
          // lists `ipfsHash` but the underlying builder ignores that name,
          // so we cast through `unknown` to bypass the stale type.
          const reissueParams = {
            assetName: trimmedAssetName,
            quantity: parseFloat(quantity),
            reissuable: reissuableFlag,
            newIpfs: ipfs || undefined,
            ...opts,
          };
          result = (await wallet.reissue(
            reissueParams as unknown as Parameters<typeof wallet.reissue>[0]
          )) as AssetOpResult;
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

  const cfResetForm = () => {
    setCfAddresses("");
    setCfQuantity("");
    setCfNewVerifier("");
    setCfNewIpfs("");
    setCfChangeVerifier(false);
    setCfReissuable(true);
    setCfIsGlobal(false);
  };

  async function executeConfigure() {
    if (isBusy) return;
    if (!cfSelectedAsset) {
      betterAlert("No asset selected", "Pick an asset from the dropdown.");
      return;
    }

    setIsBusy(true);
    try {
      const tokenName = cfSelectedAsset;
      let result: AssetOpResult;

      switch (cfMode) {
        case "tag":
        case "untag": {
          const addrs = cfAddresses
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (addrs.length === 0) {
            betterAlert("No addresses", "Enter at least one address (one per line).");
            setIsBusy(false);
            return;
          }
          if (addrs.length > 10) {
            betterAlert(
              "Too many addresses",
              "Tag/Untag supports at most 10 addresses per transaction."
            );
            setIsBusy(false);
            return;
          }
          result = (await (cfMode === "tag"
            ? wallet.tagAddresses({
                qualifierName: tokenName,
                targetAddresses: addrs,
              })
            : wallet.untagAddresses({
                qualifierName: tokenName,
                targetAddresses: addrs,
              }))) as AssetOpResult;
          break;
        }

        case "reissueRestricted": {
          const qty = parseFloat(cfQuantity);
          if (!qty || qty <= 0) {
            betterAlert(
              "Invalid quantity",
              "Additional quantity must be greater than 0."
            );
            setIsBusy(false);
            return;
          }
          result = (await wallet.reissueRestricted({
            assetName: tokenName,
            quantity: qty,
            verifierString: cfChangeVerifier
              ? cfNewVerifier.trim() || undefined
              : undefined,
            reissuable: cfReissuable,
            ipfsHash: cfNewIpfs.trim() || undefined,
          })) as AssetOpResult;
          break;
        }

        case "freeze":
        case "unfreeze": {
          if (cfIsGlobal) {
            result = (await (cfMode === "freeze"
              ? wallet.freezeAssetGlobally({ assetName: tokenName })
              : wallet.unfreezeAssetGlobally({
                  assetName: tokenName,
                }))) as AssetOpResult;
          } else {
            const addrs = cfAddresses
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (addrs.length === 0) {
              betterAlert(
                "No addresses",
                "Enter at least one address, or enable global mode."
              );
              setIsBusy(false);
              return;
            }
            result = (await (cfMode === "freeze"
              ? wallet.freezeAddresses({
                  assetName: tokenName,
                  targetAddresses: addrs,
                })
              : wallet.unfreezeAddresses({
                  assetName: tokenName,
                  targetAddresses: addrs,
                }))) as AssetOpResult;
          }
          break;
        }
      }

      const ok = await betterConfirm(
        `${CONFIGURE_LABELS[cfMode]} submitted`,
        `Asset operation submitted.\nTransaction: ${result!.transactionId ?? "(pending)"}\nFee: ${result!.fee} XNA\nBurned: ${result!.burnAmount} XNA\n\nClose?`
      );
      if (ok) {
        cfResetForm();
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

  const sidebarTitle = panelMode === "create" ? "Create Asset" : "Configure Asset";
  const sidebarCopy =
    panelMode === "create"
      ? "Issue new tokens or NFTs on the Neurai network."
      : "Tag, freeze or reissue assets you already own.";

  return (
    <div className="neurai-card">
      <div className="grid gap-6 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:items-start">
        {/* Sidebar */}
        <aside className="flex flex-col gap-5 min-w-0">
          {/* Mode toggle */}
          <div role="tablist" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === "create"}
              onClick={() => setPanelMode("create")}
              className={`btn btn-sm ${panelMode === "create" ? "btn-primary" : "btn-ghost border border-base-300"}`}
            >
              Create Asset
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === "configure"}
              onClick={() => setPanelMode("configure")}
              className={`btn btn-sm ${panelMode === "configure" ? "btn-primary" : "btn-ghost border border-base-300"}`}
            >
              Configure Asset
            </button>
          </div>

          {/* Section intro */}
          <div className="flex flex-col gap-1">
            <p className="neurai-eyebrow m-0">Blockchain</p>
            <h2 className="text-2xl font-bold m-0 leading-tight">{sidebarTitle}</h2>
            <p className="text-sm text-base-content/70 m-0">{sidebarCopy}</p>
          </div>

          {/* Side note panel */}
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-widest font-bold text-base-content/65 m-0">
              Asset tools
            </p>
            <p className="text-xs text-base-content/75 leading-relaxed m-0">
              Use issuance for new assets and switch to configure when you need
              to tag, freeze or reissue existing ones.
            </p>
          </div>
        </aside>

        {/* Body */}
        <div className="flex flex-col gap-4 min-w-0">
          {panelMode === "create" ? (
            <>
              {/* Asset type tabs */}
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

              {/* Stacked form variants — every mode renders in the same grid
                  cell, so the cell sizes to the tallest variant and switching
                  tabs no longer changes the body height. Inactive variants are
                  visibility:hidden + pointer-events:none so they still
                  contribute to layout but stay inert. */}
              <div className="grid grid-cols-1">
                {ALL_MODES.map((m) => (
                  <div
                    key={m}
                    aria-hidden={m !== mode}
                    className={`row-start-1 col-start-1 flex flex-col gap-3 ${m === mode ? "" : "invisible pointer-events-none"}`}
                  >
                    <p className="neurai-hint m-0">{MODE_HINTS[m]}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                      {m === "sub" && (
                        <Field
                          colSpan={2}
                          label="Parent root asset"
                          hint="The root you own. Owner token (PARENT!) required."
                        >
                          <input
                            type="text"
                            className="neurai-input"
                            placeholder="PARENT"
                            value={parentName}
                            onChange={(e) => setParentName(e.target.value)}
                          />
                        </Field>
                      )}

                      {m === "unique" && (
                        <Field colSpan={2} label="Parent root asset">
                          <input
                            type="text"
                            className="neurai-input"
                            placeholder="PARENT"
                            value={parentName}
                            onChange={(e) => setParentName(e.target.value)}
                          />
                        </Field>
                      )}

                      {m === "reissue" && (
                        <Field
                          colSpan={2}
                          label="Asset name"
                          hint={
                            ownedAssetsLoading
                              ? "Loading your assets…"
                              : ownedAssets.ownerBases.length === 0
                                ? "No reissuable assets found. You need an owner token (NAME!) for at least one asset."
                                : `${ownedAssets.ownerBases.length} asset${ownedAssets.ownerBases.length !== 1 ? "s" : ""} you can reissue.`
                          }
                        >
                          <select
                            className="neurai-select"
                            value={m === mode ? assetName : ""}
                            onChange={(e) => setAssetName(e.target.value)}
                          >
                            <option value="">-- Select asset --</option>
                            {ownedAssets.ownerBases.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}

                      {m !== "unique" && m !== "reissue" && (
                        <Field
                          colSpan={2}
                          label={
                            m === "depin"
                              ? "Asset name (& prefix added if missing)"
                              : m === "qualifier"
                                ? "Qualifier name (# prefix added if missing)"
                                : m === "restricted"
                                  ? "Restricted name ($ prefix added if missing)"
                                  : "Asset name"
                          }
                          hint="3–30 uppercase letters, numbers, _ or ."
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

                      {m === "unique" && (
                        <Field
                          colSpan={2}
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

                      {(m === "root" ||
                        m === "sub" ||
                        m === "depin" ||
                        m === "qualifier" ||
                        m === "restricted" ||
                        m === "reissue") && (
                        <Field
                          label={m === "qualifier" ? "Quantity (default 1)" : "Quantity"}
                        >
                          <input
                            type="number"
                            className="neurai-input"
                            placeholder={m === "reissue" ? "Additional supply" : "1000000"}
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            min="0"
                            step="any"
                          />
                        </Field>
                      )}

                      {(m === "root" || m === "sub" || m === "restricted") && (
                        <Field label="Decimals" hint="0 = whole units, up to 8">
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

                      {(m === "root" ||
                        m === "sub" ||
                        m === "depin" ||
                        m === "restricted" ||
                        m === "reissue") && (
                        <label className="md:col-span-2 flex items-center gap-2 cursor-pointer">
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

                      {m === "restricted" && (
                        <Field
                          colSpan={2}
                          label="Verifier string"
                          hint="Logical expression of qualifiers, e.g. #KYC & #ADULT"
                        >
                          <input
                            type="text"
                            className="neurai-input"
                            placeholder="#KYC & #ADULT"
                            value={verifierString}
                            onChange={(e) => setVerifierString(e.target.value)}
                          />
                        </Field>
                      )}

                      {m !== "unique" && (
                        <Field colSpan={2} label="IPFS hash (optional)">
                          <input
                            type="text"
                            className="neurai-input"
                            placeholder="Qm... or bafy..."
                            value={ipfsHash}
                            onChange={(e) => setIpfsHash(e.target.value)}
                          />
                        </Field>
                      )}

                      {m === "unique" && (
                        <Field
                          colSpan={2}
                          label="IPFS hashes (comma-separated, optional)"
                        >
                          <input
                            type="text"
                            className="neurai-input"
                            placeholder="Qm..., Qm..."
                            value={ipfsHash}
                            onChange={(e) => setIpfsHash(e.target.value)}
                          />
                        </Field>
                      )}

                      {(m === "root" ||
                        m === "sub" ||
                        m === "depin" ||
                        m === "unique" ||
                        m === "qualifier" ||
                        m === "restricted") && (
                        <Field
                          colSpan={2}
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
                    </div>
                  </div>
                ))}
              </div>

              {/* Burn fee row */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-base-content/60">Burn fee:</span>
                <span className="font-semibold text-primary">{MODE_FEES[mode]}</span>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  className="neurai-btn--primary flex-1"
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
            </>
          ) : (
            <>
              {/* Configure type tabs */}
              <div role="tablist" className="flex flex-wrap gap-1.5">
                {ALL_CONFIGURE_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={cfMode === m}
                    onClick={() => setCfMode(m)}
                    className={`btn btn-sm ${cfMode === m ? "btn-primary" : "btn-ghost border border-base-300"}`}
                  >
                    {CONFIGURE_LABELS[m]}
                  </button>
                ))}
              </div>

              {/* Stacked form variants — same trick as Create so all configure
                  sub-modes share the height of the tallest variant. */}
              <div className="grid grid-cols-1">
                {ALL_CONFIGURE_MODES.map((m) => {
                  const isActive = m === cfMode;
                  const showQualifier = m === "tag" || m === "untag";
                  const showAddresses =
                    m === "tag" ||
                    m === "untag" ||
                    ((m === "freeze" || m === "unfreeze") && !cfIsGlobal);
                  const showGlobal = m === "freeze" || m === "unfreeze";
                  const showReissueFields = m === "reissueRestricted";
                  const options = showQualifier ? ownedAssets.qualifiers : ownedAssets.restricted;
                  const emptyHint = ownedAssetsLoading
                    ? "Loading your assets…"
                    : !ownedAssetsLoaded
                      ? "Click Refresh to load."
                      : options.length === 0
                        ? showQualifier
                          ? "No qualifier assets (#NAME) found in this wallet. Create one first."
                          : "No restricted assets found. You need an owner token (NAME!) to administer one."
                        : `${options.length} asset${options.length !== 1 ? "s" : ""} available.`;

                  return (
                    <div
                      key={m}
                      aria-hidden={!isActive}
                      className={`row-start-1 col-start-1 flex flex-col gap-3 ${isActive ? "" : "invisible pointer-events-none"}`}
                    >
                      <p className="neurai-hint m-0">{CONFIGURE_HINTS[m]}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                        <Field
                          colSpan={2}
                          label={showQualifier ? "Qualifier" : "Restricted asset"}
                          hint={emptyHint}
                        >
                          <div className="flex gap-2">
                            <select
                              className="neurai-select flex-1"
                              value={isActive ? cfSelectedAsset : ""}
                              onChange={(e) => setCfSelectedAsset(e.target.value)}
                            >
                              <option value="">-- Select asset --</option>
                              {options.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="neurai-btn--secondary shrink-0"
                              onClick={loadOwnedAssets}
                              disabled={ownedAssetsLoading}
                            >
                              {ownedAssetsLoading ? "…" : "Refresh"}
                            </button>
                          </div>
                        </Field>

                        {showGlobal && (
                          <label className="md:col-span-2 flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm checkbox-primary"
                              checked={cfIsGlobal}
                              onChange={(e) => setCfIsGlobal(e.target.checked)}
                            />
                            <span className="text-sm">
                              Apply globally
                              <span className="text-base-content/60 text-xs ml-2">
                                (all addresses at once)
                              </span>
                            </span>
                          </label>
                        )}

                        {showAddresses && (
                          <Field
                            colSpan={2}
                            label="Addresses"
                            hint={
                              m === "tag" || m === "untag"
                                ? "One Neurai address per line (max 10)"
                                : "One Neurai address per line"
                            }
                          >
                            <textarea
                              className="neurai-textarea font-mono text-xs"
                              rows={4}
                              placeholder="One address per line…"
                              spellCheck={false}
                              value={cfAddresses}
                              onChange={(e) => setCfAddresses(e.target.value)}
                            />
                          </Field>
                        )}

                        {showReissueFields && (
                          <>
                            <Field colSpan={2} label="Additional quantity">
                              <input
                                type="number"
                                className="neurai-input"
                                placeholder="1000000"
                                value={cfQuantity}
                                onChange={(e) => setCfQuantity(e.target.value)}
                                min="0"
                                step="any"
                              />
                            </Field>

                            <label className="md:col-span-2 flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-primary"
                                checked={cfReissuable}
                                onChange={(e) => setCfReissuable(e.target.checked)}
                              />
                              <span className="text-sm">
                                Keep reissuable
                                <span className="text-base-content/60 text-xs ml-2">
                                  (uncheck to lock supply permanently)
                                </span>
                              </span>
                            </label>

                            <label className="md:col-span-2 flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-primary"
                                checked={cfChangeVerifier}
                                onChange={(e) =>
                                  setCfChangeVerifier(e.target.checked)
                                }
                              />
                              <span className="text-sm">Update verifier string</span>
                            </label>

                            {cfChangeVerifier && (
                              <Field
                                colSpan={2}
                                label="New verifier string"
                                hint="Boolean expression using qualifier tags (e.g. #KYC & #ACCREDITED)"
                              >
                                <input
                                  type="text"
                                  className="neurai-input"
                                  placeholder="#KYC & #ACCREDITED"
                                  value={cfNewVerifier}
                                  onChange={(e) =>
                                    setCfNewVerifier(e.target.value)
                                  }
                                />
                              </Field>
                            )}

                            <Field colSpan={2} label="New IPFS hash (optional)">
                              <input
                                type="text"
                                className="neurai-input"
                                placeholder="Qm... or bafy..."
                                value={cfNewIpfs}
                                onChange={(e) => setCfNewIpfs(e.target.value)}
                              />
                            </Field>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Burn fee row */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-base-content/60">Burn fee:</span>
                <span className="font-semibold text-primary">
                  {CONFIGURE_FEES[cfMode]}
                </span>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  className="neurai-btn--primary flex-1"
                  onClick={executeConfigure}
                  disabled={isBusy}
                  aria-busy={isBusy}
                >
                  {isBusy ? "Processing…" : CONFIGURE_BUTTON_LABEL[cfMode]}
                </button>
                <button
                  type="button"
                  className="neurai-btn--secondary"
                  onClick={cfResetForm}
                  disabled={isBusy}
                >
                  Reset
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  colSpan = 1,
  children,
}: {
  label: string;
  hint?: string;
  colSpan?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : undefined}>
      <label className="neurai-label">{label}</label>
      {children}
      {hint && <p className="neurai-hint">{hint}</p>}
    </div>
  );
}
