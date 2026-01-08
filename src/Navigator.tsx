import React, { ReactNode } from "react";
import { Routes } from "./Routes";
import { LightModeToggle } from "./components/LightModeToggle";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useNodeStatus } from "./hooks/useNodeStatus";
import { usePersistentState } from "./hooks/usePersistentState";
import "./Navigator.css";
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
import { BUILD_DATE } from "./buildDate";

type StatusTone = "ok" | "warn" | "error" | "muted";

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
  { type: "route", route: Routes.IOT, title: "IoT" },
  { type: "route", route: Routes.SETTINGS, title: "Settings", lockable: false },
];

const neuraiLogo = new URL("../public/neurai-xna-logo.png", import.meta.url);

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

  const syncTone: StatusTone =
    syncHealth === "ok"
      ? "ok"
      : syncHealth === "syncing"
        ? "warn"
        : syncHealth === "offline"
          ? "error"
          : "muted";

  const [isCompact, setIsCompact] = usePersistentState<boolean>("rebelNavigatorCompact", false);

  const passphraseTone: StatusTone = hasPassphrase ? "ok" : "error";

  const hwTone: StatusTone = isFromESP32 ? "ok" : "error";

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
        tone: syncTone,
        labelTone: syncHealth === "offline" ? "error" : undefined,
        live: true,
      },
    },
    {
      key: "passphrase",
      props: {
        title: hasPassphrase ? "Passphrase set" : "No passphrase",
        label: "Passphrase",
        tone: passphraseTone,
      },
    },
    {
      key: "hardware",
      props: {
        title: isFromESP32 ? "Hardware wallet" : "Not hardware",
        label: "HW",
        tone: hwTone,
      },
    },
  ];

  const renderStatusItems = (variant: "compact" | "full") => {
    const baseClass =
      "rebel-navigator__status-list" +
      (variant === "compact" ? " rebel-navigator__status-list--singleline" : "") +
      (variant === "full" ? " rebel-navigator__status-list--stacked" : "");

    return (
      <div className={baseClass}>
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

          <h5>Rebel Wallet 1.0.9 - {BUILD_DATE}</h5>

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
  const linkClassName =
    "primary rebel-navigator__list-item-link" +
    (disabled ? " rebel-navigator__list-item-link--disabled" : "");

  return (
    <li className={classes}>
      <a
        href="#"
        className={linkClassName}
        onClick={(event) => {
          event.preventDefault();
          if (disabled) return false;
          setRoute(route);
          return false;
        }}
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
        className="primary rebel-navigator__list-item-link rebel-navigator__list-item-link--placeholder"
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
  tone,
  labelTone,
  live = false,
}: {
  title: string;
  label: string;
  tone: StatusTone;
  labelTone?: StatusTone;
  live?: boolean;
}) {
  return (
    <div
      className={`rebel-navigator__status-item rebel-navigator__status-item--${tone}`}
      title={title}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-label={`${label}: ${title}`}
    >
      <span className="rebel-navigator__status-dot" />
      <span
        className={
          "rebel-navigator__status-label" +
          (labelTone ? ` rebel-navigator__status-label--${labelTone}` : "")
        }
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
  [Routes.IOT]: <IconIoT />,
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
