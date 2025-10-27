import NeuraiKey from "@neuraiproject/neurai-key";
import React, { FormEvent } from "react";
import { LightModeToggle } from "./components/LightModeToggle";
import { setMnemonic } from "./utils";

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
