import React from "react";
import "./Settings.css";

interface RPCConfig {
  url: string;
  username: string;
  password: string;
}

const DEFAULT_RPC_MAINNET = "https://rpc-depin.neurai.org/rpc";
const DEFAULT_RPC_TESTNET = "https://rpc-testnet.neurai.org/rpc";

export function Settings() {
  const [rpcUrl, setRpcUrl] = React.useState("");
  const [rpcUsername, setRpcUsername] = React.useState("");
  const [rpcPassword, setRpcPassword] = React.useState("");
  const [useCustomRPC, setUseCustomRPC] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

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

  return (
    <article>
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
