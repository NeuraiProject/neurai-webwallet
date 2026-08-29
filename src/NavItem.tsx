/**
 * One navigation entry.
 *
 * Split out of `Navigator` so it can be rendered on its own: the navigator
 * builds an asset URL with `import.meta`, which the CommonJS test runner cannot
 * load, and the state of a closed entry is exactly what needs pinning.
 */
import type { ReactElement, ReactNode } from "react";

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

import { Routes } from "./Routes";

export type NavItemVariant = "full" | "icon";

interface NavItemProps {
  currentRoute: Routes;
  route: Routes;
  setRoute: (route: Routes) => void;
  title: string;
  variant: NavItemVariant;
  disabled?: boolean;
  /** Why this entry is closed. Shown to the user, not just to the tooltip. */
  disabledReason?: string;
}

export function NavItem({
  currentRoute,
  route,
  setRoute,
  title,
  variant,
  disabled,
  disabledReason,
}: NavItemProps) {
  const isCurrent = currentRoute === route;
  const reasonId = disabledReason ? `nav-${route}-reason` : undefined;

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
        // An anchor cannot take `disabled`, so the equivalents are explicit:
        // no href to remove it from the tab order, aria-disabled to announce
        // the state, and the reason associated rather than hidden in a tooltip.
        {...(disabled ? {} : { href: "#" })}
        role="link"
        className={`${baseLink} ${stateLink} ${variant === "full" ? "py-2 text-sm font-light" : "py-1"}`}
        onClick={(event) => {
          event.preventDefault();
          if (disabled) return false;
          setRoute(route);
          return false;
        }}
        aria-disabled={disabled || undefined}
        aria-describedby={reasonId}
        title={disabledReason ?? (variant === "icon" ? title : undefined)}
        aria-label={variant === "icon" ? title : undefined}
      >
        <Icon route={route} />
        {variant === "full" ? title : null}
      </a>
      {disabledReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </li>
  );
}

const iconMapper: Record<Routes, ReactElement> = {
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
