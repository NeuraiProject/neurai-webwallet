import React from "react";

interface RPCConfig {
  url: string;
  username: string;
  password: string;
}

const DEFAULT_RPC_MAINNET = "https://rpc-main.neurai.org/rpc";
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

      <div style={{ marginBottom: "1.5rem" }}>
        <label>
          <input
            type="checkbox"
            checked={useCustomRPC}
            onChange={(e) => setUseCustomRPC(e.target.checked)}
            style={{ marginRight: "0.5rem" }}
          />
          Use custom RPC server
        </label>
      </div>

      {useCustomRPC ? (
        <>
          <div style={{ marginBottom: "1rem" }}>
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
            <small style={{ color: "var(--muted-color)" }}>
              Enter the full URL of your custom RPC server (including /rpc path)
            </small>
          </div>

          <div style={{ marginBottom: "1rem" }}>
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

          <div style={{ marginBottom: "1rem" }}>
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
        <div style={{
          padding: "1rem",
          backgroundColor: "var(--card-background-color)",
          borderRadius: "4px",
          marginBottom: "1rem"
        }}>
          <p><strong>Default RPC Servers:</strong></p>
          <p style={{ margin: "0.5rem 0" }}>Mainnet: {DEFAULT_RPC_MAINNET}</p>
          <p style={{ margin: "0.5rem 0" }}>Testnet: {DEFAULT_RPC_TESTNET}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
        <button onClick={handleSave}>
          Save Configuration
        </button>
        <button onClick={handleReset} className="secondary">
          Reset to Default
        </button>
      </div>

      {saveSuccess && (
        <div style={{
          marginTop: "1rem",
          padding: "0.75rem",
          backgroundColor: "#22c55e20",
          color: "#22c55e",
          borderRadius: "4px"
        }}>
          Configuration saved successfully!
        </div>
      )}

      <div style={{
        marginTop: "2rem",
        padding: "1rem",
        backgroundColor: "var(--card-background-color)",
        borderRadius: "4px"
      }}>
        <h4>Important Notes:</h4>
        <ul style={{ marginLeft: "1.5rem" }}>
          <li>Make sure your custom RPC server is compatible with Neurai</li>
          <li>The wallet will need to reload after changing RPC settings</li>
          <li>If you cannot connect, reset to default settings</li>
          <li>
            <strong>Security:</strong> Your custom RPC server must use HTTPS (not HTTP).
            For localhost/local nodes, HTTP is allowed (http://localhost:* or http://127.0.0.1:*).
          </li>
        </ul>
      </div>

      {/* DePIN Information Section */}
      <hr style={{ margin: "3rem 0" }} />

      <h3>🔒 DePIN Messaging System</h3>

      <div style={{
        padding: "1.5rem",
        backgroundColor: "var(--card-background-color)",
        borderRadius: "8px",
        border: "2px solid var(--primary)",
        marginBottom: "1rem"
      }}>
        <h4 style={{ marginTop: 0, color: "var(--primary)" }}>✨ DePIN Now Uses RPC Configuration</h4>
        <p style={{ margin: "1rem 0" }}>
          DePIN messaging is now fully integrated with the RPC system. You don't need separate
          configuration anymore!
        </p>
        <p style={{ margin: "1rem 0" }}>
          <strong>How it works:</strong>
        </p>
        <ul style={{ marginLeft: "1.5rem", marginBottom: "1rem" }}>
          <li>DePIN commands (<code>depingetmsg</code>, <code>depinsendmsg</code>, etc.) use your configured RPC server</li>
          <li>The RPC server handles both standard commands (port 8766) and DePIN messaging (port 19002)</li>
          <li>Everything is managed through a single configuration point</li>
        </ul>

        <div style={{
          padding: "1rem",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          borderRadius: "6px",
          marginTop: "1rem"
        }}>
          <p style={{ margin: 0, fontSize: "0.95rem" }}>
            <strong>💡 To use DePIN Chat:</strong>
          </p>
          <ol style={{ marginLeft: "1.5rem", marginTop: "0.5rem", marginBottom: 0 }}>
            <li>Configure your RPC server above (custom or default)</li>
            <li>Go to "Chat DePIN" section</li>
            <li>Select an asset starting with <code>&</code></li>
            <li>Enter remote node address and connect!</li>
          </ol>
        </div>
      </div>

      <div style={{
        marginTop: "1rem",
        padding: "1rem",
        backgroundColor: "var(--card-background-color)",
        borderRadius: "4px"
      }}>
        <h4>DePIN Server Requirements:</h4>
        <p style={{ fontSize: "0.95rem", color: "var(--muted-color)", marginBottom: "1rem" }}>
          If you're running your own node with DePIN support, ensure these settings in <code>neurai.conf</code>:
        </p>
        <ul style={{ marginLeft: "1.5rem" }}>
          <li><code>depinmsg=1</code> - Enable DePIN messaging pool</li>
          <li><code>depintoken=&YOURTOKEN</code> - Your DePIN asset (e.g., &FRANCE)</li>
          <li><code>depinport=19002</code> - DePIN messaging port (default)</li>
          <li><code>assetindex=1</code> - Required for asset verification</li>
          <li><code>pubkeyindex=1</code> - Required for ECIES encryption</li>
        </ul>

        <div style={{
          marginTop: "1rem",
          padding: "0.75rem",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          borderRadius: "6px",
          fontSize: "0.9rem"
        }}>
          <strong>📝 Note:</strong> Default public RPC servers may not have DePIN enabled.
          For full DePIN functionality, use a local node or a custom RPC server with DePIN support.
        </div>
      </div>
    </article>
  );
}
