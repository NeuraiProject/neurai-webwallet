import React from "react";
import "./Settings.css";

interface RPCConfig {
  url: string;
  username: string;
  password: string;
}

const DEFAULT_RPC_MAINNET = "https://rpc-depin.neurai.org/rpc";
const DEFAULT_RPC_TESTNET = "https://rpc-testnet.neurai.org/rpc";

export function Settings({
  signOut,
  mnemonic,
  isFromESP32 = false,
}: {
  signOut?: () => void;
  mnemonic?: string;
  isFromESP32?: boolean;
}) {
  const [rpcUrl, setRpcUrl] = React.useState("");
  const [rpcUsername, setRpcUsername] = React.useState("");
  const [rpcPassword, setRpcPassword] = React.useState("");
  const [useCustomRPC, setUseCustomRPC] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [useLegacyDerivation, setUseLegacyDerivation] = React.useState(false);

  // Load saved settings on mount
  React.useEffect(() => {
    const savedConfig = localStorage.getItem("rpc_config");
    if (savedConfig) {
      try {
        const config: RPCConfig = JSON.parse(savedConfig);
        setRpcUrl(config.url || "");
        setRpcUsername(config.username || "");
        setRpcPassword(config.password || "");
        setUseCustomRPC(true);
      } catch (e) {
        console.error("Error loading RPC config:", e);
      }
    }

    // Cargar preferencia de derivación
    const savedDerivationType = localStorage.getItem("derivation_type");
    setUseLegacyDerivation(savedDerivationType === "legacy");
  }, []);

  const handleSave = () => {
    if (useCustomRPC) {
      if (!rpcUrl.trim()) {
        alert("Please enter a valid RPC URL");
        return;
      }

      const config: RPCConfig = {
        url: rpcUrl.trim(),
        username: rpcUsername.trim(),
        password: rpcPassword.trim(),
      };

      localStorage.setItem("rpc_config", JSON.stringify(config));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Prompt to reload
      if (confirm("RPC configuration saved. The wallet needs to reload to apply changes. Reload now?")) {
        window.location.reload();
      }
    } else {
      // Remove custom config
      localStorage.removeItem("rpc_config");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Prompt to reload
      if (confirm("Custom RPC configuration removed. The wallet needs to reload to apply changes. Reload now?")) {
        window.location.reload();
      }
    }
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset to default RPC settings?")) {
      localStorage.removeItem("rpc_config");
      setRpcUrl("");
      setRpcUsername("");
      setRpcPassword("");
      setUseCustomRPC(false);
      setSaveSuccess(false);

      if (confirm("Settings reset. The wallet needs to reload to apply changes. Reload now?")) {
        window.location.reload();
      }
    }
  };

  const handleDerivationToggle = (checked: boolean) => {
    const newType = checked ? "legacy" : "standard";
    localStorage.setItem("derivation_type", newType);
    setUseLegacyDerivation(checked);

    // Recargar inmediatamente
    if (confirm("Derivation type changed. The wallet needs to reload to switch addresses. Reload now?")) {
      window.location.reload();
    }
  };

  const isTestnet = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("network") === "xna-test";
  };

  const safeMnemonic = mnemonic ?? "";
  const mnemonicOnly = safeMnemonic.includes("|||") ? safeMnemonic.split("|||")[0] : safeMnemonic;
  const hasPassphrase = safeMnemonic.includes("|||");
  const wordCount = mnemonicOnly
    ? mnemonicOnly
        .trim()
        .split(/\s+/)
        .filter((word: string) => word.length > 0).length
    : 0;
  const wordsText = wordCount === 24 ? "24 words" : "12 words";

  const canSignOut = typeof signOut === "function";
  const canCopyMnemonic = !isFromESP32 && !!safeMnemonic;
  const showWalletSection = canSignOut || canCopyMnemonic;

  return (
    <article>
      <h3>Derivation Type</h3>
      <div className="rebel-settings__card">
        <p>
          <strong>Current network:</strong> {isTestnet() ? "Testnet (xna-test)" : "Mainnet"}
        </p>
        {!isTestnet() && (
          <>
            <div className="rebel-settings__toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={useLegacyDerivation}
                  onChange={(e) => handleDerivationToggle(e.target.checked)}
                />
                Use legacy derivation (BIP44 coin type 0)
              </label>
            </div>
            <div className="rebel-settings__card rebel-settings__derivation-info">
              <small>
                <strong>{useLegacyDerivation ? "Legacy" : "Standard"}:</strong>{" "}
                {useLegacyDerivation
                  ? "m/44'/0'/0'/0/0 (compatible with older wallets)"
                  : "m/44'/1900'/0'/0/0 (recommended for new wallets)"}
              </small>
            </div>
            <div className="rebel-settings__notes" style={{ marginTop: "1rem" }}>
              <h4>Important:</h4>
              <ul>
                <li>
                  <strong>Changing derivation generates different addresses</strong> from the same mnemonic
                </li>
                <li>
                  Use legacy only if you need compatibility with old wallets (before coin type 1900)
                </li>
                <li>
                  The wallet will reload when you change this setting
                </li>
              </ul>
            </div>
          </>
        )}
        {isTestnet() && (
          <small className="rebel-settings__hint">
            Testnet always uses standard derivation (coin type 1900)
          </small>
        )}
      </div>

      <hr className="rebel-settings__divider" />

      <h3>RPC Server Configuration</h3>

      <div className="rebel-settings__toggle-row">
        <label>
          <input
            type="checkbox"
            checked={useCustomRPC}
            onChange={(e) => setUseCustomRPC(e.target.checked)}
            className="rebel-settings__toggle-checkbox"
          />
          Use custom RPC server
        </label>
      </div>

      {useCustomRPC ? (
        <>
          <div className="rebel-settings__field">
            <label htmlFor="rpcUrl">
              RPC URL
              <input
                type="text"
                id="rpcUrl"
                placeholder="https://your-rpc-server.com/rpc"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                required
              />
            </label>
            <small className="rebel-settings__hint">
              Enter the full URL of your custom RPC server (including /rpc path)
            </small>
          </div>

          <div className="rebel-settings__field">
            <label htmlFor="rpcUsername">
              RPC Username (optional)
              <input
                type="text"
                id="rpcUsername"
                placeholder="username"
                value={rpcUsername}
                onChange={(e) => setRpcUsername(e.target.value)}
              />
            </label>
          </div>

          <div className="rebel-settings__field">
            <label htmlFor="rpcPassword">
              RPC Password (optional)
              <input
                type="password"
                id="rpcPassword"
                placeholder="password"
                value={rpcPassword}
                onChange={(e) => setRpcPassword(e.target.value)}
              />
            </label>
          </div>
        </>
      ) : (
        <div className="rebel-settings__card">
          <p><strong>Default RPC Servers:</strong></p>
          <p>Mainnet: {DEFAULT_RPC_MAINNET}</p>
          <p>Testnet: {DEFAULT_RPC_TESTNET}</p>
        </div>
      )}

      <div className="rebel-settings__actions">
        <button onClick={handleSave}>
          Save Configuration
        </button>
        <button onClick={handleReset} className="secondary">
          Reset to Default
        </button>
      </div>

      {saveSuccess && (
        <div className="rebel-settings__success">
          Configuration saved successfully!
        </div>
      )}

      {showWalletSection && (
        <>
          <hr className="rebel-settings__divider" />

          <h3>Wallet</h3>
          <div className={isFromESP32 ? "" : "grid"}>
            {canSignOut && (
              <button
                className={isFromESP32 ? "rebel-settings__signout-full" : undefined}
                onClick={signOut}
              >
                Sign out
              </button>
            )}

            {canCopyMnemonic && (
              <button
                className="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(safeMnemonic);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                disabled={copied}
              >
                {copied
                  ? "Copied!"
                  : `Copy your secret ${wordsText}${hasPassphrase ? " + passphrase" : ""} to memory`}
              </button>
            )}
          </div>
        </>
      )}

      <div className="rebel-settings__notes">
        <h4>Important Notes:</h4>
        <ul>
          <li>Make sure your custom RPC server is compatible with Neurai</li>
          <li>The wallet will need to reload after changing RPC settings</li>
          <li>If you cannot connect, reset to default settings</li>
          <li>
            <strong>Security:</strong> Your custom RPC server must use HTTPS (not HTTP).
            For localhost/local nodes, HTTP is allowed (http://localhost:* or http://127.0.0.1:*).
          </li>
        </ul>
      </div>
    </article>
  );
}
