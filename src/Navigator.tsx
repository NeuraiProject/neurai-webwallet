import React, { ReactNode } from "react";
import { Routes } from "./Routes";
import { LightModeToggle } from "./components/LightModeToggle";
import { Wallet } from "@neuraiproject/neurai-jswallet";
import { useNodeStatus } from "./hooks/useNodeStatus";
import { usePersistentState } from "./hooks/usePersistentState";
import {
  IconAsset,
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
  { type: "route", route: Routes.ASSET, title: "Asset" },
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
  // Narrow-viewport drawer state. In compact mode below `xl` the icon menu
  // hides behind a tappable bottom edge; clicking it (or any of the icons,
  // or the header itself) toggles the drawer.
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const passphraseTone: StatusTone = hasPassphrase ? "ok" : "error";
  const hwTone: StatusTone = "error";

  const onClickHome = (event: React.MouseEvent) => {
    setRoute(Routes.HOME);
    event.preventDefault();
    return false;
  };

  const statusEntries: Array<{
    key: string;
    title: string;
    label: string;
    tone: StatusTone;
    labelTone?: StatusTone;
    live?: boolean;
  }> = [
    {
      key: "sync",
      title: syncHint,
      label: "Syncr",
      tone: syncTone,
      labelTone: syncHealth === "offline" ? "error" : undefined,
      live: true,
    },
    {
      key: "passphrase",
      title: hasPassphrase ? "Passphrase set" : "No passphrase",
      label: "Passphrase",
      tone: passphraseTone,
    },
    {
      key: "hardware",
      title: "No hardware wallet connected",
      label: "HW",
      tone: hwTone,
    },
  ];

  const renderStatusItems = (variant: "compact" | "full") => (
    <div
      className={
        variant === "compact"
          ? "flex items-center gap-3 flex-nowrap whitespace-nowrap text-xs"
          : "flex flex-col items-start gap-2 my-2 text-xs"
      }
    >
      {statusEntries.map(({ key, ...rest }) => (
        <StatusItem key={key} {...rest} />
      ))}
    </div>
  );

  const renderNavList = (variant: "full" | "icon") => {
    const wrapperClass =
      variant === "full"
        ? "grid grid-cols-3 md:grid-cols-6 gap-1 list-none m-0 p-0 text-center"
        : "flex items-center justify-center gap-8 list-none m-0 p-0 flex-nowrap w-full";

    return (
      <ul className={wrapperClass}>
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

  return (
    <div className={isCompact ? "neurai-card neurai-card--compact" : "neurai-card"}>
      {isCompact ? (
        <>
          <div
            className="flex items-center gap-3 flex-wrap xl:cursor-default"
            onClick={() => {
              // On narrow viewports, tapping the header again collapses the
              // drawer if it's open. The check on innerWidth keeps the wide
              // (xl) layout — where the menu is always inline — unaffected.
              if (isMenuOpen && window.innerWidth < 1280) setIsMenuOpen(false);
            }}
          >
            {/* Brand + status */}
            <div className="flex flex-col gap-1 shrink-0">
              <a
                href="#"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickHome(e);
                }}
                className="flex items-center gap-1.5 text-primary font-semibold no-underline"
              >
                <img src={neuraiLogo.href} alt="Neurai logo" className="w-8 h-8 object-contain" />
                <span className="text-xl">Neurai</span>
              </a>
              {renderStatusItems("compact")}
            </div>

            {/* Icon menu — visible only on wide screens, hidden on narrow */}
            <nav className="flex-1 min-w-0 hidden xl:block">
              {renderNavList("icon")}
            </nav>

            {/* Right-side controls + balance */}
            <div
              className="flex flex-col items-end gap-1 ml-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="neurai-btn--icon hidden xl:inline-flex"
                  title="Expand menu"
                  aria-label="Expand menu"
                  onClick={() => setIsCompact(false)}
                >
                  <FaAnglesDown />
                </button>
                <LightModeToggle />
              </div>
              <div className="text-right text-base font-bold leading-tight [&_.balance-amount]:!text-base [&_.balance-amount]:!font-bold [&_.balance-amount]:!mb-0 [&_.balance-price]:!hidden [&_small]:!hidden">
                {balance}
              </div>
            </div>
          </div>

          {/* Hamburger handle: 3 thin horizontal lines flush with the card's
              bottom edge. Only visible <xl. Tapping toggles the icon drawer. */}
          <button
            type="button"
            onClick={() => setIsMenuOpen((v) => !v)}
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "Hide menu" : "Show menu"}
            className="xl:hidden w-full mt-3 -mx-4 -mb-3 px-4 pt-2 pb-1.5 flex flex-col items-center gap-[3px] text-base-content/50 hover:text-primary transition-colors cursor-pointer"
          >
            <span aria-hidden="true" className="block h-0.5 w-7 bg-current rounded-full" />
            <span aria-hidden="true" className="block h-0.5 w-7 bg-current rounded-full" />
            <span aria-hidden="true" className="block h-0.5 w-7 bg-current rounded-full" />
          </button>

          {/* Drawer with icons in 2 rows. Only visible <xl AND when open.
              Tapping any icon also closes the drawer (event bubbles up from
              the NavItem links to this wrapper). */}
          {isMenuOpen && (
            <div
              className="xl:hidden mt-2"
              aria-label="Compact menu"
              onClick={() => setIsMenuOpen(false)}
            >
              <nav>
                <ul className="grid grid-cols-5 gap-2 list-none m-0 p-0">
                  {NAV_ITEMS.map((item) => {
                    if (item.type === "placeholder") {
                      return (
                        <PlaceholderNavItem
                          key={item.key}
                          title={item.title}
                          icon={item.icon}
                          variant="icon"
                        />
                      );
                    }
                    const disabled = navLocked && (item.lockable ?? true);
                    return (
                      <NavItem
                        key={item.route}
                        title={item.title}
                        route={item.route}
                        variant="icon"
                        currentRoute={currentRoute}
                        setRoute={setRoute}
                        disabled={disabled}
                      />
                    );
                  })}
                </ul>
              </nav>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <a href="#" onClick={onClickHome} className="flex items-center gap-1.5 text-primary font-semibold no-underline">
              <img src={neuraiLogo.href} alt="Neurai logo" className="w-8 h-8 object-contain" />
              <span className="text-xl">Neurai</span>
            </a>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="neurai-btn--icon"
                title="Compact menu"
                aria-label="Compact menu"
                onClick={() => setIsCompact(true)}
              >
                <FaAnglesUp />
              </button>
              <LightModeToggle />
            </div>
          </div>

          <h5 className="text-sm text-base-content/60 mt-3 mb-2 font-normal">
            Rebel Wallet 1.0.9 - {BUILD_DATE}
          </h5>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 my-3">
            <div>{renderStatusItems("full")}</div>
            <div className="text-center sm:col-start-2">{balance}</div>
          </div>

          <nav className="mt-3">{renderNavList("full")}</nav>
        </>
      )}
    </div>
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

  const liClass = variant === "icon" ? "px-1 py-1" : "p-3";

  const baseLink =
    "flex flex-col items-center justify-center gap-1 rounded-md transition-colors no-underline relative";
  const stateLink = disabled
    ? "text-base-content/40 cursor-not-allowed pointer-events-none"
    : isCurrent
      ? "text-primary after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:-bottom-1.5 after:h-0.5 after:w-6 after:rounded-full after:bg-primary"
      : "text-base-content hover:text-primary";

  return (
    <li className={liClass}>
      <a
        href="#"
        className={`${baseLink} ${stateLink} ${variant === "full" ? "py-2 text-sm font-light" : "py-1"}`}
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
  const liClass = variant === "icon" ? "px-1 py-1" : "p-3";
  return (
    <li className={liClass}>
      <div
        className="flex flex-col items-center justify-center gap-1 text-base-content/45 cursor-default pointer-events-none"
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
  const toneClass =
    tone === "ok" ? "is-ok" : tone === "warn" ? "is-warn" : tone === "error" ? "is-error" : "";
  const labelToneClass =
    labelTone === "error" ? "text-error" : "text-base-content/80";

  return (
    <div
      className={`neurai-status ${toneClass}`}
      title={title}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      aria-label={`${label}: ${title}`}
    >
      <span className="neurai-status__dot" />
      <span className={labelToneClass}>{label}</span>
    </div>
  );
}

const iconMapper: Record<Routes, JSX.Element> = {
  [Routes.HOME]: <IconHome />,
  [Routes.HISTORY]: <IconHistory />,
  [Routes.IOT]: <IconIoT />,
  [Routes.RECEIVE]: <IconReceive />,
  [Routes.ASSET]: <IconAsset />,
  [Routes.SEND]: <IconSend />,
  [Routes.CHAT]: <IconChat />,
  [Routes.SETTINGS]: <IconSettings />,
  [Routes.SIGN]: <IconSign />,
  [Routes.SWEEP]: <IconSweep />,
};

function Icon({ route }: { route: Routes }) {
  return <div>{iconMapper[route]}</div>;
}
