import React from "react";
import type { Wallet } from "@neuraiproject/neurai-jswallet";
import { ChainDetails } from "./ChainDetails";
import { RecoveryDialog } from "./RecoveryDialog";
import { networkLabel as getNetworkLabel } from "./networkOptions";

interface RPCConfig {
  url: string;
  username: string;
  password: string;
}

const DEFAULT_RPC_MAINNET = "https://rpc-main.neurai.org/rpc";
const DEFAULT_RPC_TESTNET = "https://rpc-testnet.neurai.org/rpc";

export function Settings({
  signOut,
  mnemonic,
  network: activeNetwork,
  passphrase = "",
  wallet = null,
}: {
  signOut?: () => void;
  mnemonic?: string;
  network?: string;
  passphrase?: string;
  wallet?: Wallet | null;
}) {
  const [rpcUrl, setRpcUrl] = React.useState("");
  const [rpcUsername, setRpcUsername] = React.useState("");
  const [rpcPassword, setRpcPassword] = React.useState("");
  const [useCustomRPC, setUseCustomRPC] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [recoveryOpen, setRecoveryOpen] = React.useState(false);

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

  const network = activeNetwork ?? resolveNetwork();
  const isTestnetNetwork =
    network === "xna-test" || network === "xna-legacy-test" || network === "xna-pq-test";

  const networkLabel = getNetworkLabel(network);

  const safeMnemonic = mnemonic ?? "";
  const mnemonicOnly = safeMnemonic.includes("|||") ? safeMnemonic.split("|||")[0] : safeMnemonic;
  const walletPassphrase = passphrase || (safeMnemonic.includes("|||") ? safeMnemonic.split("|||")[1] : "");
  const hasPassphrase = !!walletPassphrase;
  const canSignOut = typeof signOut === "function";
  const canViewMnemonic = !!safeMnemonic;
  const showWalletSection = canSignOut || canViewMnemonic;

  return (
    <div className="neurai-stack min-w-0">
      <div>
        <h2 className="text-xl font-bold m-0">Settings</h2>
        <p className="neurai-hint mt-1 mb-0">Manage your connection and wallet recovery.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-5 items-stretch">
          <section className="neurai-card neurai-stack min-w-0 h-full" aria-labelledby="settings-network-title">
            <h3 id="settings-network-title" className="neurai-card__title">Network</h3>
            <div className="rounded-xl border border-base-300 bg-base-100 p-4">
              <p className="neurai-eyebrow mb-2">Current network</p>
              <p className="font-semibold m-0">{networkLabel}</p>
            </div>
            <ChainDetails wallet={wallet} network={network} />
            <p className="text-sm text-base-content/70 mt-auto mb-0">To switch networks, sign out and choose another on the login screen. Each network keeps its own protected recovery words in this browser.</p>
          </section>


        <div className="neurai-stack min-w-0">
        <section className="neurai-card neurai-stack min-w-0" aria-labelledby="settings-rpc-title">
          <div>
            <h3 id="settings-rpc-title" className="neurai-card__title">RPC connection</h3>
            <p className="neurai-hint mb-0">Choose the server used to connect to Neurai.</p>
          </div>
          <form onSubmit={event => { event.preventDefault(); handleSave(); }} className="neurai-stack">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-base-300 p-4 cursor-pointer">
              <span className="text-sm font-medium">Use custom RPC server</span>
              <input type="checkbox" checked={useCustomRPC} onChange={event => setUseCustomRPC(event.target.checked)} className="toggle toggle-primary toggle-sm shrink-0" />
            </label>
            {useCustomRPC ? <>
              <div>
                <label htmlFor="rpcUrl" className="neurai-label">RPC URL</label>
                <input id="rpcUrl" type="url" className="neurai-input" placeholder="https://your-rpc-server.com/rpc" value={rpcUrl} onChange={event => setRpcUrl(event.target.value)} required />
                <p className="neurai-hint mb-0">Include the full endpoint path, for example /rpc.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rpcUsername" className="neurai-label">Username <span className="font-normal opacity-60">(optional)</span></label>
                  <input id="rpcUsername" className="neurai-input" autoComplete="off" value={rpcUsername} onChange={event => setRpcUsername(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="rpcPassword" className="neurai-label">Password <span className="font-normal opacity-60">(optional)</span></label>
                  <input id="rpcPassword" type="password" className="neurai-input" autoComplete="off" value={rpcPassword} onChange={event => setRpcPassword(event.target.value)} />
                </div>
              </div>
            </> : <div className="rounded-xl border border-base-300 bg-base-100 p-4 min-w-0">
              <p className="neurai-eyebrow mb-2">Default server</p>
              <p className="font-mono text-sm break-all m-0">{isTestnetNetwork ? DEFAULT_RPC_TESTNET : DEFAULT_RPC_MAINNET}</p>
            </div>}
            <p className="text-sm text-base-content/70 m-0">Use a Neurai-compatible HTTPS server. HTTP is supported for local nodes. Changing the connection requires reloading the wallet.</p>
            <div className="flex flex-col sm:flex-row gap-2 border-t border-base-300 pt-4">
              <button type="submit" className="neurai-btn--primary">Save connection</button>
              <button type="button" className="neurai-btn--secondary" onClick={handleReset}>Restore defaults</button>
            </div>
            {saveSuccess && <p role="status" className="rounded-xl bg-success/10 text-success px-3 py-2 text-sm m-0">Connection settings saved.</p>}
          </form>
        </section>
          {showWalletSection && <section className="neurai-card neurai-stack min-w-0 flex-1" aria-labelledby="settings-wallet-title">
            <h3 id="settings-wallet-title" className="neurai-card__title">Wallet & recovery</h3>
            {canViewMnemonic && <>
              <p className="text-sm text-base-content/70 m-0">Your wallet PIN is required each time you view your recovery words.</p>
              {hasPassphrase && <p className="neurai-hint m-0">This wallet also uses an additional passphrase. It is required together with your recovery words to restore this wallet. It will not be shown here.</p>}
              <button type="button" className="neurai-btn--secondary w-full" onClick={() => setRecoveryOpen(true)}>
                View recovery words
              </button>
            </>}
            {canSignOut && <div className={canViewMnemonic ? "border-t border-base-300 pt-4" : ""}>
              <button type="button" className="neurai-btn--secondary w-full" onClick={signOut}>Sign out</button>
            </div>}
          </section>}
        </div>
      </div>
      {recoveryOpen && <RecoveryDialog key={network} network={network} mnemonic={mnemonicOnly} passphrase={walletPassphrase}
        onClose={() => setRecoveryOpen(false)} />}
    </div>
  );
}
