import { key as NeuraiKey } from "@neuraiproject/neurai-jswallet/dist/index.js";
import type { ChainType } from "@neuraiproject/neurai-jswallet/dist/Types";
import React, { FormEvent } from "react";
import { LightModeToggle } from "./components/LightModeToggle";
import { Settings } from "./Settings";
import { Footer } from "./Footer";
import {
  IconChat,
  IconHistory,
  IconHome,
  IconIoT,
  IconReceive,
  IconSend,
  IconSettings,
  IconSign,
  IconSweep,
} from "./icons";
import { autoResizeTextarea } from "./utils/domUtils";
import "./Login.css";

const neuraiLogo = new URL("../public/neurai-xna-logo.png", import.meta.url);

type Mode = "recover" | "create";

type NetworkOption = "xna-legacy" | "xna-pq" | "xna-legacy-test" | "xna-pq-test";

const NETWORK_OPTIONS: { value: NetworkOption; label: string }[] = [
  { value: "xna-legacy", label: "Mainnet Legacy" },
  { value: "xna-pq", label: "Mainnet PQ" },
  { value: "xna-legacy-test", label: "Testnet Legacy" },
  { value: "xna-pq-test", label: "Testnet PQ" },
];

const NETWORK_STORAGE_KEY = "wallet_network";

const NAV_PREVIEW_ITEMS: { key: string; title: string; icon: JSX.Element }[] = [
  { key: "home", title: "Home", icon: <IconHome /> },
  { key: "send", title: "Send", icon: <IconSend /> },
  { key: "receive", title: "Receive", icon: <IconReceive /> },
  { key: "sweep", title: "Sweep", icon: <IconSweep /> },
  { key: "history", title: "History", icon: <IconHistory /> },
  { key: "sign", title: "Sign", icon: <IconSign /> },
  { key: "chat", title: "Chat", icon: <IconChat /> },
  { key: "iot", title: "IoT", icon: <IconIoT /> },
  { key: "settings", title: "Settings", icon: <IconSettings /> },
];

function readStoredNetwork(): NetworkOption {
  const saved = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (saved && NETWORK_OPTIONS.some((o) => o.value === saved)) {
    return saved as NetworkOption;
  }
  return "xna-legacy";
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

  const renderMenuItem = (item: typeof NAV_PREVIEW_ITEMS[number]) => {
    if (item.key === "settings") {
      return (
        <li
          key={item.key}
          className="rebel-navigator__list-item rebel-navigator__list-item--icononly"
        >
          <a
            href="#"
            className="primary rebel-navigator__list-item-link rebel-login__menu-link--active"
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
      <li
        key={item.key}
        className="rebel-navigator__list-item rebel-navigator__list-item--icononly"
      >
        <span
          className="primary rebel-navigator__list-item-link rebel-navigator__list-item-link--disabled"
          title={`${item.title} (sign in to activate)`}
          aria-disabled="true"
        >
          <div>{item.icon}</div>
        </span>
      </li>
    );
  };

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
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
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      newMnemonic = NeuraiKey.entropyToMnemonic(entropyHex);
    }

    setCreatedMnemonic(newMnemonic);

    showDialog(
      "Backup your words",
      `Save these ${wordCount} words somewhere safe${usePassphrase ? ' along with your passphrase' : ''}. Once you sign in, they will not be shown again.`
    );

    return false;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();

    let value = "";

    if (mode === 'create') {
      if (!createdMnemonic) {
        alert("Please generate words first.");
        return false;
      }
      value = createdMnemonic.trim();
    } else {
      const mnemonicInput = document.getElementById("mnemonic") as HTMLTextAreaElement;
      if (!mnemonicInput) return null;
      value = mnemonicInput.value.trim();
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
      <div className="rebel-login">
        <div className="rebel-login__settings-header">
          <button
            onClick={() => setShowSettings(false)}
            className="secondary rebel-login__back-button"
          >
            ← Back to Login
          </button>
          <LightModeToggle />
        </div>
        <Settings />
      </div>
    );
  }

  return (
    <div className="rebel-login">
      <div className="rebel-login__page">
        <article className="rebel-login__menu-card rebel-navigator__container rebel-navigator__container--compact">
          <div className="rebel-navigator__compact-grid">
            <div className="rebel-navigator__compact-left">
              <h2 className="rebel-headline rebel-navigator__brand">
                <img
                  src={neuraiLogo.href}
                  alt="Neurai logo"
                  className="rebel-navigator__brand-logo"
                />
                Neurai
              </h2>

              <div className="rebel-navigator__status-list rebel-navigator__status-list--singleline">
                <div
                  className="rebel-navigator__status-item rebel-navigator__status-item--muted"
                  title="Not connected (sign in to sync)"
                >
                  <span className="rebel-navigator__status-dot" />
                  <span className="rebel-navigator__status-label">Syncr</span>
                </div>
                <div
                  className="rebel-navigator__status-item rebel-navigator__status-item--muted"
                  title="Wallet locked"
                >
                  <span className="rebel-navigator__status-dot" />
                  <span className="rebel-navigator__status-label">Passphrase</span>
                </div>
                <div
                  className="rebel-navigator__status-item rebel-navigator__status-item--muted"
                  title="No hardware wallet connected"
                >
                  <span className="rebel-navigator__status-dot" />
                  <span className="rebel-navigator__status-label">HW</span>
                </div>
              </div>
            </div>

            <nav
              className="rebel-navigator rebel-navigator--icononly rebel-navigator__compact-center"
              aria-label="Wallet menu preview"
            >
              <ul className="rebel-navigator__list rebel-navigator__list--icononly rebel-navigator__list--icononly-singleline">
                {NAV_PREVIEW_ITEMS.map(renderMenuItem)}
              </ul>
            </nav>

            <div className="rebel-navigator__controls rebel-navigator__compact-right">
              <div className="rebel-navigator__controls rebel-navigator__compact-right-controls">
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="rebel-login__icon-btn"
                  aria-label="Help"
                  title="How it works"
                >
                  <IconHelp />
                </button>
                <LightModeToggle />
              </div>
            </div>
          </div>

          <div className="rebel-navigator__compact-mobile-icons" aria-label="Compact menu">
            <nav className="rebel-navigator rebel-navigator--icononly">
              <ul className="rebel-navigator__list rebel-navigator__list--icononly rebel-navigator__list--icononly-singleline">
                {NAV_PREVIEW_ITEMS.map(renderMenuItem)}
              </ul>
            </nav>
          </div>
        </article>

        <article className="rebel-login__card">
          <h5 className="rebel-login__card-title">Recover or create wallet</h5>

          <div className="rebel-login__field">
            <label htmlFor="rebel-login-network" className="rebel-login__label">
              Network
            </label>
            <select
              id="rebel-login-network"
              className="rebel-login__select"
              value={network}
              onChange={(e) => handleNetworkChange(e.target.value as NetworkOption)}
              aria-label="Network"
            >
              {NETWORK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="rebel-login__hint">
              Each network stores its seed separately on this device.
            </p>
          </div>

          <div className="rebel-login__mode-toggle" role="tablist" aria-label="Sign in mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'recover'}
              className={`rebel-login__mode-btn ${mode === 'recover' ? 'is-active' : ''}`}
              onClick={() => setMode('recover')}
            >
              Recover
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              className={`rebel-login__mode-btn ${mode === 'create' ? 'is-active' : ''}`}
              onClick={() => setMode('create')}
            >
              Create new
            </button>
          </div>

          <form onSubmit={onSubmit} className="rebel-login__form">
            {mode === 'recover' && (
              <div className="rebel-login__field">
                <label htmlFor="mnemonic" className="rebel-login__label">
                  Recovery words
                </label>
                <div className="rebel-login__input-wrap">
                  <textarea
                    ref={textareaRef}
                    id="mnemonic"
                    autoComplete="off"
                    placeholder="Type or paste your 12 or 24 words"
                    className={`rebel-login__textarea ${showWords ? "" : "rebel-login__textarea--masked"}`.trim()}
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
                    className="rebel-login__visibility-toggle"
                    aria-label={showWords ? "Hide words" : "Show words"}
                  >
                    {showWords ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'create' && (
              <>
                <div className="rebel-login__field">
                  <label className="rebel-login__label">Wallet strength</label>
                  <div className="rebel-login__segmented">
                    <button
                      type="button"
                      className={`rebel-login__segment ${wordCount === 12 ? 'is-active' : ''}`}
                      onClick={() => setWordCount(12)}
                    >
                      12 words
                    </button>
                    <button
                      type="button"
                      className={`rebel-login__segment ${wordCount === 24 ? 'is-active' : ''}`}
                      onClick={() => setWordCount(24)}
                    >
                      24 words
                    </button>
                  </div>
                </div>

                <button
                  id="newWalletButton"
                  type="button"
                  onClick={newWallet}
                  className="secondary rebel-login__generate-btn"
                >
                  Generate new words
                </button>

                {createdMnemonic && (
                  <div className="rebel-login__field">
                    <label className="rebel-login__label">Your recovery words</label>
                    <div className="rebel-login__words-box">{createdMnemonic}</div>
                    <p className="rebel-login__hint rebel-login__hint--warn">
                      ⚠ Save these words now. You will not see them again.
                    </p>
                  </div>
                )}
              </>
            )}

            <label htmlFor="use-passphrase" className="rebel-login__passphrase-toggle">
              <input
                type="checkbox"
                id="use-passphrase"
                role="switch"
                checked={usePassphrase}
                onChange={() => setUsePassphrase(!usePassphrase)}
              />
              <span>Use passphrase <span className="rebel-login__hint-inline">(advanced)</span></span>
            </label>

            {usePassphrase && (
              <div className="rebel-login__field">
                <label htmlFor="passphrase" className="rebel-login__label">
                  Passphrase
                </label>
                <div className="rebel-login__input-wrap">
                  <input
                    type={showPassphrase ? "text" : "password"}
                    id="passphrase"
                    autoComplete="off"
                    placeholder="Enter your passphrase"
                    className="rebel-login__input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="rebel-login__visibility-toggle"
                    aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                  >
                    {showPassphrase ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
                <p className="rebel-login__hint">
                  Acts as a 13th/25th word. Without it, this wallet cannot be accessed.
                </p>
              </div>
            )}

            <button type="submit" className="rebel-login__submit">
              Sign in
            </button>
          </form>
        </article>

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
    <dialog open className="rebel-login__dialog">
      <article>
        <header>
          <a aria-label="Close" className="close" onClick={onClose}></a>
          {title}
        </header>
        <p>{text}</p>
        <footer>
          <button onClick={onClose}>Close</button>
        </footer>
      </article>
    </dialog>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <dialog open className="rebel-login__dialog rebel-login__dialog--help">
      <article>
        <header>
          <a aria-label="Close" className="close" onClick={onClose}></a>
          How the wallet works
        </header>

        <h4>Wallet setup &amp; security</h4>
        <p>
          Generate a new 12 or 24-word recovery phrase or import an existing one.
          This phrase is the master key to your funds.
        </p>
        <p>
          Optionally add a BIP39 passphrase as a "13th/25th word". The same mnemonic
          with a different passphrase produces a completely different wallet.
        </p>

        <h4>Privacy first</h4>
        <p>
          Your recovery words and passphrase never leave this device. Encryption
          and transaction signing happen locally in your browser.
        </p>

        <h4>DePIN &amp; IoT</h4>
        <p>
          Beyond standard XNA transfers, this wallet supports Decentralized Physical
          Infrastructure Networks (DePIN) and IoT device management.
        </p>

        <p className="rebel-login__hint rebel-login__hint--warn">
          ⚠ Neurai cannot recover your wallet. If you lose your recovery words,
          your funds are gone forever. Always keep physical backups.
        </p>

        <footer>
          <button onClick={onClose}>Got it</button>
        </footer>
      </article>
    </dialog>
  );
}

function IconHelp() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
