import React, { ReactNode } from "react";
import { Routes } from "./Routes";
import { LightModeToggle } from "./components/LightModeToggle";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useNodeStatus } from "./hooks/useNodeStatus";
import { usePersistentState } from "./hooks/usePersistentState";
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

type RouteNavItemConfig = {
  type: "route";
  route: Routes;
  title: string;
  lockable?: boolean;
};

type PlaceholderNavItemConfig = {
  type: "placeholder";
  key: string;
  title: string;
  icon?: ReactNode;
};

type NavItemConfig = RouteNavItemConfig | PlaceholderNavItemConfig;

const NAV_ITEMS: NavItemConfig[] = [
  { type: "route", route: Routes.HOME, title: "Home" },
  { type: "route", route: Routes.SEND, title: "Send" },
  { type: "route", route: Routes.RECEIVE, title: "Receive" },
  { type: "route", route: Routes.SWEEP, title: "Sweep" },
  { type: "route", route: Routes.HISTORY, title: "History" },
  { type: "route", route: Routes.SIGN, title: "Sign" },
  { type: "route", route: Routes.CHAT, title: "Chat" },
  { type: "placeholder", key: "iot", title: "IoT", icon: <IconIoT /> },
  { type: "route", route: Routes.SETTINGS, title: "Settings", lockable: false },
];

const neuraiLogo = new URL("../neurai-xna-logo.png", import.meta.url);

export function Navigator({
  balance,
  wallet,
  currentRoute,
  setRoute,
  navLocked = false,
  hasPassphrase = false,
}: {
  balance: ReactNode;
  currentRoute: Routes;
  wallet: Wallet | null;
  setRoute: (route: Routes) => void;
  navLocked?: boolean;
  hasPassphrase?: boolean;
}) {
  // const networkDisplayName = networkInfo[wallet.network].displayName; // unused for now
  const isFromESP32 = localStorage.getItem("loginFromESP32") === "true";
  const { syncHealth, syncHint } = useNodeStatus(wallet);

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

  const [isCompact, setIsCompact] = usePersistentState<boolean>("rebelNavigatorCompact", false);

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

  const statusEntries = [
    {
      key: "sync",
      props: {
        title: syncHint,
        label: "Syncr",
        dotColor: syncColor,
        dotShadow: syncShadow,
        labelColor: syncHealth === "offline" ? "#ef4444" : "var(--muted-color)",
        live: true,
      },
    },
    {
      key: "passphrase",
      props: {
        title: hasPassphrase ? "Passphrase set" : "No passphrase",
        label: "Passphrase",
        dotColor: passphraseColor,
        dotShadow: passphraseShadow,
      },
    },
    {
      key: "hardware",
      props: {
        title: isFromESP32 ? "Hardware wallet" : "Not hardware",
        label: "HW",
        dotColor: hwColor,
        dotShadow: hwShadow,
      },
    },
  ];

  const renderStatusItems = (variant: "compact" | "full") => {
    const baseClass =
      "rebel-navigator__status-list" +
      (variant === "compact" ? " rebel-navigator__status-list--singleline" : "");

    return (
      <div
        className={baseClass}
        style={
          variant === "full"
            ? {
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "0.75rem",
                marginTop: "0.5rem",
                marginBottom: "0.5rem",
              }
            : undefined
        }
      >
        {statusEntries.map(({ key, props }) => (
          <StatusItem key={key} {...props} />
        ))}
      </div>
    );
  };

  const renderNavList = (variant: "full" | "icon", extraClassName = "") => {
    const baseClass =
      "rebel-navigator__list" +
      (variant === "icon" ? " rebel-navigator__list--icononly" : "") +
      (extraClassName ? ` ${extraClassName}` : "");

    return (
      <ul className={baseClass}>
        {NAV_ITEMS.map((item) => {
          if (item.type === "placeholder") {
            return (
              <PlaceholderNavItem
                key={item.key}
                title={item.title}
                icon={item.icon}
                variant={variant}
              />
            );
          }

          const disabled = navLocked && (item.lockable ?? true);

          return (
            <NavItem
              key={item.route}
              title={item.title}
              route={item.route}
              variant={variant}
              currentRoute={currentRoute}
              setRoute={setRoute}
              disabled={disabled}
            />
          );
        })}
      </ul>
    );
  };

  const renderCompactIconMenu = () =>
    renderNavList("icon", "rebel-navigator__list--icononly-singleline");

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

            {renderStatusItems("compact")}
          </div>

          <nav className="rebel-navigator rebel-navigator--icononly rebel-navigator__compact-center">
            {renderCompactIconMenu()}
          </nav>

          <div className="rebel-navigator__controls rebel-navigator__compact-right">
            <div className="rebel-navigator__controls rebel-navigator__compact-right-controls">
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
            <div className="rebel-navigator__compact-balance">
              {balance}
            </div>
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

          <h5>Rebel Wallet 1.0.9 - 16/12/2025</h5>

          {renderStatusItems("full")}

          {balance}

          <nav className="rebel-navigator">{renderNavList("full")}</nav>
        </>
      )}
      {/* <small>
        <NetworkSelect wallet={wallet} networks={networkInfo}></NetworkSelect>
      </small> */}
    </article>
  );
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

type NavItemVariant = "full" | "icon";

interface NavItemProps {
  currentRoute: Routes;
  route: Routes;
  setRoute: (route: Routes) => void;
  title: string;
  variant: NavItemVariant;
  disabled?: boolean;
}

function NavItem({ currentRoute, route, setRoute, title, variant, disabled }: NavItemProps) {
  const isCurrent = currentRoute === route;
  const classes =
    "rebel-navigator__list-item" +
    (variant === "icon" ? " rebel-navigator__list-item--icononly" : "") +
    (variant === "full" && isCurrent ? " rebel-navigator__list-item--active" : "");

  const style = disabled
    ? { display: "block", opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }
    : { display: "block" };

  return (
    <li className={classes}>
      <a
        href="#"
        className="primary rebel-navigator__list-item-link"
        onClick={(event) => {
          event.preventDefault();
          if (disabled) return false;
          setRoute(route);
          return false;
        }}
        style={style}
        aria-disabled={disabled || undefined}
        title={variant === "icon" ? title : undefined}
        aria-label={variant === "icon" ? title : undefined}
      >
        <Icon route={route} />
        {variant === "full" ? title : null}
      </a>
    </li>
  );
}

function PlaceholderNavItem({
  title,
  icon,
  variant,
}: {
  title: string;
  icon?: ReactNode;
  variant: NavItemVariant;
}) {
  const classes =
    "rebel-navigator__list-item" +
    (variant === "icon" ? " rebel-navigator__list-item--icononly" : "");
  return (
    <li className={classes}>
      <div
        className="primary rebel-navigator__list-item-link"
        style={{
          display: "block",
          opacity: 0.55,
          cursor: "default",
          pointerEvents: "none",
        }}
        title={variant === "icon" ? title : undefined}
        aria-label={variant === "icon" ? title : undefined}
      >
        {icon ? <div>{icon}</div> : null}
        {variant === "full" ? title : null}
      </div>
    </li>
  );
}

function StatusItem({
  title,
  label,
  dotColor,
  dotShadow,
  labelColor,
  live = false,
}: {
  title: string;
  label: string;
  dotColor: string;
  dotShadow: string;
  labelColor?: string;
  live?: boolean;
}) {
  return (
    <div
      className="rebel-navigator__status-item"
      title={title}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-label={`${label}: ${title}`}
    >
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
