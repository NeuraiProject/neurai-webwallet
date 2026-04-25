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
}: {
  signOut?: () => void;
  mnemonic?: string;
}) {
  const [rpcUrl, setRpcUrl] = React.useState("");
  const [rpcUsername, setRpcUsername] = React.useState("");
  const [rpcPassword, setRpcPassword] = React.useState("");
  const [useCustomRPC, setUseCustomRPC] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

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

  // Resolve the active network using the same precedence as index.tsx:
  // explicit `wallet_network` first, then the legacy URL/derivation_type
  // fallback. We don't allow changing it from here — the user picks the
  // network from the Login screen.
  const resolveNetwork = (): string => {
    const stored = localStorage.getItem("wallet_network");
    const valid = ["xna", "xna-test", "xna-legacy", "xna-legacy-test", "xna-pq", "xna-pq-test"];
    if (stored && valid.includes(stored)) return stored;

    const params = new URLSearchParams(window.location.search);
    const isTestnetParam = params.get("network") === "xna-test";
    const useLegacy = localStorage.getItem("derivation_type") === "legacy";
    if (isTestnetParam) return useLegacy ? "xna-legacy-test" : "xna-test";
    return useLegacy ? "xna-legacy" : "xna";
  };

  const network = resolveNetwork();
  const isTestnetNetwork =
    network === "xna-test" || network === "xna-legacy-test" || network === "xna-pq-test";

  const networkLabel = (() => {
    switch (network) {
      case "xna-legacy": return "Mainnet Legacy";
      case "xna-pq": return "Mainnet PQ";
      case "xna-legacy-test": return "Testnet Legacy";
      case "xna-pq-test": return "Testnet PQ";
      case "xna-test": return "Testnet";
      case "xna": return "Mainnet";
      default: return network;
    }
  })();

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
  const canCopyMnemonic = !!safeMnemonic;
  const showWalletSection = canSignOut || canCopyMnemonic;

  return (
    <article>
      <h3>Network</h3>
      <div className="rebel-settings__card">
        <p>
          <strong>Current network:</strong> {networkLabel}{" "}
          <small className="rebel-settings__hint">({network})</small>
        </p>
        <small className="rebel-settings__hint">
          To switch networks, sign out and pick a different one on the login screen.
          Each network keeps its own seed file in this browser.
        </small>
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
          <p>
            <strong>Default RPC for {networkLabel}:</strong>{" "}
            {isTestnetNetwork ? DEFAULT_RPC_TESTNET : DEFAULT_RPC_MAINNET}
          </p>
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
          <div className="grid">
            {canSignOut && (
              <button onClick={signOut}>
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
