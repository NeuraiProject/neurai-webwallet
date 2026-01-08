import React from "react";
import NeuraiKey from "@neuraiproject/neurai-key";
import { Settings } from "../Settings";
import "./Offline.css";

type ChainType = "xna" | "xna-test" | "xna-legacy" | "xna-legacy-test";
type AddressPair = {
  external?: {
    address?: string;
  };
};

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
        const pair = passphrase
          ? (NeuraiKey.getAddressPair(network, mnemonic, 0, i, passphrase) as AddressPair | null)
          : (NeuraiKey.getAddressPair(network, mnemonic, 0, i) as AddressPair | null);
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
      <article className="rebel-offline__article">
        <h3 className="rebel-offline__title">Offline mode</h3>
        <p className="rebel-offline__subtitle">
          You can view derived addresses and edit RPC settings while the node is unreachable.
        </p>

        {showWarning && (
          <div className="rebel-offline__warning">
            <strong>RPC disconnected.</strong> The app will automatically reconnect when the RPC server is back.
          </div>
        )}

        <div className="rebel-offline__actions">
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
          <button onClick={signOut} className="rebel-offline__signout">
            Sign out
          </button>
        </div>

        <h4 className="rebel-offline__section-title">Derived addresses</h4>
        <table role="grid">
          <thead>
            <tr>
              <th className="rebel-offline__col-index">Index</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((a) => (
              <tr key={a.index}>
                <td>{a.index}</td>
                <td className="rebel-offline__address">{a.address}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr className="rebel-offline__divider" />
        <Settings />
      </article>
    </main>
  );
}
