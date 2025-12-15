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

const DEFAULT_RPC_MAINNET = "https://rpc-depin.neurai.org/rpc";
const DEFAULT_RPC_TESTNET = "https://rpc-testnet.neurai.org/rpc";
import { Chat } from "./Chat";
import { useMempool } from "./hooks/useMempool";
import { useBlockCount } from "./hooks/useBlockCount";
import { useBalance } from "./hooks/useBalance";
import { useAssets } from "./hooks/useAssets";
import { useReceiveAddress } from "./hooks/useReceiveAddress";
import { deriveDepinChatIdentity, DepinChatIdentity } from "./utils/depinChatIdentity";

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
  const [isSplashMinElapsed, setIsSplashMinElapsed] = React.useState(false);

  const walletInitInFlightRef = React.useRef(false);

  const navLocked = !!rpcError;
  const dataWallet = navLocked ? null : wallet;

  const blockCount = useBlockCount(dataWallet);
  const receiveAddress = useReceiveAddress(dataWallet, blockCount);
  const balance = useBalance(dataWallet, blockCount);

  const mempool = useMempool(dataWallet, blockCount);
  const assets = useAssets(dataWallet, blockCount);

  // Determine network from query string (stable for this session)
  const network: ChainType = React.useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("network") === "xna-test" ? "xna-test" : "xna";
  }, []);

  const depinChatIdentity = React.useMemo<DepinChatIdentity | null>(() => {
    if (!mnemonic) return null;
    try {
      return deriveDepinChatIdentity({ network, mnemonic, passphrase, account: 100, index: 0 });
    } catch (e) {
      console.warn('Failed to derive DePIN chat identity:', e);
      return null;
    }
  }, [mnemonic, passphrase, network]);

  React.useEffect(() => {
    if (navLocked && currentRoute !== Routes.SETTINGS) {
      setCurrentRoute(Routes.SETTINGS);
    }
  }, [navLocked, currentRoute]);

  const minAmountOfAddresses: number = React.useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const v = searchParams.get("min");
    if (v && isFinite(parseInt(v)) === true) {
      return parseInt(v);
    }
    return 50;
  }, []);

  const buildWalletConfig = React.useCallback(() => {
    const walletConfig: any = {
      minAmountOfAddresses,
      mnemonic,
      network,
    };

    if (passphrase) {
      walletConfig.passphrase = passphrase;
    }

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
      } else {
        walletConfig.rpc_url = network === "xna-test" ? DEFAULT_RPC_TESTNET : DEFAULT_RPC_MAINNET;
    }

    return walletConfig;
  }, [minAmountOfAddresses, mnemonic, network, passphrase]);

  const formatRpcError = React.useCallback((err: any): string => {
    if (!err) return "Unknown RPC error";
    if (typeof err === "string") return err;
    if (err instanceof Error) {
      const m = String(err.message || "").trim();
      return m || "RPC error";
    }

    // Try common nested error shapes
    const msgCandidate =
      err?.message ??
      err?.error?.message ??
      err?.error?.error?.message ??
      err?.data?.message ??
      err?.response?.data?.error ??
      err?.response?.statusText ??
      null;

    const statusCandidate = err?.status ?? err?.statusCode ?? err?.code ?? null;

    const msg = typeof msgCandidate === "string" ? msgCandidate.trim() : "";
    const status =
      typeof statusCandidate === "string" || typeof statusCandidate === "number"
        ? String(statusCandidate)
        : "";

    const lower = msg.toLowerCase();
    if (lower.includes("timeout")) {
      return "RPC timeout: server is not responding";
    }
    if (
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("network request failed")
    ) {
      return "RPC unreachable: cannot connect to server";
    }

    if (msg) {
      return status ? `RPC error (${status}): ${msg}` : `RPC error: ${msg}`;
    }

    // Last resort: JSON stringify the object.
    try {
      const seen = new WeakSet();
      const json = JSON.stringify(
        err,
        (_k, v) => {
          if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);
          }
          return v;
        },
        2
      );
      if (json && json !== "{}") return `RPC error: ${json}`;
    } catch {
      // ignore
    }

    return "RPC error";
  }, []);

  const tryInitWallet = React.useCallback(() => {
    if (!mnemonic) return;
    if (walletInitInFlightRef.current) return;
    if (wallet) return;

    walletInitInFlightRef.current = true;

    // Set a global timeout for wallet initialization
    let initTimeout: ReturnType<typeof setTimeout> | null = null;
    let isTimedOut = false;

    initTimeout = setTimeout(() => {
      isTimedOut = true;
      setIsRpcTimeout(true);
      setRpcError(
        "Wallet initialization timeout. Cannot connect to RPC server - the URL might be invalid or the server is not responding."
      );
      walletInitInFlightRef.current = false;
    }, 10000);

    const walletConfig = buildWalletConfig();

    NeuraiWallet.createInstance(walletConfig)
      .then((w) => {
        if (!isTimedOut) {
          setWallet(w);
          setRpcError(null);
          setIsRpcTimeout(false);
        }
      })
      .catch((err) => {
        if (!isTimedOut) {
          console.error("Failed to create wallet instance:", err);
          setRpcError(`Failed to connect to RPC: ${formatRpcError(err)}`);
          setIsRpcTimeout(true);
        }
      })
      .finally(() => {
        if (initTimeout) clearTimeout(initTimeout);
        walletInitInFlightRef.current = false;
      });
  }, [buildWalletConfig, mnemonic, wallet]);

  // Keep the initial splash visible for at least 2 seconds.
  React.useEffect(() => {
    if (!mnemonic) return;

    setIsSplashMinElapsed(false);
    const t = setTimeout(() => setIsSplashMinElapsed(true), 2000);
    return () => clearTimeout(t);
  }, [mnemonic]);

  //At startup init wallet
  React.useEffect(() => {
    if (!mnemonic) {
      return;
    }
    // One initial attempt
    tryInitWallet();
  }, [mnemonic, passphrase]);

  // Keep trying to (re)connect while wallet is not available.
  React.useEffect(() => {
    if (!mnemonic) return;
    if (wallet) return;

    const intervalId = setInterval(() => {
      tryInitWallet();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [mnemonic, tryInitWallet, wallet]);

  // If we have a wallet instance, keep a lightweight RPC health check to show/hide banner.
  React.useEffect(() => {
    if (!wallet) return;

    let cancelled = false;

    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), ms);
      });
      try {
        return (await Promise.race([promise, timeoutPromise])) as T;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const ping = async () => {
      try {
        await withTimeout(wallet.rpc("getblockchaininfo", []), 4500);
        if (cancelled) return;
        setRpcError(null);
        setIsRpcTimeout(false);
      } catch (e: any) {
        if (cancelled) return;
        const msg = formatRpcError(e);

        // If the RPC is reachable but disallows the method, don't treat it as offline.
        const lower = msg.toLowerCase();
        if (lower.includes("whitelist") || lower.includes("not in whitelist")) {
          return;
        }

        setRpcError(msg.startsWith("RPC") ? msg : `RPC error: ${msg}`);
      }
    };

    ping();
    const intervalId = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [wallet]);

  if (!mnemonic) {
    return <Login />;
  }

  // Keep the initial splash visible for at least 2 seconds.
  if (!isSplashMinElapsed) {
    return <Loader />;
  }

  const signOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      localStorage.removeItem("mnemonic");
      sessionStorage.removeItem("mnemonic_session");
      localStorage.removeItem("loginFromESP32");
      window.location.reload();
    }
  };

  // If we don't have a wallet instance yet, render the normal shell locked to Settings.
  if (!wallet) {
    return (
      <>
        {rpcError && (
          <div
            role="status"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 999,
              backgroundColor: "#ef4444",
              color: "#ffffff",
              padding: "0.45rem 0.75rem",
              fontSize: "0.85rem",
              lineHeight: 1.25,
            }}
          >
            {rpcError}
          </div>
        )}

        <Navigator
          balance={<></>}
          currentRoute={Routes.SETTINGS}
          setRoute={setCurrentRoute}
          wallet={null}
          navLocked={true}
        />

        <div className="rebel-content-container">
          <div className="rebel-content-container__content">
            <Settings />
          </div>
        </div>

        <Footer
          signOut={signOut}
          mnemonic={mnemonic}
          isFromESP32={localStorage.getItem("loginFromESP32") === "true"}
        />
      </>
    );
  }

  const hasMempool = mempool.length > 0;
  return (
    <>
      {rpcError && (
        <div
          role="status"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 999,
            backgroundColor: "#ef4444",
            color: "#ffffff",
            padding: "0.45rem 0.75rem",
            fontSize: "0.85rem",
            lineHeight: 1.25,
          }}
        >
          {rpcError}
        </div>
      )}
      <Navigator
        balance={navLocked ? <></> : <Balance balance={balance} mempool={mempool} wallet={wallet} />}
        currentRoute={currentRoute}
        setRoute={setCurrentRoute}
        wallet={wallet}
        navLocked={navLocked}
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
            <Chat wallet={wallet} assets={assets} mempool={mempool} depinChatIdentity={depinChatIdentity} />
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
