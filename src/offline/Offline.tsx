import React from "react";
import NeuraiKey from "@neuraiproject/neurai-key";
import { Settings } from "../Settings";

type ChainType = "xna" | "xna-test";

export function Offline({
  mnemonic,
  passphrase,
  network,
  showWarning,
  signOut,
}: {
  mnemonic: string;
  passphrase: string;
  network: ChainType;
  showWarning: boolean;
  signOut: () => void;
}) {
  const [addressCount, setAddressCount] = React.useState(10);

  const addresses = React.useMemo(() => {
    const out: Array<{ index: number; address: string }> = [];
    for (let i = 0; i < addressCount; i++) {
      try {
        const pair: any = passphrase
          ? NeuraiKey.getAddressPair(network, mnemonic, 0, i, passphrase)
          : NeuraiKey.getAddressPair(network, mnemonic, 0, i);
        const address = String(pair?.external?.address || "");
        if (address) out.push({ index: i, address });
      } catch {
        // ignore
      }
    }
    return out;
  }, [addressCount, mnemonic, network, passphrase]);

  return (
    <main className="container">
      <article style={{ marginTop: "1.25rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Offline mode</h3>
        <p style={{ marginTop: 0, color: "var(--muted-color)" }}>
          You can view derived addresses and edit RPC settings while the node is unreachable.
        </p>

        {showWarning && (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "8px",
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              marginBottom: "1rem",
            }}
          >
            <strong>RPC disconnected.</strong> The app will automatically reconnect when the RPC server is back.
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button
            className="secondary"
            onClick={() => setAddressCount((n) => Math.max(5, n - 5))}
            disabled={addressCount <= 5}
          >
            Show fewer
          </button>
          <button className="secondary" onClick={() => setAddressCount((n) => Math.min(50, n + 5))}>
            Show more
          </button>
          <button onClick={signOut} style={{ backgroundColor: "#6b7280" }}>
            Sign out
          </button>
        </div>

        <h4 style={{ marginBottom: "0.5rem" }}>Derived addresses</h4>
        <table role="grid">
          <thead>
            <tr>
              <th style={{ width: "80px" }}>Index</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((a) => (
              <tr key={a.index}>
                <td>{a.index}</td>
                <td style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{a.address}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr style={{ margin: "2rem 0" }} />
        <Settings />
      </article>
    </main>
  );
}
