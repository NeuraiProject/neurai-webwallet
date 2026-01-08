import NeuraiWallet, { Wallet } from "@neuraiproject/neurai-jswallet";
console.log("NeuraiWallet", !!NeuraiWallet);
import React from "react";
import {
  clearStoredWalletSecrets,
  decryptStoredMnemonicDataWithPin,
  getStoredMnemonicRaw,
  hasStoredMnemonic,
  isStoredMnemonicPinProtected,
  setMnemonicWithPin,
  splitMnemonicAndPassphrase,
} from "./utils";
import { createRoot } from "react-dom/client";
import "./App.css";

import { Loader } from "./Loader";
import { Login } from "./Login";
import { Navigator } from "./Navigator";
import { Routes } from "./Routes";
import { Footer } from "./Footer";
import { History } from "./history/History";
import { Assets } from "./Assets";
import { Mempool } from "./Mempool";
import { ReceiveAddress } from "./ReceiveAddress";
import { Balance } from "./Balance";
import { Send } from "./Send";
import { Sweep } from "./Sweep";
import { Sign } from "./sign/Sign";
import { Settings } from "./Settings";

const DEFAULT_RPC_MAINNET = "https://rpc-depin.neurai.org/rpc";
const DEFAULT_RPC_TESTNET = "https://rpc-testnet.neurai.org/rpc";
import { Chat } from "./Chat";
import { IoT } from "./IoT";
import { useMempool } from "./hooks/useMempool";
import { useBlockCount } from "./hooks/useBlockCount";
import { useBalance } from "./hooks/useBalance";
import { useAssets } from "./hooks/useAssets";
import { useReceiveAddress } from "./hooks/useReceiveAddress";
import { deriveDepinChatIdentity, DepinChatIdentity } from "./utils/depinChatIdentity";

const neuraiLogo = new URL("../public/neurai-xna-logo.png", import.meta.url);

let _mnemonic =
  "sight rate burger maid melody slogan attitude gas account sick awful hammer";

type ChainType = "xna" | "xna-test" | "xna-legacy" | "xna-legacy-test";
type WalletConfig = {
  minAmountOfAddresses: number;
  mnemonic: string;
  network: ChainType;
  passphrase?: string;
  rpc_url?: string;
  rpc_username?: string;
  rpc_password?: string;
};

type RpcConfig = {
  url?: string;
  username?: string;
  password?: string;
};

type RpcErrorShape = {
  message?: unknown;
  error?: {
    message?: unknown;
    error?: {
      message?: unknown;
    };
  };
  data?: {
    message?: unknown;
  };
  response?: {
    data?: {
      error?: unknown;
    };
    statusText?: unknown;
  };
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
};

//Set Dark or Light mode if store.
const theme = localStorage.getItem("data-theme");
if (theme) {
  const element = document.querySelector("html");
  element?.setAttribute("data-theme", theme);
}

function App() {
  const [currentRoute, setCurrentRoute] = React.useState(Routes.HOME);

  const [mnemonic, setMnemonic] = React.useState("");
  const [passphrase, setPassphrase] = React.useState("");
  const [pinGateMode, setPinGateMode] = React.useState<null | "setup" | "unlock">(null);
  const [pinGateError, setPinGateError] = React.useState<string | null>(null);
  const [pendingMnemonicData, setPendingMnemonicData] = React.useState<string | null>(null);
  const [pendingPersist, setPendingPersist] = React.useState<boolean>(true);

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
    const isTestnet = searchParams.get("network") === "xna-test";
    const derivationType = localStorage.getItem("derivation_type");
    const useLegacy = derivationType === "legacy";

    if (isTestnet) {
      return useLegacy ? "xna-legacy-test" : "xna-test";
    }

    return useLegacy ? "xna-legacy" : "xna";
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

  // PIN gate / storage bootstrap
  React.useEffect(() => {
    // If already unlocked in this session, do nothing.
    if (mnemonic) return;

    // If there is a stored mnemonic, require PIN setup/unlock.
    if (!hasStoredMnemonic()) {
      setPinGateMode(null);
      return;
    }

    setPinGateError(null);
    if (isStoredMnemonicPinProtected()) {
      setPinGateMode("unlock");
    } else {
      // Stored mnemonic exists but is not PIN-protected (legacy). We'll prompt for PIN creation
      // and migrate it once the user confirms.
      setPinGateMode("setup");
    }
  }, [mnemonic]);

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
    const walletConfig: WalletConfig = {
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
        const rpcConfig = JSON.parse(savedRpcConfig) as RpcConfig;
        if (rpcConfig && rpcConfig.url) {
          walletConfig.rpc_url = rpcConfig.url;
          if (rpcConfig.username) {
            walletConfig.rpc_username = rpcConfig.username;
          }
          if (rpcConfig.password) {
            walletConfig.rpc_password = rpcConfig.password;
          }
          console.log("Using custom RPC server:", rpcConfig.url);
        }
      } catch (error) {
        console.error("Error loading custom RPC config:", error);
      }
      } else {
        const isTestnetNetwork = network === "xna-test" || network === "xna-legacy-test";
        walletConfig.rpc_url = isTestnetNetwork ? DEFAULT_RPC_TESTNET : DEFAULT_RPC_MAINNET;
    }

    return walletConfig;
  }, [minAmountOfAddresses, mnemonic, network, passphrase]);

  const ensureWalletDefaults = React.useCallback((instance: Wallet) => {
    if (!instance.baseCurrency) {
      instance.baseCurrency = "XNA";
    }
  }, []);

  const formatRpcError = React.useCallback((err: unknown): string => {
    if (!err) return "Unknown RPC error";
    if (typeof err === "string") return err;
    if (err instanceof Error) {
      const m = String(err.message || "").trim();
      return m || "RPC error";
    }

    const errorObj = err as RpcErrorShape;
    // Try common nested error shapes
    const msgCandidate =
      errorObj?.message ??
      errorObj?.error?.message ??
      errorObj?.error?.error?.message ??
      errorObj?.data?.message ??
      errorObj?.response?.data?.error ??
      errorObj?.response?.statusText ??
      null;

    const statusCandidate = errorObj?.status ?? errorObj?.statusCode ?? errorObj?.code ?? null;

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
        errorObj,
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
          ensureWalletDefaults(w);
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
      } catch (error) {
        if (cancelled) return;
        const msg = formatRpcError(error);

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
    // If user just submitted a mnemonic in Login, we gate with a PIN setup dialog.
    if (pendingMnemonicData && pinGateMode === "setup") {
      return (
        <PinDialog
          mode="setup"
          error={pinGateError}
          onCancel={() => {
            setPendingMnemonicData(null);
            setPinGateError(null);
            setPinGateMode(null);
          }}
          onReset={() => {
            const ok = confirm(
              "Reset wallet? This will remove the wallet data stored in this browser. You will need your mnemonic to restore it."
            );
            if (!ok) return;
            clearStoredWalletSecrets();
            localStorage.removeItem("loginFromESP32");
            setWallet(null);
            setMnemonic("");
            setPassphrase("");
            setCurrentRoute(Routes.HOME);
            setPendingMnemonicData(null);
            setPinGateMode(null);
            setPinGateError(null);
          }}
          onSubmit={(pin) => {
            setPinGateError(null);
            void (async () => {
              try {
                await setMnemonicWithPin(pendingMnemonicData, pin, { persist: pendingPersist });
                const { mnemonic: m, passphrase: p } = splitMnemonicAndPassphrase(pendingMnemonicData);
                setMnemonic(m);
                setPassphrase(p);
                setPendingMnemonicData(null);
              } catch (error) {
                setPinGateError(error instanceof Error ? error.message : "Failed to save encrypted wallet");
              }
            })();
          }}
        />
      );
    }

    // If a stored mnemonic exists, show unlock/setup dialog.
    if (pinGateMode) {
      return (
        <PinDialog
          mode={pinGateMode}
          error={pinGateError}
          onCancel={() => {
            // Keep the user on the gate; cancel just clears errors.
            setPinGateError(null);
          }}
          onReset={() => {
            const ok = confirm(
              "Reset wallet? This will remove the wallet data stored in this browser. You will need your mnemonic to restore it."
            );
            if (!ok) return;
            clearStoredWalletSecrets();
            localStorage.removeItem("loginFromESP32");
            setWallet(null);
            setMnemonic("");
            setPassphrase("");
            setCurrentRoute(Routes.HOME);
            setPendingMnemonicData(null);
            setPinGateMode(null);
            setPinGateError(null);
          }}
          onSubmit={(pin) => {
            setPinGateError(null);
            void (async () => {
              try {
                const plaintext = await decryptStoredMnemonicDataWithPin(pin);
                if (!plaintext) {
                  const stored = getStoredMnemonicRaw();
                  const raw = stored?.value || "";
                  if (raw && !raw.includes(" ")) {
                    setPinGateError("Unsupported wallet format. Please use Reset wallet.");
                  } else {
                    setPinGateError("Invalid PIN or corrupted wallet data");
                  }
                  return;
                }

                // If we were in setup mode, migrate plaintext storage into pin-v2.
                if (pinGateMode === "setup") {
                  const stored = getStoredMnemonicRaw();
                  const persist = stored?.location === "local";
                  await setMnemonicWithPin(plaintext, pin, { persist });
                }

                const { mnemonic: m, passphrase: p } = splitMnemonicAndPassphrase(plaintext);
                setMnemonic(m);
                setPassphrase(p);
              } catch (error) {
                setPinGateError(error instanceof Error ? error.message : "Failed to decrypt wallet data");
              }
            })();
          }}
        />
      );
    }

    return (
      <Login
        onLogin={(data) => {
          // Always require PIN setup before unlocking a new mnemonic.
          setPendingMnemonicData(data.mnemonicData);
          setPendingPersist(data.persist);
          setPinGateMode("setup");
          setPinGateError(null);

          if (data.isFromESP32) {
            localStorage.setItem("loginFromESP32", "true");
          } else {
            localStorage.removeItem("loginFromESP32");
          }
        }}
      />
    );
  }

  // Keep the initial splash visible for at least 2 seconds.
  if (!isSplashMinElapsed) {
    return <Loader />;
  }

  const signOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      clearStoredWalletSecrets();
      localStorage.removeItem("loginFromESP32");
      setWallet(null);
      setMnemonic("");
      setPassphrase("");
      setCurrentRoute(Routes.HOME);
    }
  };

  // If we don't have a wallet instance yet, render the normal shell locked to Settings.
  if (!wallet) {
    return (
      <>
	        {rpcError && (
	          <div
	            role="status"
	            className="rebel-app__rpc-banner"
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
          hasPassphrase={false}
        />

        <div className="rebel-content-container">
          <div className="rebel-content-container__content">
            <Settings
              signOut={signOut}
              mnemonic={mnemonic}
              isFromESP32={localStorage.getItem("loginFromESP32") === "true"}
            />
          </div>
        </div>

        <Footer />
      </>
    );
  }

  const hasMempool = mempool.length > 0;
  return (
    <>
	      {rpcError && (
	        <div
	          role="status"
	          className="rebel-app__rpc-banner"
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
        hasPassphrase={!!passphrase}
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
            className={
              currentRoute === Routes.CHAT ? "rebel-app__chat" : "rebel-app__chat rebel-app__chat--hidden"
            }
            aria-hidden={currentRoute !== Routes.CHAT}
          >
            <Chat wallet={wallet} assets={assets} mempool={mempool} depinChatIdentity={depinChatIdentity} />
          </div>

          {currentRoute === Routes.IOT && <IoT wallet={wallet} />}

          {currentRoute === Routes.SETTINGS && (
            <Settings
              signOut={signOut}
              mnemonic={mnemonic}
              isFromESP32={localStorage.getItem("loginFromESP32") === "true"}
            />
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}

//Add app to the DOM
const container = document.getElementById("app");
const root = createRoot(container!);
root.render(<App />);

function PinDialog({
  mode,
  error,
  onCancel,
  onReset,
  onSubmit,
}: {
  mode: "setup" | "unlock";
  error: string | null;
  onCancel: () => void;
  onReset: () => void;
  onSubmit: (pin: string) => void;
}) {
  const [pin1, setPin1] = React.useState("");
  const [pin2, setPin2] = React.useState("");
  const [caps, setCaps] = React.useState(false);
  const minLen = 6;
  const maxLen = 24;

  const title = mode === "setup" ? "Set PIN" : "Enter PIN";
  const canSubmit =
    mode === "unlock"
      ? pin1.length >= minLen && pin1.length <= maxLen
      : pin1.length >= minLen && pin1.length <= maxLen && pin1 === pin2;

  // Detect Caps Lock state robustly
  React.useEffect(() => {
    let lastKnownCaps = false;

    const updateCaps = (e: KeyboardEvent) => {
      if (typeof e.getModifierState !== "function") return;

      let newCaps: boolean;

      if (e.key === "CapsLock") {
        // When the CapsLock key is pressed/released, toggle our known state
        // because getModifierState is unreliable during the CapsLock key event itself
        if (e.type === "keyup") {
          // On keyup of CapsLock, we toggle from our last known state
          newCaps = !lastKnownCaps;
        } else {
          // Ignore keydown of CapsLock - wait for keyup
          return;
        }
      } else {
        // For any other key, getModifierState is reliable
        newCaps = e.getModifierState("CapsLock");
      }

      lastKnownCaps = newCaps;
      setCaps(newCaps);
    };

    window.addEventListener("keydown", updateCaps, true);
    window.addEventListener("keyup", updateCaps, true);

    return () => {
      window.removeEventListener("keydown", updateCaps, true);
      window.removeEventListener("keyup", updateCaps, true);
    };
  }, []);

  return (
    <article>
      <dialog open>
        <article>
          <div className="rebel-pin-banner">
            <img
              className="rebel-pin-banner__logo"
              src={neuraiLogo.href}
              alt="Neurai"
            />
            <h3 className="rebel-pin-banner__text">Neurai Wallet</h3>
          </div>
          <hr className="rebel-pin-divider" />
          {mode === "unlock" ? (
            <span className="rebel-pin-title">{title}</span>
          ) : (
            <h3 className="rebel-pin-title">{title}</h3>
          )}
	          <p className="rebel-pin__hint">
	            {mode === "setup"
	              ? `Create a PIN (${minLen} to ${maxLen} characters) to protect your wallet on this device.`
	              : `Enter your PIN to unlock the wallet (${minLen} to ${maxLen} characters).`}
	          </p>

          <label>
            PIN
            <input
              type="password"
              value={pin1}
              onChange={(e) => setPin1(e.target.value)}
              autoFocus
              maxLength={maxLen}
              placeholder={`${minLen} to ${maxLen} characters`}
            />
          </label>

          {mode === "setup" && (
            <label>
              Repeat PIN
              <input
                type="password"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                maxLength={maxLen}
                placeholder="Repeat PIN"
              />
            </label>
          )}

	          {caps && (
	            <p className="rebel-pin__inline-status">
	              Caps Lock is ON
	            </p>
	          )}

	          {mode === "setup" && pin1 && pin2 && pin1 !== pin2 && (
	            <p className="rebel-pin__inline-status">
	              PINs do not match
	            </p>
	          )}

	          {error && (
	            <p className="rebel-pin__inline-status">{error}</p>
	          )}

	          <footer className="rebel-pin__footer">
	            <button className="rebel-pin-reset-button" onClick={onReset} type="button">
	              Reset wallet
	            </button>
            <button className="secondary" onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="primary"
              type="button"
              disabled={!canSubmit}
              onClick={() => onSubmit(pin1)}
            >
              OK
	            </button>
	          </footer>
	          <p className="rebel-pin__note">
	            If you forget your PIN, you will need to clear this site's stored data in your browser.
	          </p>
        </article>
      </dialog>
    </article>
  );
}
