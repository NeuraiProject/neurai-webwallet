import React from "react";
import {
  ADDRESS_FAMILIES,
  CHAIN_KINDS,
  defaultFamily,
  describeNetwork,
  isChainAvailable,
  isChoiceAvailable,
  networkFor,
  OLD_WEBWALLET_NETWORK,
  type AddressFamily,
  type ChainKind,
  type NetworkOption,
} from "../networkOptions";

/**
 * Two-step network picker for the login form.
 *
 * The wallet library names a chain and an address type with a single string
 * (`xna-ecdsa-test`), which made the old single `<select>` list every
 * combination at once. Here the two questions are asked in order — which
 * network, then which kind of address.
 */
export function NetworkPicker({
  network,
  onChange,
}: {
  network: NetworkOption;
  onChange: (network: NetworkOption) => void;
}) {
  const { kind, family } = describeNetwork(network);
  const chains = CHAIN_KINDS.filter(({ value }) => isChainAvailable(value));

  // Each chain opens on its own default family: carrying the previous pick over
  // would land on Legacy when switching to testnet, where ECDSA is the one to
  // test against.
  const selectChain = (next: ChainKind) => {
    if (next === kind) return;
    onChange(networkFor(next, defaultFamily(next)));
  };

  return (
    <div className="flex flex-col gap-4">
      {chains.length > 1 && (
        <div>
          <span id="network-chain-label" className="neurai-label">
            Network
          </span>
          <div
            role="radiogroup"
            aria-labelledby="network-chain-label"
            className="neurai-choice-grid grid-cols-1 sm:grid-cols-2"
          >
            {chains.map((chain) => (
              <ChoiceTile
                key={chain.value}
                name="network-chain"
                checked={chain.value === kind}
                onSelect={() => selectChain(chain.value)}
              >
                <span className="neurai-choice__name">{chain.label}</span>
                <span className="neurai-choice__desc">{chain.summary}</span>
              </ChoiceTile>
            ))}
          </div>
        </div>
      )}

      <div>
        <span id="network-family-label" className="neurai-label">
          Address type
        </span>
        <AddressTypeSelect
          kind={kind}
          family={family}
          onSelect={(next) => onChange(networkFor(kind, next))}
        />
        <p className="neurai-hint">Each network keeps its own seed on this device.</p>
      </div>
    </div>
  );
}

/**
 * The previous web wallet's derivation of the Mainnet Legacy addresses.
 *
 * Same address type on a different coin type, so it belongs next to the words
 * being recovered rather than among the network questions: it is something
 * about the wallet being opened, not a network to open it on. There is nothing
 * to derive it from, so it only appears where that derivation exists.
 */
export function OldWebwalletToggle({
  network,
  onChange,
}: {
  network: NetworkOption;
  onChange: (network: NetworkOption) => void;
}) {
  const { kind, family, oldWebwallet } = describeNetwork(network);
  if (kind !== "mainnet" || family !== "legacy") return null;
  return (
    <label htmlFor="old-webwallet" className="flex items-start gap-2 cursor-pointer text-sm">
      <input
        type="checkbox"
        id="old-webwallet"
        className="checkbox checkbox-sm checkbox-primary mt-0.5"
        checked={oldWebwallet}
        onChange={(event) =>
          onChange(event.target.checked ? OLD_WEBWALLET_NETWORK : networkFor("mainnet", "legacy"))
        }
      />
      <span>
        These words are from the old web wallet{" "}
        <span className="text-base-content/60 font-normal">(coin type 0 derivation)</span>
      </span>
    </label>
  );
}

/**
 * The chosen address type, with the other two a click away.
 *
 * Three rows side by side cost more height than the choice deserves — it is
 * made once, and Legacy is the only answer on mainnet — so only the chosen one
 * stays on screen. The list opens over what follows rather than pushing it
 * down, so the form does not jump while it is open.
 */
function AddressTypeSelect({
  kind,
  family,
  onSelect,
}: {
  kind: ChainKind;
  family: AddressFamily;
  onSelect: (family: AddressFamily) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const selected = ADDRESS_FAMILIES.find(({ value }) => value === family) ?? ADDRESS_FAMILIES[0];

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  // An overlay left open would sit on top of the rest of the form.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      close(true);
    } else if (event.key === "Enter" && open) {
      // Radios are inside a form: without this, Enter would submit it.
      event.preventDefault();
      close(true);
    }
  };

  return (
    <div className="neurai-dropdown" ref={wrapper} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={trigger}
        className="neurai-choice neurai-choice--trigger is-selected"
        aria-expanded={open}
        aria-controls="network-family-options"
        onClick={() => setOpen(!open)}
      >
        <span className="neurai-choice__body">
          <FamilyText entry={selected} kind={kind} />
        </span>
        <IconChevron />
      </button>

      <div
        id="network-family-options"
        role="radiogroup"
        aria-labelledby="network-family-label"
        className="neurai-dropdown__panel neurai-choice-grid"
        hidden={!open}
      >
        {ADDRESS_FAMILIES.map((entry) => {
          const available = isChoiceAvailable(kind, entry.value);
          return (
            <ChoiceTile
              key={entry.value}
              name="network-family"
              checked={entry.value === family}
              disabled={!available}
              onSelect={() => onSelect(entry.value)}
              // A pointer click is a finished choice, so the list closes. Arrow
              // keys also change the selection, and those must leave it open;
              // a click they synthesise carries `detail === 0`.
              onClick={(event) => {
                if (event.detail > 0) close(false);
              }}
              title={available ? undefined : `${entry.label} is not active on ${kind} yet.`}
            >
              <FamilyText entry={entry} kind={kind} badge={available ? undefined : "soon"} />
            </ChoiceTile>
          );
        })}
      </div>
    </div>
  );
}

/** Name, explanation and a sample address: the same body in row and trigger. */
function FamilyText({
  badge,
  entry,
  kind,
}: {
  badge?: string;
  entry: (typeof ADDRESS_FAMILIES)[number];
  kind: ChainKind;
}) {
  const prefix = entry.prefix[kind];
  const sample = entry.sample[kind];
  return (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="neurai-choice__name">{entry.label}</span>
        {badge && <span className="neurai-choice__badge">{badge}</span>}
        <span className="neurai-choice__desc">{entry.summary}</span>
      </span>
      {/* Cut at the end when it does not fit; the whole address is on the
          title. Read aloud it is noise, so screen readers get the shape. */}
      <span
        className="neurai-choice__address"
        title={sample}
        aria-label={`example address starting with ${prefix}`}
      >
        <span className="neurai-choice__prefix">{prefix}</span>
        {sample.slice(prefix.length)}
      </span>
    </>
  );
}

/** The radio mark and the frame; the caller lays out the body. */
function ChoiceTile({
  checked,
  children,
  disabled,
  name,
  onClick,
  onSelect,
  title,
}: {
  checked: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  name: string;
  onClick?: (event: React.MouseEvent) => void;
  onSelect: () => void;
  title?: string;
}) {
  return (
    <label
      className={`neurai-choice ${checked ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
      title={title}
      onClick={onClick}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="neurai-choice__mark" aria-hidden="true" />
      <span className="neurai-choice__body">{children}</span>
    </label>
  );
}

function IconChevron() {
  return (
    <svg
      className="neurai-choice__chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
