import { key as NeuraiKey, Wallet } from "@neuraiproject/neurai-jswallet";

// Derived from the public Wallet API to avoid a deep `/dist/Types` import.
type ChainType = Wallet["network"];
import React, { FormEvent, ReactNode } from "react";
import { LightModeToggle } from "./components/LightModeToggle";
import { Settings } from "./Settings";
import { Footer } from "./Footer";
import {
  IconAsset,
  IconChat,
  IconEye,
  IconEyeOff,
  IconHistory,
  IconHome,
  IconIoT,
  IconKey,
  IconPrivacyPool,
  IconSend,
  IconSettings,
  IconSign,
  IconSweep,
} from "./icons";
import { autoResizeTextarea } from "./utils/domUtils";
import { NetworkPicker, OldWebwalletToggle } from "./components/NetworkPicker";
import {
  networkFor,
  OLD_WEBWALLET_NETWORK,
  selectLoginNetwork,
  type NetworkOption,
} from "./networkOptions";

const neuraiLogo = new URL("../public/neurai-xna-logo.png", import.meta.url);

type Mode = "recover" | "create";

const NETWORK_STORAGE_KEY = "wallet_network";

const NAV_PREVIEW_ITEMS: { key: string; title: string; icon: React.JSX.Element }[] = [
  { key: "home", title: "Home", icon: <IconHome /> },
  { key: "privacy", title: "Privacy Pool", icon: <IconPrivacyPool /> },
  { key: "send", title: "Send", icon: <IconSend /> },
  // Match the header: Receive is temporarily hidden.
  { key: "asset", title: "Asset", icon: <IconAsset /> },
  { key: "sweep", title: "Sweep", icon: <IconSweep /> },
  { key: "history", title: "History", icon: <IconHistory /> },
  { key: "sign", title: "Sign", icon: <IconSign /> },
  { key: "chat", title: "Chat", icon: <IconChat /> },
  { key: "iot", title: "IoT", icon: <IconIoT /> },
  { key: "settings", title: "Settings", icon: <IconSettings /> },
];

function readStoredNetwork(): NetworkOption {
  return selectLoginNetwork(localStorage.getItem(NETWORK_STORAGE_KEY));
}

export function Login({
  onLogin,
  onNetworkChange,
}: {
  onLogin: (data: { mnemonicData: string; persist: boolean; network: ChainType }) => void;
  onNetworkChange?: (network: ChainType) => void;
}) {
  const [mode, setMode] = React.useState<Mode>("recover");
  const [showWords, setShowWords] = React.useState(false);
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [wordCount, setWordCount] = React.useState<12 | 24>(12);
  const [createdMnemonic, setCreatedMnemonic] = React.useState<string>("");
  const [recoverMnemonic, setRecoverMnemonic] = React.useState<string>("");
  const [usePassphrase, setUsePassphrase] = React.useState(false);
  const [dialog, setDialog] = React.useState(<></>);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);
  const [network, setNetwork] = React.useState<NetworkOption>(readStoredNetwork);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleNetworkChange = (value: NetworkOption) => {
    setNetwork(value);
    localStorage.setItem(NETWORK_STORAGE_KEY, value);
    onNetworkChange?.(value);
  };

  // The old web wallet's derivation is a recovery path: a new wallet must not
  // be created on it, so leaving Recover moves the pick back to current Legacy.
  const selectMode = (next: Mode) => {
    setMode(next);
    if (next === "create" && network === OLD_WEBWALLET_NETWORK) {
      handleNetworkChange(networkFor("mainnet", "legacy"));
    }
  };

  const renderMenuItem = (item: typeof NAV_PREVIEW_ITEMS[number]) => {
    const baseLink =
      "flex flex-col items-center justify-center gap-1 rounded-md transition-colors no-underline relative py-1";
    if (item.key === "settings") {
      return (
        <li key={item.key} className="px-1 py-1">
          <a
            href="#"
            className={`${baseLink} text-base-content hover:text-primary`}
            onClick={(event) => {
              event.preventDefault();
              setShowSettings(true);
            }}
            title="RPC settings"
            aria-label="RPC settings"
          >
            <div>{item.icon}</div>
          </a>
        </li>
      );
    }
    return (
      <li key={item.key} className="px-1 py-1">
        <span
          className={`${baseLink} text-base-content/40 cursor-not-allowed pointer-events-none`}
          title={`${item.title} (sign in to activate)`}
          aria-disabled="true"
        >
          <div>{item.icon}</div>
        </span>
      </li>
    );
  };

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRecoverMnemonic(event.target.value);
    autoResizeTextarea(event.target);
  };

  const handleTextareaInput = (event: React.FormEvent<HTMLTextAreaElement>) => {
    autoResizeTextarea(event.currentTarget);
  };

  React.useEffect(() => {
    if (textareaRef.current) {
      autoResizeTextarea(textareaRef.current);
    }
  }, [mode]);

  function showDialog(title: string, text: string) {
    const onClose = () => setDialog(<></>);
    setDialog(<Dialog title={title} text={text} onClose={onClose} />);
  }

  function newWallet(event: FormEvent) {
    event.preventDefault();

    let newMnemonic = "";
    if (wordCount === 12) {
      newMnemonic = NeuraiKey.generateMnemonic();
    } else if (wordCount === 24) {
      const entropy = new Uint8Array(32);
      crypto.getRandomValues(entropy);
      const entropyHex = Array.from(entropy)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      newMnemonic = NeuraiKey.entropyToMnemonic(entropyHex);
    }

    setCreatedMnemonic(newMnemonic);

    showDialog(
      "Backup your words",
      `Save these ${wordCount} words somewhere safe${usePassphrase ? " along with your passphrase" : ""}. Once you sign in, they will not be shown again.`
    );

    return false;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    let value = "";

    if (mode === "create") {
      if (!createdMnemonic) {
        alert("Please generate words first.");
        return false;
      }
      value = createdMnemonic.trim();
    } else {
      value = recoverMnemonic.trim();
    }

    if (!NeuraiKey.isMnemonicValid(value)) {
      const wordCountInInput = value.split(" ").filter((w: string) => w.length > 0).length;
      alert(`Given input does not seem to be valid words for a Neurai wallet. You entered ${wordCountInInput} words.`);
      return false;
    }

    let passphrase = "";
    if (usePassphrase) {
      const passphraseInput = document.getElementById("passphrase") as HTMLInputElement;
      if (passphraseInput) passphrase = passphraseInput.value;
    }

    const mnemonicData = passphrase ? `${value}|||${passphrase}` : value;
    localStorage.setItem(NETWORK_STORAGE_KEY, network);
    onLogin({ mnemonicData, persist: true, network });
    return false;
  }

  if (showSettings) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="neurai-btn--secondary"
          >
            ← Back to Login
          </button>
          <LightModeToggle />
        </div>
        <Settings network={network} />
      </div>
    );
  }

  return (
    <div className="neurai-stack flex-1">
      {/* Menu card — mirrors the navigator's compact strip */}
      <div className="neurai-card neurai-card--compact">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Brand + status */}
          <div className="flex flex-col gap-1 shrink-0">
            <a href="#" className="flex items-center gap-1.5 text-primary font-semibold no-underline">
              <img src={neuraiLogo.href} alt="Neurai logo" className="w-8 h-8 object-contain" />
              <span className="text-xl">Neurai</span>
            </a>
            <div className="flex items-center gap-3 text-xs">
              <span className="neurai-status" title="Not connected (sign in to sync)">
                <span className="neurai-status__dot" />
                Syncr
              </span>
              <span className="neurai-status" title="Wallet locked">
                <span className="neurai-status__dot" />
                Passphrase
              </span>
              <span className="neurai-status" title="No hardware wallet connected">
                <span className="neurai-status__dot" />
                HW
              </span>
            </div>
          </div>

          {/* Disabled menu icons (preview) */}
          <nav className="flex-1 min-w-0 hidden xl:block" aria-label="Wallet menu preview">
            <ul className="flex items-center justify-center gap-8 list-none m-0 p-0 flex-nowrap w-full">
              {NAV_PREVIEW_ITEMS.map(renderMenuItem)}
            </ul>
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="neurai-btn--icon"
              aria-label="Help"
              title="How it works"
            >
              <IconHelp />
            </button>
            <LightModeToggle />
          </div>
        </div>

        {/* Mobile / narrow icon grid (visible <1280px) — mirrors the
            Navigator's drawer layout when the wallet is loaded */}
        <nav className="xl:hidden mt-3" aria-label="Wallet menu preview (mobile)">
          <ul className="grid grid-cols-5 gap-2 list-none m-0 p-0">
            {NAV_PREVIEW_ITEMS.map(renderMenuItem)}
          </ul>
        </nav>
      </div>

      {/* Two-column layout on desktop: hero on the left, form on the right.
          Below `lg` the hero is hidden so the mobile layout stays compact. */}
      {/* `min-w-0` on the children: a grid item's automatic minimum size is its
          min-content width, so the picker's nowrap sample address would widen the
          card past the viewport instead of being cut short. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        {/* Hero card — desktop only */}
        <aside className="neurai-card min-w-0 hidden lg:flex flex-col gap-5" aria-label="About Neurai Wallet">
          <div className="flex items-center gap-3">
            <img
              src={neuraiLogo.href}
              alt="Neurai logo"
              className="w-12 h-12 object-contain"
            />
            <div className="flex flex-col">
              <h2 className="text-2xl font-bold text-primary leading-none m-0">
                Neurai Wallet
              </h2>
              <span className="text-[11px] text-base-content/55 uppercase tracking-widest mt-1">
                Self-custody · Browser-based
              </span>
            </div>
          </div>

          <p className="text-sm text-base-content/80 leading-relaxed m-0">
            A privacy-first wallet for the Neurai network. Send and receive XNA,
            manage assets, and control DePIN devices — all signed locally in
            your browser, never on a server.
          </p>

          <hr className="border-base-300 m-0" />

          <ul className="flex flex-col gap-4 list-none m-0 p-0">
            <FeatureItem
              icon={<IconKey />}
              title="Your keys, your device"
              body="Recovery words and the optional BIP39 passphrase never leave this browser. Signing and encryption happen locally."
            />
            <FeatureItem
              icon={<IconAsset />}
              title="XNA + native assets"
              body="Send, receive, sweep, and inspect assets across mainnet, testnet, and post-quantum networks."
            />
            <FeatureItem
              icon={<IconIoT />}
              title="DePIN & IoT-ready"
              body="Beyond standard transfers, manage Decentralized Physical Infrastructure devices directly from the wallet."
            />
            <FeatureItem
              icon={<IconPrivacyPool />}
              title="Privacy Pool (testnet)"
              body="Deposit XNA into the experimental shielded pool, assign private notes, and withdraw to a transparent address. Zero-knowledge proofs are built on your device."
            />
          </ul>

          <p className="mt-auto pt-4 border-t border-base-300 text-xs text-base-content/55 m-0">
            ⚠ Neurai cannot recover your wallet. Always keep a physical backup
            of your recovery words.
          </p>
        </aside>

        {/* Form card */}
        <div className="neurai-card min-w-0">
          <h5 className="neurai-card__title mb-4">Recover or create wallet</h5>

        <NetworkPicker network={network} onChange={handleNetworkChange} />

        {/* Which network to open ends here; which wallet to open starts below. */}
        <hr className="neurai-divider my-5" />

        {/* Mode toggle (Recover / Create) */}
        <div role="tablist" aria-label="Sign in mode" className="neurai-segmented mb-4">
          {(["recover", "create"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`neurai-segmented__item ${mode === value ? "is-active" : ""}`}
              onClick={() => selectMode(value)}
            >
              {value === "recover" ? "Recover" : "Create new"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "recover" && (
            <div>
              <label htmlFor="mnemonic" className="neurai-label">
                Recovery words
              </label>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  id="mnemonic"
                  autoComplete="off"
                  placeholder="Type or paste your 12 or 24 words"
                  className={`neurai-textarea pr-12 min-h-14 resize-none ${showWords ? "" : "[-webkit-text-security:disc] [text-security:disc] tracking-widest font-mono"}`}
                  value={recoverMnemonic}
                  onChange={handleTextareaChange}
                  onInput={handleTextareaInput}
                  onFocus={(e) => autoResizeTextarea(e.currentTarget)}
                  rows={1}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowWords(!showWords);
                    setTimeout(() => {
                      if (textareaRef.current) autoResizeTextarea(textareaRef.current);
                    }, 0);
                  }}
                  className="neurai-btn--icon absolute top-2 right-2"
                  aria-label={showWords ? "Hide words" : "Show words"}
                >
                  {showWords ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              <div className="mt-2">
                <OldWebwalletToggle network={network} onChange={handleNetworkChange} />
              </div>
            </div>
          )}

          {mode === "create" && (
            <>
              <div>
                <label className="neurai-label">Wallet strength</label>
                <div role="tablist" aria-label="Wallet strength" className="neurai-segmented neurai-segmented--sm">
                  {([12, 24] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      role="tab"
                      aria-selected={wordCount === count}
                      className={`neurai-segmented__item ${wordCount === count ? "is-active" : ""}`}
                      onClick={() => setWordCount(count)}
                    >
                      {count} words
                    </button>
                  ))}
                </div>
              </div>

              <button
                id="newWalletButton"
                type="button"
                onClick={newWallet}
                className="btn btn-outline border-2 border-dashed border-primary/50 text-primary hover:border-primary hover:bg-primary/10"
              >
                Generate new words
              </button>

              {createdMnemonic && (
                <div>
                  <label className="neurai-label">Your recovery words</label>
                  <div className="rounded-md border border-base-300 bg-base-100 p-3 font-mono text-sm leading-relaxed select-all break-words">
                    {createdMnemonic}
                  </div>
                  <p className="neurai-hint--warn">⚠ Save these words now. You will not see them again.</p>
                </div>
              )}
            </>
          )}

          <label htmlFor="use-passphrase" className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              id="use-passphrase"
              className="checkbox checkbox-sm checkbox-primary"
              checked={usePassphrase}
              onChange={() => setUsePassphrase(!usePassphrase)}
            />
            <span>
              Use passphrase <span className="text-base-content/60 font-normal">(advanced)</span>
            </span>
          </label>

          {usePassphrase && (
            <div>
              <label htmlFor="passphrase" className="neurai-label">
                Passphrase
              </label>
              <div className="relative">
                <input
                  type={showPassphrase ? "text" : "password"}
                  id="passphrase"
                  autoComplete="off"
                  placeholder="Enter your passphrase"
                  className="neurai-input pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="neurai-btn--icon absolute top-1/2 right-2 -translate-y-1/2"
                  aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                >
                  {showPassphrase ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              <p className="neurai-hint">
                Acts as a 13th/25th word. Without it, this wallet cannot be accessed.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="neurai-btn--primary w-full mt-1"
            disabled={mode === "create" ? !createdMnemonic : !recoverMnemonic.trim()}
          >
            Sign in
          </button>
        </form>
        </div>
      </div>

      <Footer />

      {dialog}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function Dialog({
  onClose,
  text,
  title,
}: {
  onClose: () => void;
  text: string;
  title: string;
}) {
  return (
    <dialog open className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="py-4">{text}</p>
        <div className="modal-action">
          <button type="button" className="neurai-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </dialog>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <dialog open className="modal modal-open">
      <div className="modal-box max-w-xl">
        <h3 className="font-bold text-lg mb-2">How the wallet works</h3>

        <h4 className="font-bold text-primary mt-4 mb-1">Wallet setup &amp; security</h4>
        <p className="text-sm text-base-content/80">
          Generate a new 12 or 24-word recovery phrase or import an existing one. This phrase is the
          master key to your funds.
        </p>
        <p className="text-sm text-base-content/80 mt-2">
          Optionally add a BIP39 passphrase as a "13th/25th word". The same mnemonic with a different
          passphrase produces a completely different wallet.
        </p>

        <h4 className="font-bold text-primary mt-4 mb-1">Privacy first</h4>
        <p className="text-sm text-base-content/80">
          Your recovery words and passphrase never leave this device. Encryption and transaction
          signing happen locally in your browser.
        </p>

        <h4 className="font-bold text-primary mt-4 mb-1">DePIN &amp; IoT</h4>
        <p className="text-sm text-base-content/80">
          Beyond standard XNA transfers, this wallet supports Decentralized Physical Infrastructure
          Networks (DePIN) and IoT device management.
        </p>

        <p className="neurai-hint--warn mt-4">
          ⚠ Neurai cannot recover your wallet. If you lose your recovery words, your funds are gone
          forever. Always keep physical backups.
        </p>

        <div className="modal-action">
          <button type="button" className="neurai-btn--primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </dialog>
  );
}

function FeatureItem({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3 items-start">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center [&_svg]:w-5 [&_svg]:h-5">
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <strong className="text-sm font-semibold leading-tight">{title}</strong>
        <span className="text-xs text-base-content/70 leading-relaxed">{body}</span>
      </div>
    </li>
  );
}

function IconHelp() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
