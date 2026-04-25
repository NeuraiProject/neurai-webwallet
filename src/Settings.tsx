import React from "react";

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
      if (confirm("RPC configuration saved. The wallet needs to reload to apply changes. Reload now?")) {
        window.location.reload();
      }
    } else {
      localStorage.removeItem("rpc_config");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
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
    ? mnemonicOnly.trim().split(/\s+/).filter((w: string) => w.length > 0).length
    : 0;
  const wordsText = wordCount === 24 ? "24 words" : "12 words";

  const canSignOut = typeof signOut === "function";
  const canCopyMnemonic = !!safeMnemonic;
  const showWalletSection = canSignOut || canCopyMnemonic;

  return (
    <div className="neurai-card neurai-stack">
      <h3 className="text-xl font-bold m-0">Network</h3>
      <div className="rounded-md bg-base-100 border border-base-300 p-3">
        <p className="m-0">
          <strong>Current network:</strong> {networkLabel}{" "}
          <small className="text-base-content/60">({network})</small>
        </p>
        <small className="block mt-2 text-base-content/70">
          To switch networks, sign out and pick a different one on the login screen.
          Each network keeps its own seed file in this browser.
        </small>
      </div>

      <hr className="neurai-divider" />

      <h3 className="text-xl font-bold m-0">RPC Server Configuration</h3>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={useCustomRPC}
          onChange={(e) => setUseCustomRPC(e.target.checked)}
          className="checkbox checkbox-sm checkbox-primary"
        />
        <span>Use custom RPC server</span>
      </label>

      {useCustomRPC ? (
        <>
          <div>
            <label htmlFor="rpcUrl" className="neurai-label">RPC URL</label>
            <input
              type="text"
              id="rpcUrl"
              className="neurai-input"
              placeholder="https://your-rpc-server.com/rpc"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              required
            />
            <p className="neurai-hint">Enter the full URL of your custom RPC server (including /rpc path)</p>
          </div>

          <div>
            <label htmlFor="rpcUsername" className="neurai-label">RPC Username (optional)</label>
            <input
              type="text"
              id="rpcUsername"
              className="neurai-input"
              placeholder="username"
              value={rpcUsername}
              onChange={(e) => setRpcUsername(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="rpcPassword" className="neurai-label">RPC Password (optional)</label>
            <input
              type="password"
              id="rpcPassword"
              className="neurai-input"
              placeholder="password"
              value={rpcPassword}
              onChange={(e) => setRpcPassword(e.target.value)}
            />
          </div>
        </>
      ) : (
        <div className="rounded-md bg-base-100 border border-base-300 p-3">
          <p className="m-0">
            <strong>Default RPC for {networkLabel}:</strong>{" "}
            {isTestnetNetwork ? DEFAULT_RPC_TESTNET : DEFAULT_RPC_MAINNET}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="neurai-btn--primary" onClick={handleSave}>
          Save Configuration
        </button>
        <button type="button" className="neurai-btn--secondary" onClick={handleReset}>
          Reset to Default
        </button>
      </div>

      {saveSuccess && (
        <div className="rounded-md bg-success/15 text-success px-3 py-2 text-sm">
          Configuration saved successfully!
        </div>
      )}

      {showWalletSection && (
        <>
          <hr className="neurai-divider" />
          <h3 className="text-xl font-bold m-0">Wallet</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {canSignOut && (
              <button type="button" className="neurai-btn--primary" onClick={signOut}>
                Sign out
              </button>
            )}
            {canCopyMnemonic && (
              <button
                type="button"
                className="neurai-btn--secondary"
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

      <div className="text-sm text-base-content/80 mt-2">
        <h4 className="font-semibold mb-1">Important Notes:</h4>
        <ul className="list-disc pl-6 space-y-1">
          <li>Make sure your custom RPC server is compatible with Neurai</li>
          <li>The wallet will need to reload after changing RPC settings</li>
          <li>If you cannot connect, reset to default settings</li>
          <li>
            <strong>Security:</strong> Your custom RPC server must use HTTPS (not HTTP).
            For localhost/local nodes, HTTP is allowed (http://localhost:* or http://127.0.0.1:*).
          </li>
        </ul>
      </div>
    </div>
  );
}
