import NeuraiWallet, { Wallet } from "@neuraiproject/neurai-jswallet";
console.log("NeuraiWallet", !!NeuraiWallet);
import React from "react";
import { getMnemonicAndPassphrase } from "./utils";
import { createRoot } from "react-dom/client";

import { History } from "./history/History";
import { Assets } from "./Assets";
import { Mempool } from "./Mempool";
import { ReceiveAddress } from "./ReceiveAddress";
import { Balance } from "./Balance";
import { Loader } from "./Loader";
import { Send } from "./Send";
import { Login } from "./Login";
import { Sweep } from "./Sweep";
import { Navigator } from "./Navigator";
import { Routes } from "./Routes";
import { Footer } from "./Footer";
import { Sign } from "./sign/Sign";
import { Settings } from "./Settings";
import { Chat } from "./Chat";
import { useMempool } from "./hooks/useMempool";
import { useBlockCount } from "./hooks/useBlockCount";
import { useBalance } from "./hooks/useBalance";
import { useAssets } from "./hooks/useAssets";
import { useReceiveAddress } from "./hooks/useReceiveAddress";

let _mnemonic =
  "sight rate burger maid melody slogan attitude gas account sick awful hammer";

type ChainType = "xna" | "xna-test";

const { mnemonic: initMnemonic, passphrase: initPassphrase } = getMnemonicAndPassphrase();

//Set Dark or Light mode if store.
const theme = localStorage.getItem("data-theme");
if (theme) {
  const element = document.querySelector("html");
  element?.setAttribute("data-theme", theme);
}

function App() {
  const [currentRoute, setCurrentRoute] = React.useState(Routes.HOME);

  const [mnemonic] = React.useState(initMnemonic);
  const [passphrase] = React.useState(initPassphrase);

  const [wallet, setWallet] = React.useState<null | Wallet>(null);
  const [rpcError, setRpcError] = React.useState<string | null>(null);
  const [isRpcTimeout, setIsRpcTimeout] = React.useState(false);

  const blockCount = useBlockCount(wallet);
  const receiveAddress = useReceiveAddress(wallet, blockCount);
  const balance = useBalance(wallet, blockCount);

  const mempool = useMempool(wallet, blockCount);
  const assets = useAssets(wallet, blockCount);

  //At startup init wallet
  React.useEffect(() => {
    if (!mnemonic) {
      return;
    }
    let minAmountOfAddresses = 50;
    //Override network to xna-test if present in query string (search)
    const searchParams = new URLSearchParams(window.location.search);
    let network: ChainType = "xna";
    if (searchParams.get("network") === "xna-test") {
      network = "xna-test";
    }

    if (searchParams.get("min")) {
      const v = searchParams.get("min");
      if (v && isFinite(parseInt(v)) === true) {
        minAmountOfAddresses = parseInt(v);
      }
    }

    // Create wallet config
    const walletConfig: any = {
      minAmountOfAddresses,
      mnemonic,
      network,
    };

    // Only add passphrase if it exists (backward compatible)
    if (passphrase) {
      walletConfig.passphrase = passphrase;
    }

    // Load custom RPC configuration if available
    const savedRpcConfig = localStorage.getItem("rpc_config");
    if (savedRpcConfig) {
      try {
        const rpcConfig = JSON.parse(savedRpcConfig);
        if (rpcConfig.url) {
          walletConfig.rpc_url = rpcConfig.url;
          if (rpcConfig.username) {
            walletConfig.rpc_username = rpcConfig.username;
          }
          if (rpcConfig.password) {
            walletConfig.rpc_password = rpcConfig.password;
          }
          console.log("Using custom RPC server:", rpcConfig.url);
        }
      } catch (e) {
        console.error("Error loading custom RPC config:", e);
      }
    }

    // Set a global timeout for wallet initialization
    let initTimeout: NodeJS.Timeout | null = null;
    let isTimedOut = false;

    initTimeout = setTimeout(() => {
      isTimedOut = true;
      setIsRpcTimeout(true);
      setRpcError("Wallet initialization timeout. Cannot connect to RPC server - the URL might be invalid or the server is not responding.");
    }, 10000); // 10 second timeout for createInstance

    NeuraiWallet.createInstance(walletConfig)
      .then((w) => {
        if (!isTimedOut && initTimeout) {
          clearTimeout(initTimeout);
          setWallet(w);
        }
      })
      .catch((err) => {
        if (initTimeout) clearTimeout(initTimeout);
        console.error("Failed to create wallet instance:", err);
        setRpcError(`Failed to initialize wallet: ${err.message || 'Unknown error'}`);
        setIsRpcTimeout(true);
      });

    return () => {
      if (initTimeout) clearTimeout(initTimeout);
    };
  }, [mnemonic, passphrase]);

  // Timeout detection for RPC connection
  React.useEffect(() => {
    if (!wallet || blockCount > 0 || rpcError) return;

    const timeout = setTimeout(() => {
      if (blockCount === 0) {
        setIsRpcTimeout(true);
        setRpcError("RPC connection timeout. The server might be offline or unreachable.");
      }
    }, 15000); // 15 second timeout

    return () => clearTimeout(timeout);
  }, [wallet, blockCount, rpcError]);

  if (!mnemonic) {
    return <Login />;
  }
  if (!wallet || (blockCount === 0 && !isRpcTimeout)) {
    return <Loader />;
  }

  // Show error UI with access to Settings if RPC failed
  if (rpcError) {
    return (
      <>
        <article style={{ padding: "2rem" }}>
          <div style={{
            border: "2px solid #ef4444",
            borderRadius: "12px",
            padding: "2rem",
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            marginBottom: "2rem"
          }}>
            <h3 style={{ margin: "0 0 1rem 0", color: "#991b1b" }}>⚠️ RPC Connection Error</h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.95rem" }}>
              <strong>The wallet cannot connect to the RPC server.</strong>
            </p>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.9rem" }}>
              {rpcError}
            </p>
            <details style={{ marginTop: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "0.5rem" }}>What can I do?</summary>
              <ul style={{ marginLeft: "1.25rem", fontSize: "0.9rem" }}>
                <li>Check your internet connection</li>
                <li>Verify the RPC server is running</li>
                <li>Go to Settings below to update your RPC configuration</li>
                <li>If using default server, it might be temporarily offline</li>
              </ul>
            </details>
          </div>
          
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <button 
              onClick={() => window.location.reload()}
              style={{ flex: "1", minWidth: "200px" }}
            >
              🔄 Retry Connection
            </button>
            <button 
              onClick={() => setCurrentRoute(Routes.SETTINGS)}
              style={{ flex: "1", minWidth: "200px", backgroundColor: "#3b82f6" }}
            >
              ⚙️ Open Settings
            </button>
            <button 
              onClick={() => {
                if (confirm("Sign out and return to login?")) {
                  localStorage.removeItem("mnemonic");
                  sessionStorage.removeItem("mnemonic_session");
                  localStorage.removeItem("loginFromESP32");
                  window.location.reload();
                }
              }}
              style={{ flex: "1", minWidth: "200px", backgroundColor: "#6b7280" }}
            >
              🚪 Sign Out
            </button>
          </div>
        </article>

        {currentRoute === Routes.SETTINGS && (
          <article style={{ marginTop: "2rem" }}>
            <Settings />
          </article>
        )}
      </>
    );
  }

  const signOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      localStorage.removeItem("mnemonic");
      sessionStorage.removeItem("mnemonic_session");
      localStorage.removeItem("loginFromESP32");
      window.location.reload();
    }
  };

  const hasMempool = mempool.length > 0;
  return (
    <>
      <Navigator
        balance={
          <Balance balance={balance} mempool={mempool} wallet={wallet} />
        }
        currentRoute={currentRoute}
        setRoute={setCurrentRoute}
        wallet={wallet}
      />

      <div className="rebel-content-container">
        {hasMempool && (
          <div className="rebel-content-container__mempool">
            <Mempool mempool={mempool} wallet={wallet} />
          </div>
        )}

        <div className="rebel-content-container__content">
          {currentRoute === Routes.HOME && (
            <Assets wallet={wallet} assets={assets} mempool={mempool} />
          )}
          {currentRoute === Routes.RECEIVE && (
            <ReceiveAddress receiveAddress={receiveAddress} />
          )}

          {currentRoute === Routes.SEND && (
            <Send
              assets={assets}
              balance={balance}
              mempool={mempool}
              wallet={wallet}
            />
          )}

          {currentRoute === Routes.SWEEP && <Sweep wallet={wallet} />}

          {currentRoute === Routes.HISTORY && (
            <History wallet={wallet} blockCount={blockCount} />
          )}

          {currentRoute === Routes.SIGN && (
            <Sign assets={assets} wallet={wallet} />
          )}

          <div
            style={{ display: currentRoute === Routes.CHAT ? "block" : "none" }}
            aria-hidden={currentRoute !== Routes.CHAT}
          >
            <Chat wallet={wallet} assets={assets} mempool={mempool} />
          </div>

          {currentRoute === Routes.SETTINGS && (
            <Settings />
          )}
        </div>
      </div>

      <Footer signOut={signOut} mnemonic={mnemonic} isFromESP32={localStorage.getItem("loginFromESP32") === "true"} />
    </>
  );
}

//Add app to the DOM
const container = document.getElementById("app");
const root = createRoot(container!);
root.render(<App />);
