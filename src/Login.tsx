import NeuraiKey from "@neuraiproject/neurai-key";
import React, { FormEvent } from "react";
import { LightModeToggle } from "./components/LightModeToggle";
import ESP32Storage from "./ESP32Storage";
import { Settings } from "./Settings";
import { IconSettings } from "./icons";
import "./Login.css";

// @ts-ignore - Parcel handles this correctly
const CryptoJS = require("crypto-js");
// Fallback bip39 for entropy conversion if NeuraiKey lacks mnemonicToEntropy
let bip39: any = null;
import("bip39").then((m) => (bip39 = m)).catch(() => (bip39 = null));

//For bundler not to optimize/remove NeuraiKey
console.log("NeuraiKey", !!NeuraiKey);

const neuraiLogo = new URL("../neurai-xna-logo.png", import.meta.url);
export function Login({
  onLogin,
}: {
  onLogin: (data: { mnemonicData: string; persist: boolean; isFromESP32?: boolean }) => void;
}) {
  const [showWords, setShowWords] = React.useState(false);
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [wordCount, setWordCount] = React.useState<12 | 24>(12);
  const [activeTab, setActiveTab] = React.useState<'recover' | 'create' | 'esp32' | 'help'>('recover');
  const [createdMnemonic, setCreatedMnemonic] = React.useState<string>("");
  const [usePassphrase, setUsePassphrase] = React.useState(false);
  const [dialog, setDialog] = React.useState(<></>);
  const [showSettings, setShowSettings] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // ESP32 states
  const [esp32Connected, setEsp32Connected] = React.useState(false);
  const [esp32Storage] = React.useState(() => new ESP32Storage());
  const [esp32Keys, setEsp32Keys] = React.useState<string[]>([]);
  const [selectedKey, setSelectedKey] = React.useState<string>("");
  const [esp32Status, setEsp32Status] = React.useState<string>("");

  // ESP32 Quick Login states
  const [esp32QuickConnected, setEsp32QuickConnected] = React.useState(false);
  const [esp32QuickStorage] = React.useState(() => new ESP32Storage());
  const [esp32QuickKeys, setEsp32QuickKeys] = React.useState<string[]>([]);
  const [selectedQuickKey, setSelectedQuickKey] = React.useState<string>("");
  const [esp32QuickStatus, setEsp32QuickStatus] = React.useState<string>("");
  const [loadedMnemonic, setLoadedMnemonic] = React.useState<string>("");
  const [loadedPassphrase, setLoadedPassphrase] = React.useState<string>("");
  const [quickPassphraseInput, setQuickPassphraseInput] = React.useState<string>("");
  const [mnemonicWordCount, setMnemonicWordCount] = React.useState<number>(0);
  const [showQuickPassphrase, setShowQuickPassphrase] = React.useState<boolean>(false);
  const [showQuickPassphraseText, setShowQuickPassphraseText] = React.useState<boolean>(false);
  // Removed seed/entropy preview fields and their computation (no longer needed)

  // Auto-resize textarea
  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    autoResizeTextarea(event.target);
    // seed/entropy preview removed
  };

  const handleTextareaInput = (event: React.FormEvent<HTMLTextAreaElement>) => {
    autoResizeTextarea(event.currentTarget);
  };

  const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
    // Reset height to allow shrinking
    textarea.style.height = 'auto';

    // Get the scroll height (content height)
    const scrollHeight = textarea.scrollHeight;

    // Set new height, ensuring minimum height when empty
    const minHeight = textarea.value.trim() ? scrollHeight : 44; // 44px when empty
    textarea.style.height = minHeight + 'px';
  };

  // Auto-resize on mount and when content changes
  React.useEffect(() => {
    if (textareaRef.current) {
      autoResizeTextarea(textareaRef.current);
    }
    // seed/entropy preview removed
  }, []);

  // Recompute when toggling passphrase usage
  // no-op: seed/entropy preview removed

  function showDialog(title: string, text: string) {
    const onClose = () => setDialog(<></>);
    const d = <Dialog title={title} text={text} onClose={onClose}></Dialog>;
    setDialog(d);
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
      "WARNING",
      `Make sure you save these ${wordCount} words somewhere safe${usePassphrase ? ' along with your passphrase' : ''}. Next, click Sign in`
    );

    return false;
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();

    let value = "";

    if (activeTab === 'create') {
      if (!createdMnemonic) {
        alert("Please create a wallet first.");
        return false;
      }
      value = createdMnemonic.trim();
    } else if (activeTab === 'recover') {
      const mnemonicInput = document.getElementById("mnemonic") as HTMLFormElement;
      if (!mnemonicInput) {
        return null;
      }
      value = mnemonicInput.value.trim();
    } else {
      // ESP32 or other tabs if any
      return false;
    }

    const isValid = NeuraiKey.isMnemonicValid(value);

    if (isValid === false) {
      const wordCountInInput = value.split(" ").filter((w: string) => w.length > 0).length;
      alert(`Given input does not seem to be valid words for a Neurai wallet. You entered ${wordCountInInput} words.`);
      return false;
    } else {
      // Get passphrase if enabled
      let passphrase = "";
      if (usePassphrase) {
        const passphraseInput = document.getElementById("passphrase") as HTMLInputElement;
        if (passphraseInput) {
          passphrase = passphraseInput.value;
        }
      }

      // Store mnemonic with passphrase indicator
      const mnemonicData = passphrase ? `${value}|||${passphrase}` : value;
      onLogin({ mnemonicData, persist: true, isFromESP32: false });
    }

    return false;
  }

  // ESP32 Functions
  async function connectESP32() {
    try {
      setEsp32Status("Connecting to ESP32...");
      await esp32Storage.connect();
      setEsp32Connected(true);
      setEsp32Status("✅ ESP32 Connected");

      // Load list of keys
      await loadESP32Keys();
    } catch (error: any) {
      setEsp32Status("❌ Failed to connect: " + error.message);
      console.error("ESP32 connection error:", error);
    }
  }

  async function disconnectESP32() {
    try {
      await esp32Storage.disconnect();
      setEsp32Connected(false);
      setEsp32Keys([]);
      setSelectedKey("");
      setEsp32Status("");
    } catch (error: any) {
      console.error("ESP32 disconnect error:", error);
    }
  }

  async function loadESP32Keys() {
    try {
      const result = await esp32Storage.list();
      if (result.status === "success" && result.keys) {
        setEsp32Keys(result.keys);
        setEsp32Status(`✅ Found ${result.keys.length} stored wallet(s)`);
      }
    } catch (error: any) {
      setEsp32Status("❌ Error loading keys: " + error.message);
      console.error("ESP32 list error:", error);
    }
  }

  async function saveToESP32() {
    const mnemonicInput = document.getElementById("mnemonic") as HTMLTextAreaElement;
    if (!mnemonicInput || !mnemonicInput.value.trim()) {
      alert("Please generate or enter a mnemonic first");
      return;
    }

    const mnemonic = mnemonicInput.value.trim();

    // Validate mnemonic and derive BIP39 entropy (hex)
    if (!NeuraiKey.isMnemonicValid(mnemonic)) {
      alert("The mnemonic is not valid. Please check the words.");
      return;
    }
    let entropyHex = "";
    try {
      if (typeof (NeuraiKey as any).mnemonicToEntropy === "function") {
        entropyHex = (NeuraiKey as any).mnemonicToEntropy(mnemonic);
      } else if (bip39 && typeof bip39.mnemonicToEntropy === "function") {
        entropyHex = bip39.mnemonicToEntropy(mnemonic);
      } else {
        throw new Error("mnemonicToEntropy not available");
      }
    } catch (e: any) {
      alert("Failed to derive BIP39 entropy from the mnemonic.");
      return;
    }

    // Store ONLY the entropy hex as plaintext before encryption (no JSON envelope)
    const dataToSave = entropyHex;

    // Ask for a name/key
    const keyName = prompt("Enter a name for this wallet (e.g., 'wallet1', 'main', etc.):");
    if (!keyName || keyName.trim() === "") {
      return;
    }

    // Ask for a PIN (6-10 characters)
    let pin: string | null = "";
    while (true) {
      pin = prompt("Enter a PIN (6-10 characters) to encrypt this wallet on ESP32:");
      if (pin === null) {
        // User cancelled
        return;
      }

      if (pin.length >= 6 && pin.length <= 10) {
        // Valid PIN
        break;
      }

      alert("PIN must be between 6 and 10 characters. Please try again.");
    }

    try {
      setEsp32Status("🔐 Encrypting and saving to ESP32 (entropy only)...");

      // Encrypt the data with the PIN using AES
      const encryptedData = CryptoJS.AES.encrypt(dataToSave, pin).toString();

      await esp32Storage.save(keyName.trim(), encryptedData);
      setEsp32Status(`✅ Saved as "${keyName}" (encrypted entropy)`);

      // Reload keys
      await loadESP32Keys();
    } catch (error: any) {
      setEsp32Status("❌ Error saving: " + error.message);
      console.error("ESP32 save error:", error);
    }
  }

  async function loadFromESP32() {
    if (!selectedKey) {
      alert("Please select a wallet from the list");
      return;
    }

    try {
      setEsp32Status(`📖 Loading "${selectedKey}"...`);
      const result = await esp32Storage.read(selectedKey);

      if (result.status === "success" && result.value) {
        let data = result.value;

        // Ask for PIN to decrypt
        const pin = prompt(`Enter PIN to decrypt wallet "${selectedKey}":`);
        if (!pin) {
          setEsp32Status("❌ PIN required to decrypt wallet");
          return;
        }

        try {
          // Try to decrypt the data with the provided PIN
          const decryptedBytes = CryptoJS.AES.decrypt(data, pin);
          const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);

          if (!decryptedText || decryptedText.trim() === "") {
            throw new Error("Invalid PIN or corrupted data");
          }

          data = decryptedText;
        } catch (decryptError) {
          setEsp32Status("❌ Failed to decrypt: Invalid PIN");
          alert("Invalid PIN. Please try again.");
          return;
        }

        // Now process the decrypted data as raw entropy hex
        try {
          const entropyHex = data.trim();
          const mnemonicWords = NeuraiKey.entropyToMnemonic(entropyHex);
          const mnemonicInput = document.getElementById("mnemonic") as HTMLTextAreaElement;
          if (mnemonicInput) {
            mnemonicInput.value = mnemonicWords;
            autoResizeTextarea(mnemonicInput);
          }
          // No passphrase stored; keep passphrase disabled/empty
          setUsePassphrase(false);
          // Update seed/entropy display
          // seed/entropy preview removed
          setEsp32Status(`✅ Loaded "${selectedKey}" (from entropy)`);
        } catch (e) {
          setEsp32Status("❌ Error: Invalid data format on device (expected raw BIP39 entropy hex)");
        }
      }
    } catch (error: any) {
      setEsp32Status("❌ Error loading: " + error.message);
      console.error("ESP32 read error:", error);
    }
  }

  async function deleteFromESP32() {
    if (!selectedKey) {
      alert("Please select a wallet from the list");
      return;
    }

    const confirmed = confirm(`Are you sure you want to delete "${selectedKey}" from ESP32?\n\nThis cannot be undone!`);
    if (!confirmed) {
      return;
    }

    try {
      setEsp32Status(`🗑️ Deleting "${selectedKey}"...`);
      await esp32Storage.delete(selectedKey);
      setEsp32Status(`✅ Deleted "${selectedKey}"`);
      setSelectedKey("");

      // Reload keys
      await loadESP32Keys();
    } catch (error: any) {
      setEsp32Status("❌ Error deleting: " + error.message);
      console.error("ESP32 delete error:", error);
    }
  }

  // ESP32 Quick Login Functions
  async function connectESP32Quick() {
    try {
      setEsp32QuickStatus("Connecting to ESP32...");
      await esp32QuickStorage.connect();
      setEsp32QuickConnected(true);
      setEsp32QuickStatus("✅ ESP32 Connected");

      // Load list of keys
      await loadESP32QuickKeys();
    } catch (error: any) {
      setEsp32QuickStatus("❌ Failed to connect: " + error.message);
      console.error("ESP32 Quick connection error:", error);
    }
  }

  async function disconnectESP32Quick() {
    try {
      await esp32QuickStorage.disconnect();
      setEsp32QuickConnected(false);
      setEsp32QuickKeys([]);
      setSelectedQuickKey("");
      setLoadedMnemonic("");
      setLoadedPassphrase("");
      setQuickPassphraseInput("");
      setMnemonicWordCount(0);
      // no validation needed when loading from entropy
      setShowQuickPassphrase(false);
      setShowQuickPassphraseText(false);
      setEsp32QuickStatus("");
    } catch (error: any) {
      console.error("ESP32 Quick disconnect error:", error);
    }
  }

  async function loadESP32QuickKeys() {
    try {
      const result = await esp32QuickStorage.list();
      if (result.status === "success" && result.keys) {
        setEsp32QuickKeys(result.keys);
        setEsp32QuickStatus(`✅ Found ${result.keys.length} stored wallet(s)`);
      }
    } catch (error: any) {
      setEsp32QuickStatus("❌ Error loading keys: " + error.message);
      console.error("ESP32 Quick list error:", error);
    }
  }

  async function selectQuickWallet() {
    if (!selectedQuickKey) {
      return;
    }

    try {
      setEsp32QuickStatus(`📖 Loading "${selectedQuickKey}"...`);
      const result = await esp32QuickStorage.read(selectedQuickKey);

      if (result.status === "success" && result.value) {
        let data = result.value;

        // Ask for PIN to decrypt
        const pin = prompt(`Enter PIN to decrypt wallet "${selectedQuickKey}":`);
        if (!pin) {
          setEsp32QuickStatus("❌ PIN required to decrypt wallet");
          return;
        }

        try {
          // Try to decrypt the data with the provided PIN
          const decryptedBytes = CryptoJS.AES.decrypt(data, pin);
          const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);

          if (!decryptedText || decryptedText.trim() === "") {
            throw new Error("Invalid PIN or corrupted data");
          }

          data = decryptedText;
        } catch (decryptError) {
          setEsp32QuickStatus("❌ Failed to decrypt: Invalid PIN");
          alert("Invalid PIN. Please try again.");
          return;
        }

        // Now process the decrypted data as raw entropy hex
        try {
          const entropyHex = data.trim();
          const mnemonicWords = NeuraiKey.entropyToMnemonic(entropyHex);
          setLoadedMnemonic(mnemonicWords);
          // No passphrase stored; user may input one if desired
          setLoadedPassphrase("");
          setQuickPassphraseInput("");
          setShowQuickPassphrase(false);

          // Count words
          const wordCount = mnemonicWords.trim().split(/\s+/).length;
          setMnemonicWordCount(wordCount);

          setEsp32QuickStatus(`✅ Loaded "${selectedQuickKey}" - ${wordCount} words`);
        } catch (e) {
          setEsp32QuickStatus("❌ Error: Invalid data format on device (expected raw BIP39 entropy hex)");
        }
      }
    } catch (error: any) {
      setEsp32QuickStatus("❌ Error loading: " + error.message);
      console.error("ESP32 Quick read error:", error);
    }
  }

  function loginWithESP32Wallet() {
    if (!loadedMnemonic) {
      alert("Please select and load a wallet first");
      return;
    }

    // No additional validation needed; mnemonic reconstructed from entropy

    // Use the passphrase from the input field (may be modified by user)
    const finalPassphrase = quickPassphraseInput.trim();

    // Store mnemonic with passphrase if exists
    const mnemonicData = finalPassphrase ? `${loadedMnemonic}|||${finalPassphrase}` : loadedMnemonic;
    onLogin({ mnemonicData, persist: false, isFromESP32: true });
  }

  // If showing settings, render only the settings component
  if (showSettings) {
    return (
      <article>
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
      </article>
    );
  }

  return (
    <article>
      <div className="rebel-login__topbar">
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="rebel-login__icon-button"
          title="RPC Server Settings"
          aria-label="RPC Server Settings"
        >
          <IconSettings />
        </button>
        <LightModeToggle />
      </div>
      {dialog}

      {/* Hero Section */}
      <header className="rebel-login__hero">
        <h1 className="rebel-headline rebel-login__hero-title">
          Neurai Web Wallet
        </h1>
        <p className="rebel-login__hero-subtitle">
          A secure, client-side wallet for managing your Neurai assets
        </p>
      </header>

      {/* Features Grid */}
      <div
        className="features-grid rebel-login__features"
      >
        <div className="rebel-login__feature-card rebel-login__feature-card--orange">
          <div className="rebel-login__feature-icon rebel-login__feature-icon--logo">
            <img
              src={neuraiLogo.href}
              alt="Neurai"
              className="rebel-login__feature-logo"
            />
          </div>
          <h3 className="rebel-login__feature-title">Neurai</h3>
          <p className="rebel-login__feature-text">
            Wallet for managing XNA, IoT, NFT, RWA, and more.
          </p>
        </div>

        <div className="rebel-login__feature-card rebel-login__feature-card--blue">
          <div className="rebel-login__feature-icon">🔒</div>
          <h3 className="rebel-login__feature-title">Secure</h3>
          <p className="rebel-login__feature-text">
            Your keys never leave your browser. Everything runs locally.
          </p>
        </div>

        <div className="rebel-login__feature-card rebel-login__feature-card--green">
          <div className="rebel-login__feature-icon">🛡️</div>
          <h3 className="rebel-login__feature-title">DePIN</h3>
          <p className="rebel-login__feature-text">
            Military-grade encrypted communication system.
          </p>
        </div>

        <div className="rebel-login__feature-card rebel-login__feature-card--purple">
          <div className="rebel-login__feature-icon">🌐</div>
          <h3 className="rebel-login__feature-title">Web-Based</h3>
          <p className="rebel-login__feature-text">
            Access your wallet from any device with a browser.
          </p>
        </div>
      </div>



      {/* Login Form */}


      {/* Login Tabs */}
      <p className="rebel-login__privacy">
        <strong>📌 Privacy notice:</strong> Your recovery words are encrypted and stored temporarily in your browser's local storage.
        They will be cleared when you sign out or clear your browser cache.
        <strong> Make sure to backup your words securely.</strong>
      </p>

      {/* Login Tabs */}
      <h2 className="rebel-login__section-title">Sign in to your wallet</h2>

      <div className="rebel-login__tabs">
        <button
          type="button"
          className={`rebel-login__tab ${activeTab === 'recover' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('recover')}
        >
          Recovery Wallet
        </button>
        <button
          type="button"
          className={`rebel-login__tab ${activeTab === 'create' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          Create new Wallet
        </button>
        <button
          type="button"
          className={`rebel-login__tab ${activeTab === 'esp32' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('esp32')}
        >
          Esp32 HW
        </button>
        <button
          type="button"
          className={`rebel-login__tab ${activeTab === 'help' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('help')}
        >
          Help
        </button>
      </div>

      {/* Card for recovery words input */}
      <div className="rebel-login__recovery-card">
        {activeTab === 'recover' && (
          <h2 className="rebel-login__recovery-title">Enter your recovery words</h2>
        )}
        {activeTab === 'create' && (
          <h2 className="rebel-login__recovery-title">Generate new wallet</h2>
        )}
        {activeTab === 'esp32' && (
          <h2 className="rebel-login__recovery-title">Hardware Wallet Access</h2>
        )}
        {activeTab === 'help' && (
          <h2 className="rebel-login__recovery-title">How the Wallet Works</h2>
        )}

        <form onSubmit={onSubmit}>

          {/* ----- CREATE NEW WALLET TAB ----- */}
          {activeTab === 'create' && (
            <>
              <div className="rebel-login__field">
                <label className="rebel-login__label">
                  Number of words for new wallet:
                </label>
                <div className="rebel-login__segmented-control">
                  <button
                    type="button"
                    className={`rebel-login__segment-btn ${wordCount === 12 ? 'is-active' : ''}`}
                    onClick={() => setWordCount(12)}
                  >
                    12 words
                  </button>
                  <button
                    type="button"
                    className={`rebel-login__segment-btn ${wordCount === 24 ? 'is-active' : ''}`}
                    onClick={() => setWordCount(24)}
                  >
                    24 words
                  </button>
                </div>
              </div>

              <button
                id="newWalletButton"
                onClick={newWallet}
                className="secondary rebel-login__full-width rebel-login__mb-1"
              >
                Generare New Words
              </button>

              {createdMnemonic && (
                <div className="rebel-login__field">
                  <label className="rebel-login__label">
                    Your new recovery words:
                  </label>
                  <div className="rebel-login__created-words-box">
                    {createdMnemonic}
                  </div>
                  <p className="rebel-login__muted rebel-login__muted--tight" style={{ marginTop: '0.5rem' }}>
                    ⚠️ Save these words immediately! You will not see them again.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ----- RECOVER WALLET TAB ----- */}
          {activeTab === 'recover' && (
            <>
              <label htmlFor="mnemonic" className="rebel-login__mnemonic-label">
                Recovery words:
              </label>
              <div className="rebel-login__field-with-icon">
                <textarea
                  ref={textareaRef}
                  id="mnemonic"
                  autoComplete="off"
                  placeholder="Enter your 12 or 24 words"
                  className={`${showWords ? "" : "password-field"} rebel-login__mnemonic-textarea`.trim()}
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
                      if (textareaRef.current) {
                        autoResizeTextarea(textareaRef.current);
                      }
                    }, 0);
                  }}
                  className="rebel-login__visibility-toggle rebel-login__visibility-toggle--textarea"
                  aria-label={showWords ? "Hide words" : "Show words"}
                >
                  {showWords ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}

          {/* ----- PASSPHRASE (Valid for Recover and Create) ----- */}
          {(activeTab === 'recover' || activeTab === 'create') && (
            <>
              <label htmlFor="use-passphrase" className="rebel-login__passphrase-toggle">
                <input
                  type="checkbox"
                  id="use-passphrase"
                  name="use-passphrase"
                  role="switch"
                  checked={usePassphrase}
                  onChange={(event) => setUsePassphrase(!usePassphrase)}
                />
                Use passphrase (advanced)
              </label>

              {usePassphrase && (
                <div className="rebel-login__card-muted">
                  <p className="rebel-login__muted rebel-login__muted--tight">
                    💡 A passphrase adds an extra layer of security. It acts as a "13 or 25th word" that generates a different wallet.
                    <strong> Without the exact passphrase, you cannot access this wallet!</strong>
                  </p>
                  <label htmlFor="passphrase" className="rebel-login__passphrase-label">
                    Passphrase:
                  </label>
                  <div className="rebel-login__field-with-icon">
                    <input
                      type={showPassphrase ? "text" : "password"}
                      id="passphrase"
                      autoComplete="off"
                      placeholder="Enter your passphrase"
                      className="rebel-login__input-with-icon"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphrase(!showPassphrase)}
                      className="rebel-login__visibility-toggle rebel-login__visibility-toggle--input"
                      aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                    >
                      {showPassphrase ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ----- ESP32 TAB ----- */}
          {activeTab === 'esp32' && (
            <div className="rebel-login__esp32-card" style={{ marginTop: 0, border: 'none', background: 'transparent', padding: 0 }}>
              {/* Reusing existing ESP32 UI logic here but inline */}
              <p className="rebel-login__muted">
                Store your recovery words securely on an ESP32 device. Connect via USB to save or load wallets.
              </p>

              {!esp32Connected ? (
                <button
                  type="button"
                  onClick={connectESP32}
                  className="rebel-login__full-width"
                >
                  📱 Connect ESP32
                </button>
              ) : (
                <>
                  <div className="rebel-login__button-grid">
                    <button
                      type="button"
                      onClick={saveToESP32}
                      className="secondary rebel-login__full-width"
                    >
                      💾 Save to ESP32
                    </button>

                    {esp32Keys.length > 0 && (
                      <>
                        <div>
                          <label htmlFor="esp32-key-select" className="rebel-login__bold-label">
                            Select wallet to load:
                          </label>
                          <select
                            id="esp32-key-select"
                            value={selectedKey}
                            onChange={(e) => setSelectedKey(e.target.value)}
                            className="rebel-login__full-width"
                          >
                            <option value="">-- Select a wallet --</option>
                            {esp32Keys.map((key) => (
                              <option key={key} value={key}>{key}</option>
                            ))}
                          </select>
                        </div>

                        <div className="rebel-login__button-grid-2">
                          <button
                            type="button"
                            onClick={loadFromESP32}
                            disabled={!selectedKey}
                            className="rebel-login__full-width"
                          >
                            📖 Load
                          </button>
                          <button
                            type="button"
                            onClick={deleteFromESP32}
                            disabled={!selectedKey}
                            className="secondary rebel-login__full-width rebel-login__danger-button"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={disconnectESP32}
                      className="secondary rebel-login__full-width"
                    >
                      🔌 Disconnect ESP32
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={loadESP32Keys}
                    className="secondary rebel-login__refresh-button"
                  >
                    🔄 Refresh List
                  </button>
                </>
              )}

              {esp32Status && (
                <div className="rebel-login__status">
                  {esp32Status}
                </div>
              )}
            </div>
          )}

          {/* ----- SUBMIT BUTTON (Only for Recover and Create) ----- */}
          {/* ----- HELP / INFO TAB ----- */}
          {activeTab === 'help' && (
            <div className="rebel-login__how-content" style={{ border: 'none', background: 'transparent', padding: '0 1rem' }}>
              <div className="rebel-login__card-muted" style={{ marginTop: 0 }}>
                <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>Wallet Setup & Security</h4>
                <p className="rebel-login__muted">
                  <strong>Create or Import:</strong> You can generate a new 12 or 24-word recovery phrase (mnemonic) or import an existing one. This phrase is the master key to your funds.
                </p>
                <p className="rebel-login__muted">
                  <strong>BIP39 Passphrase:</strong> Add an extra layer of security with an optional passphrase. In BIP39, this serves as a "13th/25th word", meaning the same mnemonic with a different passphrase will lead to a completely different wallet.
                </p>

                <h4 style={{ color: 'var(--primary)' }}>Privacy First Architecture</h4>
                <p className="rebel-login__muted">
                  <strong>Zero-Leak Policy:</strong> Your recovery words and passphrases never leave your device. All sensitive operations, including encryption and transaction signing, are executed locally within your browser's memory.
                </p>

                <h4 style={{ color: 'var(--primary)' }}>DePIN & IoT Integration</h4>
                <p className="rebel-login__muted">
                  <strong>Advanced Features:</strong> Beyond standard XNA transfers, this wallet supports Decentralized Physical Infrastructure Networks (DePIN) and IoT device management, allowing for secure peer-to-peer communication.
                </p>

                <h4 style={{ color: 'var(--primary)' }}>Secure Login Options</h4>
                <p className="rebel-login__muted">
                  <strong>ESP32 Hardware:</strong> For enhanced protection against keyloggers, you can use an ESP32 device to store and inject your encrypted keys directly via USB.
                </p>

                <p className="rebel-login__how-warning" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  ⚠️ <strong>CRITICAL:</strong> Neurai cannot recover your wallet. If you lose your recovery words, your funds are gone forever. Always keep physical backups in a safe place.
                </p>
              </div>
            </div>
          )}

          {(activeTab === 'recover' || activeTab === 'create') && (
            <div className="grid rebel-login__form-actions">
              <input type="submit" value="Sign in" />
            </div>
          )}

        </form>
      </div>

      {/* ESP32 Quick Login Section */}
      <div className="rebel-login__quick-card">
        <h2 className="rebel-login__quick-title">
          ⚡ Quick Login with ESP32
        </h2>

        <p className="rebel-login__quick-desc">
          Connect your ESP32 device and log in directly using a saved wallet.
        </p>

        {!esp32QuickConnected ? (
          <button
            type="button"
            onClick={connectESP32Quick}
            className="rebel-login__full-width"
          >
            🔌 Connect ESP32
          </button>
        ) : (
          <>
            {esp32QuickKeys.length > 0 && (
              <>
                <div className="rebel-login__select-row">
                  <label htmlFor="esp32-quick-key-select" className="rebel-login__bold-label">
                    Select wallet:
                  </label>
                  <select
                    id="esp32-quick-key-select"
                    value={selectedQuickKey}
                    onChange={async (e) => {
                      const newKey = e.target.value;
                      setSelectedQuickKey(newKey);

                      if (newKey) {
                        // Auto-load wallet info when selected
                        try {
                          setEsp32QuickStatus(`📖 Loading "${newKey}"...`);
                          const result = await esp32QuickStorage.read(newKey);

                          if (result.status === "success" && result.value) {
                            let data = result.value;

                            // Ask for PIN to decrypt
                            const pin = prompt(`Enter PIN to decrypt wallet "${newKey}":`);
                            if (!pin) {
                              setEsp32QuickStatus("❌ PIN required to decrypt wallet");
                              setSelectedQuickKey(""); // Reset selection
                              return;
                            }

                            try {
                              // Try to decrypt the data with the provided PIN
                              const decryptedBytes = CryptoJS.AES.decrypt(data, pin);
                              const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);

                              if (!decryptedText || decryptedText.trim() === "") {
                                throw new Error("Invalid PIN or corrupted data");
                              }

                              data = decryptedText;
                            } catch (decryptError) {
                              setEsp32QuickStatus("❌ Failed to decrypt: Invalid PIN");
                              alert("Invalid PIN. Please try again.");
                              setSelectedQuickKey(""); // Reset selection
                              return;
                            }

                            // Now process the decrypted data as raw entropy hex
                            try {
                              const entropyHex = data.trim();
                              const mnemonicWords = NeuraiKey.entropyToMnemonic(entropyHex);
                              setLoadedMnemonic(mnemonicWords);
                              setLoadedPassphrase("");
                              setQuickPassphraseInput("");
                              setShowQuickPassphrase(false);

                              const wordCount = mnemonicWords.trim().split(/\s+/).length;
                              setMnemonicWordCount(wordCount);
                              setEsp32QuickStatus(`✅ Loaded "${newKey}" - ${wordCount} words`);
                            } catch (e) {
                              setEsp32QuickStatus("❌ Error: Invalid data format on device (expected raw BIP39 entropy hex)");
                              setSelectedQuickKey("");
                            }
                          }
                        } catch (error: any) {
                          setEsp32QuickStatus("❌ Error loading: " + error.message);
                          console.error("ESP32 Quick read error:", error);
                        }
                      } else {
                        // Clear previous data when deselecting
                        setLoadedMnemonic("");
                        setLoadedPassphrase("");
                        setMnemonicWordCount(0);
                        setShowQuickPassphrase(false);
                      }
                    }}
                    className="rebel-login__full-width"
                  >
                    <option value="">-- Select a wallet --</option>
                    {esp32QuickKeys.map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>

                {loadedMnemonic && (
                  <div className="rebel-login__wallet-info">
                    <h3 className="rebel-login__wallet-info-title">
                      Wallet Information
                    </h3>

                    <div className="rebel-login__wallet-info-row">
                      <strong>Word Count:</strong>{' '}
                      <span className="rebel-login__primary-text">
                        {mnemonicWordCount} words
                      </span>
                    </div>

                    <div>
                      <label htmlFor="quick-passphrase" className="rebel-login__bold-label">
                        Passphrase (optional):
                      </label>
                      <div className="rebel-login__field-with-icon">
                        <input
                          type={showQuickPassphraseText ? "text" : "password"}
                          id="quick-passphrase"
                          value={quickPassphraseInput}
                          onChange={(e) => setQuickPassphraseInput(e.target.value)}
                          placeholder="Enter passphrase if needed"
                          autoComplete="off"
                          className="rebel-login__input-with-icon"
                        />
                        <button
                          type="button"
                          onClick={() => setShowQuickPassphraseText(!showQuickPassphraseText)}
                          className="rebel-login__visibility-toggle rebel-login__visibility-toggle--input"
                          aria-label={showQuickPassphraseText ? "Hide passphrase" : "Show passphrase"}
                        >
                          {showQuickPassphraseText ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                              <line x1="1" y1="1" x2="23" y2="23"></line>
                            </svg>
                          )}
                        </button>
                      </div>
                      <small className="rebel-login__help">
                        {showQuickPassphrase ? '💡 Passphrase loaded from ESP32. You can modify it if needed.' : '💡 No passphrase stored. You can add one here if required.'}
                      </small>
                    </div>
                  </div>
                )}

                {loadedMnemonic && (
                  <button
                    type="button"
                    onClick={loginWithESP32Wallet}
                    className="rebel-login__full-width rebel-login__mb-1"
                  >
                    🚀 Sign In with this Wallet
                  </button>
                )}
              </>
            )}

            <div className="rebel-login__quick-actions">
              <button
                type="button"
                onClick={loadESP32QuickKeys}
                className="secondary rebel-login__full-width"
              >
                🔄 Refresh
              </button>
              <button
                type="button"
                onClick={disconnectESP32Quick}
                className="secondary rebel-login__full-width"
              >
                🔌 Disconnect
              </button>
            </div>
          </>
        )}

        {esp32QuickStatus && (
          <div className="rebel-login__status">
            {esp32QuickStatus}
          </div>
        )}
      </div>
    </article>
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
    <dialog open>
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
