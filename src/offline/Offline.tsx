import React from "react";
import { key as NeuraiKey } from "@neuraiproject/neurai-jswallet";
import { Settings } from "../Settings";

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
    <div className="neurai-stack">
      <div className="neurai-card neurai-stack">
        <h3 className="text-2xl font-bold m-0">Offline mode</h3>
        <p className="text-sm text-base-content/80 m-0">
          You can view derived addresses and edit RPC settings while the node is unreachable.
        </p>

        {showWarning && (
          <div className="rounded-md bg-warning/15 text-warning px-3 py-2 text-sm">
            <strong>RPC disconnected.</strong> The app will automatically reconnect when the RPC
            server is back.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="neurai-btn--secondary"
            onClick={() => setAddressCount((n) => Math.max(5, n - 5))}
            disabled={addressCount <= 5}
          >
            Show fewer
          </button>
          <button
            type="button"
            className="neurai-btn--secondary"
            onClick={() => setAddressCount((n) => Math.min(50, n + 5))}
          >
            Show more
          </button>
          <button type="button" className="neurai-btn--primary ml-auto" onClick={signOut}>
            Sign out
          </button>
        </div>

        <h4 className="text-lg font-semibold m-0 mt-2">Derived addresses</h4>
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th className="w-16">Index</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {addresses.map((a) => (
              <tr key={a.index}>
                <td>{a.index}</td>
                <td className="font-mono text-sm break-all">{a.address}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr className="neurai-divider" />
        <Settings />
      </div>
    </div>
  );
}
