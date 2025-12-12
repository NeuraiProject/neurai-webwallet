import React, { ReactNode } from "react";
import { Routes } from "./Routes";
import { LightModeToggle } from "./components/LightModeToggle";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import {
  IconChat,
  IconHistory,
  IconHome,
  IconIoT,
  IconReceive,
  IconSend,
  IconSettings,
  IconSign,
  IconSweep,
} from "./icons";
import { FaAnglesDown, FaAnglesUp } from "react-icons/fa6";
import networkInfo, { INetworks } from "./networkInfo";
import { getMnemonicAndPassphrase } from "./utils";

const neuraiLogo = new URL("../neurai-xna-logo.png", import.meta.url);

export function Navigator({
  balance,
  wallet,
  currentRoute,
  setRoute,
  navLocked = false,
}: {
  balance: ReactNode;
  currentRoute: Routes;
  wallet: Wallet | null;
  setRoute: (route: Routes) => void;
  navLocked?: boolean;
}) {
  // const networkDisplayName = networkInfo[wallet.network].displayName; // unused for now
  const { passphrase } = getMnemonicAndPassphrase();
  const hasPassphrase = passphrase !== "";
  const isFromESP32 = localStorage.getItem("loginFromESP32") === "true";

  type SyncHealth = "unknown" | "offline" | "syncing" | "ok";
  const [syncHealth, setSyncHealth] = React.useState<SyncHealth>("unknown");
  const [syncHint, setSyncHint] = React.useState<string>(
    "Checking RPC connectivity and node sync status…"
  );

  React.useEffect(() => {
    if (!wallet) {
      setSyncHealth("offline");
      setSyncHint("No RPC connectivity");
      return;
    }

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

    const checkSync = async () => {
      try {
        const info: any = await withTimeout(wallet.rpc("getblockchaininfo", []), 4500);

        if (cancelled) return;

        const blocks = typeof info?.blocks === "number" ? info.blocks : null;
        const headers = typeof info?.headers === "number" ? info.headers : null;
        const ibd = !!info?.initialblockdownload;
        const verificationProgress =
          typeof info?.verificationprogress === "number" ? info.verificationprogress : null;

        const isLikelySynced =
          !ibd &&
          (blocks === null || headers === null || Math.abs(headers - blocks) <= 2) &&
          (verificationProgress === null || verificationProgress >= 0.999);

        if (isLikelySynced) {
          setSyncHealth("ok");
          setSyncHint("RPC connected • Node synced");
          return;
        }

        setSyncHealth("syncing");
        if (ibd) {
          setSyncHint("RPC connected • Node syncing (IBD)");
        } else if (blocks !== null && headers !== null && headers > blocks) {
          setSyncHint(`RPC connected • Node syncing (${blocks}/${headers})`);
        } else {
          setSyncHint("RPC connected • Node not ready / not synced");
        }
      } catch (e: any) {
        if (cancelled) return;

        const message = String(e?.message || e || "");

        // If the RPC server is reachable but disallows the method, treat as "connected" but unknown sync.
        if (message.toLowerCase().includes("whitelist") || message.toLowerCase().includes("not in whitelist")) {
          setSyncHealth("syncing");
          setSyncHint("RPC connected • Sync status unavailable");
          return;
        }

        setSyncHealth("offline");
        setSyncHint("No RPC connectivity");
      }
    };

    checkSync();
    const intervalId = setInterval(checkSync, 30000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [wallet]);

  const syncColor =
    syncHealth === "ok"
      ? "#22c55e"
      : syncHealth === "syncing"
        ? "#f59e0b"
        : syncHealth === "offline"
          ? "#ef4444"
          : "#9ca3af";

  const syncShadow =
    syncHealth === "ok"
      ? "0 0 4px rgba(34, 197, 94, 0.6)"
      : syncHealth === "syncing"
        ? "0 0 4px rgba(245, 158, 11, 0.6)"
        : syncHealth === "offline"
          ? "0 0 4px rgba(239, 68, 68, 0.6)"
          : "0 0 4px rgba(156, 163, 175, 0.4)";

  const [isCompact, setIsCompact] = React.useState<boolean>(() => {
    const saved = localStorage.getItem("rebelNavigatorCompact");
    return saved === "true";
  });

  React.useEffect(() => {
    localStorage.setItem("rebelNavigatorCompact", String(isCompact));
  }, [isCompact]);

  const passphraseColor = hasPassphrase ? "#22c55e" : "#ef4444";
  const passphraseShadow = hasPassphrase
    ? "0 0 4px rgba(34, 197, 94, 0.6)"
    : "0 0 4px rgba(239, 68, 68, 0.6)";

  const hwColor = isFromESP32 ? "#22c55e" : "#ef4444";
  const hwShadow = isFromESP32
    ? "0 0 4px rgba(34, 197, 94, 0.6)"
    : "0 0 4px rgba(239, 68, 68, 0.6)";

  const onClickHome = (event: React.MouseEvent) => {
    setRoute(Routes.HOME);
    event.preventDefault();
    return false;
  };

  const renderCompactIconMenu = () => (
    <ul className="rebel-navigator__list rebel-navigator__list--icononly rebel-navigator__list--icononly-singleline">
      {navLocked ? (
        <DisabledIconOnlyLink title="Home" newRoute={Routes.HOME} />
      ) : (
        <IconOnlyLink setRoute={setRoute} title="Home" newRoute={Routes.HOME} />
      )}
      {navLocked ? (
        <DisabledIconOnlyLink title="Send" newRoute={Routes.SEND} />
      ) : (
        <IconOnlyLink setRoute={setRoute} title="Send" newRoute={Routes.SEND} />
      )}
      {navLocked ? (
        <DisabledIconOnlyLink title="Receive" newRoute={Routes.RECEIVE} />
      ) : (
        <IconOnlyLink setRoute={setRoute} title="Receive" newRoute={Routes.RECEIVE} />
      )}
      {navLocked ? (
        <DisabledIconOnlyLink title="Sweep" newRoute={Routes.SWEEP} />
      ) : (
        <IconOnlyLink setRoute={setRoute} title="Sweep" newRoute={Routes.SWEEP} />
      )}
      {navLocked ? (
        <DisabledIconOnlyLink title="History" newRoute={Routes.HISTORY} />
      ) : (
        <IconOnlyLink setRoute={setRoute} title="History" newRoute={Routes.HISTORY} />
      )}
      {navLocked ? (
        <DisabledIconOnlyLink title="Sign" newRoute={Routes.SIGN} />
      ) : (
        <IconOnlyLink setRoute={setRoute} title="Sign" newRoute={Routes.SIGN} />
      )}
      {navLocked ? (
        <DisabledIconOnlyLink title="Chat" newRoute={Routes.CHAT} />
      ) : (
        <IconOnlyLink setRoute={setRoute} title="Chat" newRoute={Routes.CHAT} />
      )}

      <PlaceholderIconOnlyItem title="IoT" icon={<IconIoT />} />

      <IconOnlyLink setRoute={setRoute} title="Settings" newRoute={Routes.SETTINGS} />
    </ul>
  );

  return (
    <article
      className={
        "rebel-navigator__container" + (isCompact ? " rebel-navigator__container--compact" : "")
      }
    >
      {isCompact ? (
        <>
        <div className="rebel-navigator__compact-grid">
          <div className="rebel-navigator__compact-left">
            <a href="#" className="primary" onClick={onClickHome}>
              <h2 className="rebel-headline rebel-navigator__brand">
                <img
                  src={neuraiLogo.href}
                  alt="Neurai logo"
                  className="rebel-navigator__brand-logo"
                />
                Neurai
              </h2>
            </a>

            <div className="rebel-navigator__status-list rebel-navigator__status-list--singleline">
              <StatusItem
                title={syncHint}
                label="Syncr"
                dotColor={syncColor}
                dotShadow={syncShadow}
                labelColor={syncHealth === "offline" ? "#ef4444" : "var(--muted-color)"}
              />
              <StatusItem
                title={hasPassphrase ? "Passphrase set" : "No passphrase"}
                label="Passphrase"
                dotColor={passphraseColor}
                dotShadow={passphraseShadow}
              />
              <StatusItem
                title={isFromESP32 ? "Hardware wallet" : "Not hardware"}
                label="HW"
                dotColor={hwColor}
                dotShadow={hwShadow}
              />
            </div>
          </div>

          <nav className="rebel-navigator rebel-navigator--icononly rebel-navigator__compact-center">
            {renderCompactIconMenu()}
          </nav>

          <div className="rebel-navigator__controls rebel-navigator__compact-right">
            <button
              className="outline rebel-navigator__compact-toggle"
              title="Expand menu"
              aria-label="Expand menu"
              onClick={() => setIsCompact(false)}
            >
              <FaAnglesDown />
            </button>
            <LightModeToggle />
          </div>
        </div>

        <div className="rebel-navigator__compact-mobile-icons" aria-label="Compact menu">
          <nav className="rebel-navigator rebel-navigator--icononly">
            {renderCompactIconMenu()}
          </nav>
        </div>
        </>
      ) : (
        <>
          <div className="rebel-navigator__topbar">
            <a href="#" className="primary" onClick={onClickHome}>
              <h2 className="rebel-headline rebel-navigator__brand">
                <img
                  src={neuraiLogo.href}
                  alt="Neurai logo"
                  className="rebel-navigator__brand-logo"
                />
                Neurai
              </h2>
            </a>

            <div className="rebel-navigator__controls">
              <button
                className="outline rebel-navigator__compact-toggle"
                title="Compact menu"
                aria-label="Compact menu"
                onClick={() => setIsCompact(true)}
              >
                <FaAnglesUp />
              </button>
              <LightModeToggle />
            </div>
          </div>

          <h5>Rebel Wallet 1.0.9</h5>

          {/* Syncr indicator */}
          <div
            title={syncHint}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: syncColor,
                boxShadow: syncShadow,
              }}
            />
            <span
              style={{
                fontSize: "0.85rem",
                color: syncHealth === "offline" ? "#ef4444" : "var(--muted-color)",
              }}
            >
              Syncr
            </span>
          </div>

          {/* Passphrase indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: passphraseColor,
                boxShadow: passphraseShadow,
              }}
            />
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--muted-color)",
              }}
            >
              Passphrase
            </span>
          </div>

          {/* Hardware (ESP32) indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: hwColor,
                boxShadow: hwShadow,
              }}
            />
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--muted-color)",
              }}
            >
              HW
            </span>
          </div>

          {balance}

          <nav className="rebel-navigator">
            <ul className="rebel-navigator__list">
              {navLocked ? (
                <DisabledLink title="Home" newRoute={Routes.HOME} />
              ) : (
                <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.HOME} title="Home" />
              )}
              {navLocked ? (
                <DisabledLink title="Send" newRoute={Routes.SEND} />
              ) : (
                <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.SEND} title="Send" />
              )}
              {navLocked ? (
                <DisabledLink title="Receive" newRoute={Routes.RECEIVE} />
              ) : (
                <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.RECEIVE} title="Receive" />
              )}
              {navLocked ? (
                <DisabledLink title="Sweep" newRoute={Routes.SWEEP} />
              ) : (
                <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.SWEEP} title="Sweep" />
              )}
              {navLocked ? (
                <DisabledLink title="History" newRoute={Routes.HISTORY} />
              ) : (
                <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.HISTORY} title="History" />
              )}
              {navLocked ? (
                <DisabledLink title="Sign" newRoute={Routes.SIGN} />
              ) : (
                <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.SIGN} title="Sign" />
              )}
              {navLocked ? (
                <DisabledLink title="Chat" newRoute={Routes.CHAT} />
              ) : (
                <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.CHAT} title="Chat" />
              )}

              <PlaceholderItem title="IoT" icon={<IconIoT />} />

              <Link currentRoute={currentRoute} setRoute={setRoute} newRoute={Routes.SETTINGS} title="Settings" />
            </ul>
          </nav>
        </>
      )}
      {/* <small>
        <NetworkSelect wallet={wallet} networks={networkInfo}></NetworkSelect>
      </small> */}
    </article>
  );
}

interface ILinkProps {
  currentRoute: Routes;
  newRoute: Routes;
  setRoute: (route: Routes) => void;
  title: string;
}

type NetworkInfoProps = {
  wallet: Wallet;
  networks: INetworks;
};

function NetworkSelect({ wallet, networks }: NetworkInfoProps) {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newNetwork = event.target.value;

    // Update the URL and reload the page with the new network query parameter
    const newUrl = `${window.location.pathname}?network=${newNetwork}`;
    window.location.href = newUrl;
  };

  const options = Object.keys(networks).map((network: string) => {
    const info = networks[network];
    return (
      <option key={network} value={network}>
        {info.displayName}
      </option>
    );
  });

  return (
    <select value={wallet.network} onChange={handleChange}>
      {options}
    </select>
  );
}

function Link({ currentRoute, newRoute, setRoute, title }: ILinkProps) {
  const isCurrent = currentRoute === newRoute;
  const classes =
    "rebel-navigator__list-item" +
    (isCurrent ? " rebel-navigator__list-item--active" : "");
  return (
    <li className={classes}>
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        onClick={(event) => {
          setRoute(newRoute);
          event.preventDefault();
          return false;
        }}
        style={{ display: "block" }}
      >
        <Icon route={newRoute} />
        {title}
      </a>
    </li>
  );
}

function DisabledLink({ title, newRoute }: { title: string; newRoute: Routes }) {
  return (
    <li className={"rebel-navigator__list-item"}>
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          return false;
        }}
        style={{
          display: "block",
          opacity: 0.45,
          cursor: "not-allowed",
          pointerEvents: "none",
        }}
      >
        <Icon route={newRoute} />
        {title}
      </a>
    </li>
  );
}

function PlaceholderItem({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <li className={"rebel-navigator__list-item"}>
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          return false;
        }}
        style={{
          display: "block",
          opacity: 0.55,
          cursor: "default",
          pointerEvents: "none",
        }}
      >
        {icon ? <div>{icon}</div> : null}
        {title}
      </a>
    </li>
  );
}

function StatusItem({
  title,
  label,
  dotColor,
  dotShadow,
  labelColor,
}: {
  title: string;
  label: string;
  dotColor: string;
  dotShadow: string;
  labelColor?: string;
}) {
  return (
    <div className="rebel-navigator__status-item" title={title}>
      <span
        className="rebel-navigator__status-dot"
        style={{ backgroundColor: dotColor, boxShadow: dotShadow }}
      />
      <span
        className="rebel-navigator__status-label"
        style={{ color: labelColor ?? "var(--muted-color)" }}
      >
        {label}
      </span>
    </div>
  );
}

function IconOnlyLink({
  setRoute,
  title,
  newRoute,
}: {
  setRoute: (route: Routes) => void;
  title: string;
  newRoute: Routes;
}) {
  return (
    <li className="rebel-navigator__list-item rebel-navigator__list-item--icononly">
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        title={title}
        aria-label={title}
        onClick={(event) => {
          setRoute(newRoute);
          event.preventDefault();
          return false;
        }}
        style={{ display: "block" }}
      >
        <Icon route={newRoute} />
      </a>
    </li>
  );
}

function DisabledIconOnlyLink({ title, newRoute }: { title: string; newRoute: Routes }) {
  return (
    <li className="rebel-navigator__list-item rebel-navigator__list-item--icononly">
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        title={title}
        aria-label={title}
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          return false;
        }}
        style={{
          display: "block",
          opacity: 0.45,
          cursor: "not-allowed",
          pointerEvents: "none",
        }}
      >
        <Icon route={newRoute} />
      </a>
    </li>
  );
}

function PlaceholderIconOnlyItem({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <li className="rebel-navigator__list-item rebel-navigator__list-item--icononly">
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        title={title}
        aria-label={title}
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          return false;
        }}
        style={{
          display: "block",
          opacity: 0.55,
          cursor: "default",
          pointerEvents: "none",
        }}
      >
        <div>{icon}</div>
      </a>
    </li>
  );
}
//Icons from https://feathericons.com/
const iconMapper: Record<Routes, JSX.Element> = {
  [Routes.HOME]: <IconHome />,
  [Routes.HISTORY]: <IconHistory />,
  [Routes.RECEIVE]: <IconReceive />,
  [Routes.SEND]: <IconSend />,
  [Routes.CHAT]: <IconChat />,
  [Routes.SETTINGS]: <IconSettings />,
  [Routes.SIGN]: <IconSign />,
  [Routes.SWEEP]: <IconSweep />,
};
function Icon({ route }: { route: Routes }) {
  return <div>{iconMapper[route]}</div>;
}
