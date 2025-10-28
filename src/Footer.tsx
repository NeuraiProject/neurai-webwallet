import React from "react";

export function Footer({
  signOut,
  mnemonic,
  isFromESP32 = false
}: {
  signOut: () => void;
  mnemonic: string;
  isFromESP32?: boolean;
}) {
  // Extract just the mnemonic part (without passphrase) for word count
  const mnemonicOnly = mnemonic.includes("|||") ? mnemonic.split("|||")[0] : mnemonic;
  const hasPassphrase = mnemonic.includes("|||");
  
  // Detect if mnemonic has 12 or 24 words
  const wordCount = mnemonicOnly ? mnemonicOnly.trim().split(/\s+/).filter((w: string) => w.length > 0).length : 12;
  const wordsText = wordCount === 24 ? "24 words" : "12 words";
  
  return (
    <article>
      <footer>
        {/* If logged in from ESP32, only show Sign out button (full width) */}
        {/* Otherwise, show both buttons in a grid */}
        {isFromESP32 ? (
          <button onClick={signOut} style={{ width: '100%' }}>
            Sign out
          </button>
        ) : (
          <div className="grid">
            <button onClick={signOut}>Sign out</button>
            <button
              className="secondary"
              onClick={(event) => {
                const target = event.target as HTMLButtonElement;
                // Copy the full mnemonic (including passphrase if present)
                navigator.clipboard.writeText(mnemonic);
                target.disabled = true;
                setInterval(() => (target.disabled = false), 2000);
              }}
            >
              Copy your secret {wordsText}{hasPassphrase ? " + passphrase" : ""} to memory
            </button>
          </div>
        )}
      </footer>
      <div style={{ textAlign: "center", marginTop: "4rem", fontSize: "1rem" }}>
        <p>
          Original version create by{" "}
          <a href="https://twitter.com/RavenRebels" target="_blank">
            Raven Rebels
          </a>
        </p>
        Neurai version  {" "}
        <a href="https://github.com/neuraiproject/neurai-webwallet">
          GitHub
        </a> - 2025
      </div>
    </article>
  );
}
