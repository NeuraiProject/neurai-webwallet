import NeuraiKey from "@neuraiproject/neurai-key";
import React, { FormEvent } from "react";
import { LightModeToggle } from "./components/LightModeToggle";
import { setMnemonic } from "./utils";
import ESP32Storage from "./ESP32Storage";

// @ts-ignore - Parcel handles this correctly
const CryptoJS = require("crypto-js");

//For bundler not to optimize/remove NeuraiKey
console.log("NeuraiKey", !!NeuraiKey);

const neuraiLogo = new URL("../neurai-xna-logo.png", import.meta.url);

export function Login() {
  const [showWords, setShowWords] = React.useState(false);
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [wordCount, setWordCount] = React.useState<12 | 24>(12);
  const [usePassphrase, setUsePassphrase] = React.useState(false);
  const [dialog, setDialog] = React.useState(<></>);
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
  const [isMnemonicValid, setIsMnemonicValid] = React.useState<boolean>(false);
  const [showQuickPassphrase, setShowQuickPassphrase] = React.useState<boolean>(false);
  const [showQuickPassphraseText, setShowQuickPassphraseText] = React.useState<boolean>(false);

  // Auto-resize textarea
  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    autoResizeTextarea(event.target);
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
  }, []);

  function showDialog(title: string, text: string) {
    const onClose = () => setDialog(<></>);
    const d = <Dialog title={title} text={text} onClose={onClose}></Dialog>;
    setDialog(d);
  }
  function newWallet(event: FormEvent) {
    event.preventDefault();
    const element = document.getElementById("mnemonic") as HTMLTextAreaElement;
    if (element?.value) {
      alert("Please clear the input field before creating a new wallet");
      return false;
    }
    if (element) {
      // Generate mnemonic with the selected word count
      if (wordCount === 12) {
        // 12 words = 128 bits of entropy (default)
        element.value = NeuraiKey.generateMnemonic();
      } else if (wordCount === 24) {
        // 24 words = 256 bits of entropy
        // Generate 32 bytes (256 bits) of random entropy
        const entropy = new Uint8Array(32);
        crypto.getRandomValues(entropy);
        // Convert to hex string
        const entropyHex = Array.from(entropy)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        // Use NeuraiKey's entropyToMnemonic (from bip39)
        element.value = NeuraiKey.entropyToMnemonic(entropyHex);
      }
      // Auto-resize after setting value
      autoResizeTextarea(element);
    }
    showDialog(
      "WARNING",
      `Make sure you save these ${wordCount} words somewhere safe${usePassphrase ? ' along with your passphrase' : ''}. Next, click Sign in`
    );

    return false;
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault();

    const mnemonicInput = document.getElementById("mnemonic") as HTMLFormElement;
    if (!mnemonicInput) {
      return null;
    }
    const value = mnemonicInput.value.trim();

    const isValid = NeuraiKey.isMnemonicValid(value);

    if (isValid === false) {
      const wordCountInInput = value.split(" ").filter((w: string) => w.length > 0).length;
      alert(`Given input does not seem to be valid words for a Neurai wallet. You entered ${wordCountInInput} words.`);
      setMnemonic(value);
      window.location.reload();
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
      setMnemonic(mnemonicData);
      window.location.reload();
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
    
    // Get passphrase if enabled
    let passphrase = "";
    if (usePassphrase) {
      const passphraseInput = document.getElementById("passphrase") as HTMLInputElement;
      if (passphraseInput) {
        passphrase = passphraseInput.value;
      }
    }

    // Create data to save
    const dataToSave = passphrase ? `${mnemonic}|||${passphrase}` : mnemonic;
    
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
      setEsp32Status("� Encrypting and saving to ESP32...");
      
      // Encrypt the data with the PIN using AES
      const encryptedData = CryptoJS.AES.encrypt(dataToSave, pin).toString();
      
      await esp32Storage.save(keyName.trim(), encryptedData);
      setEsp32Status(`✅ Saved as "${keyName}" (encrypted)`);
      
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
        
        // Now process the decrypted data
        // Check if it has passphrase
        if (data.includes("|||")) {
          const [mnemonic, passphrase] = data.split("|||");
          
          // Set mnemonic
          const mnemonicInput = document.getElementById("mnemonic") as HTMLTextAreaElement;
          if (mnemonicInput) {
            mnemonicInput.value = mnemonic;
            autoResizeTextarea(mnemonicInput);
          }
          
          // Enable and set passphrase
          setUsePassphrase(true);
          setTimeout(() => {
            const passphraseInput = document.getElementById("passphrase") as HTMLInputElement;
            if (passphraseInput) {
              passphraseInput.value = passphrase;
            }
          }, 100);
          
          setEsp32Status(`✅ Loaded "${selectedKey}" (with passphrase)`);
        } else {
          // No passphrase
          const mnemonicInput = document.getElementById("mnemonic") as HTMLTextAreaElement;
          if (mnemonicInput) {
            mnemonicInput.value = data;
            autoResizeTextarea(mnemonicInput);
          }
          setEsp32Status(`✅ Loaded "${selectedKey}"`);
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
      setIsMnemonicValid(false);
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
        
        // Now process the decrypted data
        // Check if it has passphrase
        if (data.includes("|||")) {
          const [mnemonic, passphrase] = data.split("|||");
          setLoadedMnemonic(mnemonic);
          setLoadedPassphrase(passphrase);
          setQuickPassphraseInput(passphrase);
          setShowQuickPassphrase(true);
          
          // Validate mnemonic
          const isValid = NeuraiKey.isMnemonicValid(mnemonic);
          setIsMnemonicValid(isValid);
          
          // Count words
          const wordCount = mnemonic.trim().split(/\s+/).length;
          setMnemonicWordCount(wordCount);
          
          setEsp32QuickStatus(`✅ Loaded "${selectedQuickKey}" - ${wordCount} words (with passphrase) - ${isValid ? '✅ Valid' : '❌ Invalid'}`);
        } else {
          // No passphrase
          setLoadedMnemonic(data);
          setLoadedPassphrase("");
          setQuickPassphraseInput("");
          setShowQuickPassphrase(false);
          
          // Validate mnemonic
          const isValid = NeuraiKey.isMnemonicValid(data);
          setIsMnemonicValid(isValid);
          
          // Count words
          const wordCount = data.trim().split(/\s+/).length;
          setMnemonicWordCount(wordCount);
          
          setEsp32QuickStatus(`✅ Loaded "${selectedQuickKey}" - ${wordCount} words - ${isValid ? '✅ Valid' : '❌ Invalid'}`);
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

    if (!isMnemonicValid) {
      alert("The loaded mnemonic is not valid. Cannot proceed.");
      return;
    }

    // Mark that this login is from ESP32
    localStorage.setItem("loginFromESP32", "true");

    // Use the passphrase from the input field (may be modified by user)
    const finalPassphrase = quickPassphraseInput.trim();
    
    // Store mnemonic with passphrase if exists
    const mnemonicData = finalPassphrase ? `${loadedMnemonic}|||${finalPassphrase}` : loadedMnemonic;
    setMnemonic(mnemonicData);
    window.location.reload();
  }

  return (
    <article>
      <LightModeToggle />
      {dialog}
      
      {/* Hero Section */}
      <header style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '1rem' }}>
        <h1 className="rebel-headline" style={{ marginBottom: '1rem', fontSize: '2.5rem' }}>
          Neurai Web Wallet
        </h1>
        <p style={{ 
          fontSize: '1.2rem', 
          color: 'var(--muted-color)', 
          marginBottom: '2rem',
          maxWidth: '600px',
          margin: '0 auto 2rem'
        }}>
          A secure, client-side wallet for managing your Neurai assets
        </p>
      </header>

      {/* Features Grid */}
      <div 
        className="features-grid"
        style={{
          gap: '1rem',
          marginBottom: '2.5rem'
        }}
      >
        <div style={{
          padding: '1rem',
          backgroundColor: 'rgba(255, 87, 34, 0.08)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255, 87, 34, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ 
            fontSize: '2rem',
            marginBottom: '0.4rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <img 
              src={neuraiLogo.href} 
              alt="Neurai" 
              style={{ height: '48px', width: 'auto' }}
            />
          </div>
          <h3 style={{ marginBottom: '0.4rem', fontSize: '1rem' }}>Neurai</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted-color)', margin: 0 }}>
            Wallet for managing XNA, IoT, NFT, RWA, and more.
          </p>
        </div>
        
        <div style={{
          padding: '1rem',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>🔒</div>
          <h3 style={{ marginBottom: '0.4rem', fontSize: '1rem' }}>Secure</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted-color)', margin: 0 }}>
            Your keys never leave your browser. Everything runs locally.
          </p>
        </div>
        
        <div style={{
          padding: '1rem',
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>⚡</div>
          <h3 style={{ marginBottom: '0.4rem', fontSize: '1rem' }}>Fast</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted-color)', margin: 0 }}>
            Send and receive Neurai and assets instantly.
          </p>
        </div>
        
        <div style={{
          padding: '1rem',
          backgroundColor: 'rgba(168, 85, 247, 0.08)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>🌐</div>
          <h3 style={{ marginBottom: '0.4rem', fontSize: '1rem' }}>Web-Based</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted-color)', margin: 0 }}>
            Access your wallet from any device with a browser.
          </p>
        </div>
      </div>

      {/* How it works */}
      <details style={{ marginBottom: '2rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
          How does it work?
        </summary>
        <div style={{ 
          marginTop: '1rem', 
          padding: '1rem', 
          backgroundColor: 'var(--code-background-color)',
          borderRadius: '0.5rem',
          borderLeft: '3px solid var(--primary)'
        }}>
          <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Create or import a wallet</strong> using 12 or 24 recovery words
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Optional passphrase</strong> - add an extra layer of security with a BIP39 passphrase (acts as a "13th/25th word")
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Your keys stay private</strong> - they're encrypted and stored locally in your browser
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              <strong>Manage your assets</strong> - send, receive, and view your Neurai tokens
            </li>
            <li style={{ marginBottom: '0' }}>
              <strong>Sign out</strong> - your session data is cleared when you leave
            </li>
          </ol>
          <p style={{ 
            marginTop: '1rem', 
            marginBottom: 0, 
            padding: '0.75rem', 
            backgroundColor: 'var(--card-background-color)',
            borderRadius: '0.25rem',
            fontSize: '0.9rem'
          }}>
            ⚠️ <strong>Important:</strong> Always backup your recovery words. They cannot be recovered if lost!
          </p>
        </div>
      </details>

      <hr style={{ marginBottom: '2rem' }} />

      {/* Login Form */}
      <h2 style={{ marginBottom: '1rem' }}>Sign in to your wallet</h2>
      <p style={{ 
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'var(--code-background-color)',
        borderRadius: '0.5rem',
        fontSize: '0.95rem'
      }}>
        <strong>📌 Privacy notice:</strong> Your recovery words are encrypted and stored temporarily in your browser's local storage. 
        They will be cleared when you sign out or clear your browser cache. 
        <strong> Make sure to backup your words securely.</strong>
      </p>
      
      {/* Card for recovery words input */}
      <div style={{
        padding: '2rem',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '0.75rem',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Enter your recovery words</h2>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold' }}>
              Number of words for new wallet:
            </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            justifyContent: 'center'
          }}>
            <span style={{ 
              fontWeight: wordCount === 12 ? 'bold' : 'normal',
              color: wordCount === 12 ? 'var(--primary)' : 'var(--muted-color)'
            }}>
              12 words
            </span>
            <label style={{
              position: 'relative',
              display: 'inline-block',
              width: '60px',
              height: '34px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={wordCount === 24}
                onChange={() => setWordCount(wordCount === 12 ? 24 : 12)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: wordCount === 24 ? 'var(--pico-primary-background)' : 'var(--pico-switch-background-color)',
                borderRadius: '34px',
                transition: '0.4s'
              }}>
                <span style={{
                  position: 'absolute',
                  content: '""',
                  height: '26px',
                  width: '26px',
                  left: wordCount === 24 ? '30px' : '4px',
                  bottom: '4px',
                  backgroundColor: 'var(--pico-switch-color)',
                  borderRadius: '50%',
                  transition: '0.4s',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
              </span>
            </label>
            <span style={{ 
              fontWeight: wordCount === 24 ? 'bold' : 'normal',
              color: wordCount === 24 ? 'var(--primary)' : 'var(--muted-color)'
            }}>
              24 words
            </span>
          </div>
        </div>
        
        <label htmlFor="mnemonic" style={{ fontWeight: 'bold', display: 'block', marginTop: '1.5rem' }}>
          Recovery words:
        </label>
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            id="mnemonic"
            autoComplete="off"
            placeholder="Enter your 12 or 24 words"
            className={showWords ? '' : 'password-field'}
            onChange={handleTextareaChange}
            onInput={handleTextareaInput}
            onFocus={(e) => autoResizeTextarea(e.currentTarget)}
            style={{ 
              paddingRight: '3rem',
              minHeight: 'auto',
              maxHeight: 'none',
              height: 'auto',
              resize: 'none',
              overflow: 'auto',
              overflowY: 'hidden',
              boxSizing: 'border-box',
              lineHeight: '1.5'
            }}
            rows={1}
          />
          <button
            type="button"
            onClick={() => {
              setShowWords(!showWords);
              // Update height after visibility change
              setTimeout(() => {
                if (textareaRef.current) {
                  autoResizeTextarea(textareaRef.current);
                }
              }, 0);
            }}
            style={{
              position: 'absolute',
              right: '0.5rem',
              top: '0.5rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted-color)'
            }}
            aria-label={showWords ? "Hide words" : "Show words"}
          >
            {showWords ? (
              // Eye open icon
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            ) : (
              // Eye closed icon (with slash)
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            )}
          </button>
        </div>
        
        <label htmlFor="use-passphrase" style={{ marginTop: '1rem' }}>
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

        {/* Passphrase Section */}
        {usePassphrase && (
          <div style={{ 
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: 'var(--code-background-color)',
            borderRadius: '0.5rem',
            border: '1px solid var(--muted-border-color)'
          }}>
            <p style={{ 
              fontSize: '0.9rem', 
              color: 'var(--muted-color)',
              marginBottom: '0.75rem',
              marginTop: 0
            }}>
              💡 A passphrase adds an extra layer of security. It acts as a "13 or 25th word" that generates a different wallet.
              <strong> Without the exact passphrase, you cannot access this wallet!</strong>
            </p>
            <label htmlFor="passphrase" style={{ fontWeight: 'bold' }}>
              Passphrase:
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassphrase ? "text" : "password"}
                id="passphrase"
                autoComplete="off"
                placeholder="Enter your passphrase"
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '0',
                  bottom: '0',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted-color)'
                }}
                aria-label={showPassphrase ? "Hide passphrase" : "Show passphrase"}
              >
                {showPassphrase ? (
                  // Eye open icon
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                ) : (
                  // Eye closed icon (with slash)
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ESP32 Storage Section */}
        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          backgroundColor: 'var(--code-background-color)',
          borderRadius: '0.5rem',
          border: '1px solid var(--muted-border-color)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔌 ESP32 Hardware Storage
          </h3>
          
          <p style={{ 
            fontSize: '0.9rem', 
            color: 'var(--muted-color)',
            marginBottom: '1rem'
          }}>
            Store your recovery words securely on an ESP32 device. Connect via USB to save or load wallets.
          </p>

          {!esp32Connected ? (
            <button
              type="button"
              onClick={connectESP32}
              style={{ width: '100%' }}
            >
              📱 Connect ESP32
            </button>
          ) : (
            <>
              <div style={{ 
                display: 'grid', 
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <button
                  type="button"
                  onClick={saveToESP32}
                  className="secondary"
                  style={{ width: '100%' }}
                >
                  💾 Save to ESP32
                </button>
                
                {esp32Keys.length > 0 && (
                  <>
                    <div>
                      <label htmlFor="esp32-key-select" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Select wallet to load:
                      </label>
                      <select
                        id="esp32-key-select"
                        value={selectedKey}
                        onChange={(e) => setSelectedKey(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">-- Select a wallet --</option>
                        {esp32Keys.map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={loadFromESP32}
                        disabled={!selectedKey}
                        style={{ width: '100%' }}
                      >
                        📖 Load
                      </button>
                      <button
                        type="button"
                        onClick={deleteFromESP32}
                        disabled={!selectedKey}
                        className="secondary"
                        style={{ 
                          width: '100%',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          borderColor: 'rgba(239, 68, 68, 0.3)'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </>
                )}
                
                <button
                  type="button"
                  onClick={disconnectESP32}
                  className="secondary"
                  style={{ width: '100%' }}
                >
                  🔌 Disconnect ESP32
                </button>
              </div>
              
              <button
                type="button"
                onClick={loadESP32Keys}
                className="secondary"
                style={{ 
                  width: '100%',
                  fontSize: '0.85rem',
                  padding: '0.5rem'
                }}
              >
                🔄 Refresh List
              </button>
            </>
          )}

          {esp32Status && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: 'var(--card-background-color)',
              borderRadius: '0.25rem',
              fontSize: '0.9rem',
              wordBreak: 'break-word'
            }}>
              {esp32Status}
            </div>
          )}
        </div>

        <div className="grid" style={{ marginTop: 40 }}>
          <input type="submit" value="Sign in" />{" "}
          <button
            id="newWalletButton"
            onClick={newWallet}
            className="secondary"
          >
            Create a new wallet
          </button>
        </div>
      </form>
      </div>

      {/* ESP32 Quick Login Section */}
      <div style={{
        marginTop: '3rem',
        padding: '2rem',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderRadius: '0.75rem',
        border: '2px solid rgba(34, 197, 94, 0.3)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚡ Quick Login with ESP32
        </h2>
        
        <p style={{ 
          fontSize: '0.95rem', 
          color: 'var(--muted-color)',
          marginBottom: '1.5rem'
        }}>
          Connect your ESP32 device and log in directly using a saved wallet.
        </p>

        {!esp32QuickConnected ? (
          <button
            type="button"
            onClick={connectESP32Quick}
            style={{ width: '100%' }}
          >
            🔌 Connect ESP32
          </button>
        ) : (
          <>
            {esp32QuickKeys.length > 0 && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="esp32-quick-key-select" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
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
                            
                            // Now process the decrypted data
                            // Check if it has passphrase
                            if (data.includes("|||")) {
                              const [mnemonic, passphrase] = data.split("|||");
                              setLoadedMnemonic(mnemonic);
                              setLoadedPassphrase(passphrase);
                              setQuickPassphraseInput(passphrase);
                              setShowQuickPassphrase(true);
                              
                              // Validate mnemonic
                              const isValid = NeuraiKey.isMnemonicValid(mnemonic);
                              setIsMnemonicValid(isValid);
                              
                              // Count words
                              const wordCount = mnemonic.trim().split(/\s+/).length;
                              setMnemonicWordCount(wordCount);
                              
                              setEsp32QuickStatus(`✅ Loaded "${newKey}" - ${wordCount} words - ${isValid ? '✅ Valid' : '❌ Invalid'}`);
                            } else {
                              // No passphrase
                              setLoadedMnemonic(data);
                              setLoadedPassphrase("");
                              setQuickPassphraseInput("");
                              setShowQuickPassphrase(false);
                              
                              // Validate mnemonic
                              const isValid = NeuraiKey.isMnemonicValid(data);
                              setIsMnemonicValid(isValid);
                              
                              // Count words
                              const wordCount = data.trim().split(/\s+/).length;
                              setMnemonicWordCount(wordCount);
                              
                              setEsp32QuickStatus(`✅ Loaded "${newKey}" - ${wordCount} words - ${isValid ? '✅ Valid' : '❌ Invalid'}`);
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
                        setIsMnemonicValid(false);
                        setShowQuickPassphrase(false);
                      }
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="">-- Select a wallet --</option>
                    {esp32QuickKeys.map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>

                {loadedMnemonic && (
                  <div style={{
                    padding: '1.5rem',
                    backgroundColor: 'var(--card-background-color)',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--muted-border-color)',
                    marginBottom: '1rem'
                  }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>
                      Wallet Information
                    </h3>
                    
                    <div style={{ marginBottom: '0.75rem' }}>
                      <strong>Word Count:</strong>{' '}
                      <span style={{ 
                        color: mnemonicWordCount === 12 || mnemonicWordCount === 24 ? 'var(--primary)' : 'var(--muted-color)' 
                      }}>
                        {mnemonicWordCount} words
                      </span>
                    </div>
                    
                    <div style={{ marginBottom: '1rem' }}>
                      <strong>Validation:</strong>{' '}
                      <span style={{ 
                        color: isMnemonicValid ? '#22c55e' : '#ef4444',
                        fontWeight: 'bold'
                      }}>
                        {isMnemonicValid ? '✅ Valid Mnemonic' : '❌ Invalid Mnemonic'}
                      </span>
                    </div>
                    
                    <div>
                      <label htmlFor="quick-passphrase" style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
                        Passphrase (optional):
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showQuickPassphraseText ? "text" : "password"}
                          id="quick-passphrase"
                          value={quickPassphraseInput}
                          onChange={(e) => setQuickPassphraseInput(e.target.value)}
                          placeholder="Enter passphrase if needed"
                          autoComplete="off"
                          style={{ paddingRight: '3rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowQuickPassphraseText(!showQuickPassphraseText)}
                          style={{
                            position: 'absolute',
                            right: '0.5rem',
                            top: '0',
                            bottom: '0',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--muted-color)'
                          }}
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
                      <small style={{ color: 'var(--muted-color)', display: 'block', marginTop: '0.5rem' }}>
                        {showQuickPassphrase ? '💡 Passphrase loaded from ESP32. You can modify it if needed.' : '💡 No passphrase stored. You can add one here if required.'}
                      </small>
                    </div>
                  </div>
                )}

                {loadedMnemonic && isMnemonicValid && (
                  <button
                    type="button"
                    onClick={loginWithESP32Wallet}
                    style={{ 
                      width: '100%',
                      marginBottom: '1rem'
                    }}
                  >
                    🚀 Sign In with this Wallet
                  </button>
                )}
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={loadESP32QuickKeys}
                className="secondary"
                style={{ width: '100%' }}
              >
                🔄 Refresh
              </button>
              <button
                type="button"
                onClick={disconnectESP32Quick}
                className="secondary"
                style={{ width: '100%' }}
              >
                🔌 Disconnect
              </button>
            </div>
          </>
        )}

        {esp32QuickStatus && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--card-background-color)',
            borderRadius: '0.25rem',
            fontSize: '0.9rem',
            wordBreak: 'break-word'
          }}>
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
