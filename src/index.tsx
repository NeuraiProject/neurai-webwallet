import NeuraiWallet, { Wallet } from "@neuraiproject/neurai-jswallet";

// `ChainType` is not re-exported from the package's main entry, but we can
// derive it from the public `Wallet.network` field — avoids the deep
// `/dist/Types` import that bypasses the package's `exports` map.
type ChainType = Wallet["network"];
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
import "./styles/tailwind.css";
import "./styles/primitives.css";
import "./App.css";

import { formatRpcError } from "./utils/rpcError";
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
import { Asset } from "./Asset";
import { Sign } from "./sign/Sign";
import { Settings } from "./Settings";
import { IconEye, IconEyeOff, IconShield } from "./icons";
import { isAllowedNetwork, WALLET_BUILD } from "./buildTarget";

const DEFAULT_RPC_MAINNET = "https://rpc-depin.neurai.org/rpc";
const DEFAULT_RPC_TESTNET = "https://rpc-testnet.neurai.org/rpc";
import { Chat } from "./Chat";
import { IoT } from "./IoT";
import { useMempool } from "./hooks/useMempool";
import { useBlockCount } from "./hooks/useBlockCount";
import { useBalance } from "./hooks/useBalance";
import { useAssets } from "./hooks/useAssets";
import { useReceiveAddress } from "./hooks/useReceiveAddress";
import {
  deriveDepinChatIdentity,
  DepinChatIdentity,
  isDepinChatSupportedNetwork,
} from "./utils/depinChatIdentity";

const neuraiLogo = new URL("../public/neurai-xna-logo.png", import.meta.url);

let _mnemonic =
  "sight rate burger maid melody slogan attitude gas account sick awful hammer";

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

  // Determine network: prefer the user's selection from the Login picker
  // (`wallet_network`), falling back to the legacy URL/derivation_type logic for
  // existing users that have not picked yet.
  const [network, setNetwork] = React.useState<ChainType>(() => {
    const stored = localStorage.getItem("wallet_network");
    const validStored: ChainType[] = [
      "xna",
      "xna-test",
      "xna-legacy",
      "xna-legacy-test",
      "xna-pq",
      "xna-pq-test",
    ];
    if (stored && (validStored as string[]).includes(stored) && isAllowedNetwork(stored)) {
      return stored as ChainType;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const wantTestnet =
      WALLET_BUILD === "testnet" ||
      (WALLET_BUILD === "all" && searchParams.get("network") === "xna-test");
    const useLegacy = localStorage.getItem("derivation_type") === "legacy";

    if (wantTestnet) {
      return useLegacy ? "xna-legacy-test" : "xna-test";
    }
    return useLegacy ? "xna-legacy" : "xna";
  });

  const depinChatIdentity = React.useMemo<DepinChatIdentity | null>(() => {
    if (!mnemonic) return null;
    if (!isDepinChatSupportedNetwork(network)) return null;
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

    // A Login submission is in-flight: `onLogin` already set `pinGateMode =
    // "setup"` and `pendingMnemonicData`. If `setNetwork` was also called
    // with a different value in the same handler, this effect would otherwise
    // run after commit and reset `pinGateMode` to null because no mnemonic is
    // stored yet for the new network — causing Login to re-mount and the user
    // to lose the freshly-generated words.
    if (pendingMnemonicData) return;

    // If there is a stored mnemonic for the current network, require PIN
    // setup/unlock. When the user switches network in the Login picker, this
    // re-runs and reflects the new network's storage state.
    if (!hasStoredMnemonic(network)) {
      setPinGateMode(null);
      return;
    }

    setPinGateError(null);
    if (isStoredMnemonicPinProtected(network)) {
      setPinGateMode("unlock");
    } else {
      // Stored mnemonic exists but is not PIN-protected (legacy). We'll prompt for PIN creation
      // and migrate it once the user confirms.
      setPinGateMode("setup");
    }
  }, [mnemonic, network, pendingMnemonicData]);

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
        const isTestnetNetwork =
          network === "xna-test" ||
          network === "xna-legacy-test" ||
          network === "xna-pq-test";
        walletConfig.rpc_url = isTestnetNetwork ? DEFAULT_RPC_TESTNET : DEFAULT_RPC_MAINNET;
    }

    return walletConfig;
  }, [minAmountOfAddresses, mnemonic, network, passphrase]);

  const ensureWalletDefaults = React.useCallback((instance: Wallet) => {
    if (!instance.baseCurrency) {
      instance.baseCurrency = "XNA";
    }
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
              "Reset wallet? This will remove the wallet data stored in this browser for the current network. You will need your mnemonic to restore it."
            );
            if (!ok) return;
            clearStoredWalletSecrets(network);
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
                await setMnemonicWithPin(pendingMnemonicData, pin, {
                  persist: pendingPersist,
                  network,
                });
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
              "Reset wallet? This will remove the wallet data stored in this browser for the current network. You will need your mnemonic to restore it."
            );
            if (!ok) return;
            clearStoredWalletSecrets(network);
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
                const plaintext = await decryptStoredMnemonicDataWithPin(pin, network);
                if (!plaintext) {
                  const stored = getStoredMnemonicRaw(network);
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
                  const stored = getStoredMnemonicRaw(network);
                  const persist = stored?.location === "local";
                  await setMnemonicWithPin(plaintext, pin, { persist, network });
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
          setNetwork(data.network);
          setPendingMnemonicData(data.mnemonicData);
          setPendingPersist(data.persist);
          setPinGateMode("setup");
          setPinGateError(null);
        }}
        onNetworkChange={(net) => setNetwork(net)}
      />
    );
  }

  // Keep the initial splash visible for at least 2 seconds.
  if (!isSplashMinElapsed) {
    return <Loader />;
  }

  const signOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      clearStoredWalletSecrets(network);
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
          network={network}
        />

        <div className="rebel-content-container">
          <div className="rebel-content-container__content">
            <Settings
              signOut={signOut}
              mnemonic={mnemonic}
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
        network={network}
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

          {currentRoute === Routes.ASSET && <Asset wallet={wallet} />}

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
  const [showPin, setShowPin] = React.useState(false);
  const minLen = 6;
  const maxLen = 24;

  const title = mode === "setup" ? "Set a PIN" : "Enter your PIN";
  const eyebrow = mode === "setup" ? "First-time setup" : "Wallet locked";
  const description =
    mode === "setup"
      ? `Choose a PIN between ${minLen} and ${maxLen} characters. It will encrypt your recovery words on this device.`
      : `Enter the PIN you set when this wallet was created on this device (${minLen} to ${maxLen} characters).`;
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
    <dialog open className="modal modal-open">
      <div className="neurai-card w-full max-w-md flex flex-col gap-4 row-start-1 col-start-1">
        {/* Brand header — mirrors the Login hero card */}
        <div className="flex items-center gap-3">
          <img
            src={neuraiLogo.href}
            alt="Neurai logo"
            className="w-12 h-12 object-contain"
          />
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-primary leading-none m-0">
              Neurai Wallet
            </h2>
            <span className="text-[11px] text-base-content/55 uppercase tracking-widest mt-1">
              {eyebrow}
            </span>
          </div>
          <div className="ml-auto shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center [&_svg]:w-5 [&_svg]:h-5">
            <IconShield />
          </div>
        </div>

        <hr className="border-base-300 m-0" />

        <div>
          <h3 className="neurai-card__title mb-1">{title}</h3>
          <p className="text-sm text-base-content/80 m-0">{description}</p>
        </div>

        <form
          autoComplete="off"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit(pin1);
          }}
        >
          <div>
            <label htmlFor="rebel-pin-1" className="neurai-label">
              PIN
            </label>
            <div className="relative">
              <input
                id="rebel-pin-1"
                type={showPin ? "text" : "password"}
                className="neurai-input pr-12"
                value={pin1}
                onChange={(e) => setPin1(e.target.value)}
                autoFocus
                autoComplete="new-password"
                spellCheck={false}
                maxLength={maxLen}
                placeholder={`${minLen} to ${maxLen} characters`}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="neurai-btn--icon absolute top-1/2 right-2 -translate-y-1/2"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                tabIndex={-1}
              >
                {showPin ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </div>

          {mode === "setup" && (
            <div>
              <label htmlFor="rebel-pin-2" className="neurai-label">
                Repeat PIN
              </label>
              <input
                id="rebel-pin-2"
                type={showPin ? "text" : "password"}
                className="neurai-input"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                maxLength={maxLen}
                placeholder="Repeat PIN"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5 empty:hidden">
            {caps && (
              <p className="neurai-hint--warn m-0">⇪ Caps Lock is ON</p>
            )}
            {mode === "setup" && pin1 && pin2 && pin1 !== pin2 && (
              <p className="rounded-md bg-error/15 px-2 py-1 text-xs font-medium text-error m-0">
                PINs do not match
              </p>
            )}
            {error && (
              <p className="rounded-md bg-error/15 px-2 py-1 text-xs font-medium text-error m-0">
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end mt-2 flex-wrap">
            <button
              type="button"
              className="btn btn-ghost text-error mr-auto"
              onClick={onReset}
            >
              Reset wallet
            </button>
            <button
              type="button"
              className="neurai-btn--secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="neurai-btn--primary"
              disabled={!canSubmit}
            >
              {mode === "setup" ? "Save PIN" : "Unlock"}
            </button>
          </div>
        </form>

        <p className="neurai-hint m-0 pt-2 border-t border-base-300">
          ⓘ If you forget your PIN, you will need to clear this site's stored
          data in your browser and recover the wallet from your recovery words.
        </p>
      </div>
      <div className="modal-backdrop" />
    </dialog>
  );
}
