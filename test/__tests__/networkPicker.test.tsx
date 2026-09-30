/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NetworkPicker, OldWebwalletToggle } from "@/components/NetworkPicker";
import { defaultLoginNetwork, type NetworkOption } from "@/networkOptions";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The picker is controlled: mirror the parent so a pick shows on screen. The
 * toggle sits beside it, the way Login places it under the recovery words.
 */
function Harness({
  onPick,
  withOldWebwallet = true,
}: {
  onPick: (network: NetworkOption) => void;
  withOldWebwallet?: boolean;
}) {
  const [network, setNetwork] = React.useState<NetworkOption>(defaultLoginNetwork);
  const change = (next: NetworkOption) => {
    setNetwork(next);
    onPick(next);
  };
  return (
    <>
      <NetworkPicker network={network} onChange={change} />
      {withOldWebwallet && <OldWebwalletToggle network={network} onChange={change} />}
    </>
  );
}

/**
 * The tile for an option. Scoped to `label` so it never matches the dropdown
 * trigger, which repeats the chosen family's text inside a `<button>`.
 */
function tile(container: HTMLElement, label: string): HTMLLabelElement {
  const tiles = [...container.querySelectorAll<HTMLLabelElement>("label.neurai-choice")];
  const found = tiles.find(
    (node) => node.querySelector(".neurai-choice__name")?.textContent === label
  );
  if (!found) {
    const seen = tiles.map((node) => node.querySelector(".neurai-choice__name")?.textContent);
    throw new Error(`no tile labelled ${label}; saw ${seen}`);
  }
  return found;
}

/** The button that opens the address type list, and the list itself. */
const trigger = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>(".neurai-choice--trigger")!;
const panel = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("#network-family-options")!;

const radio = (container: HTMLElement, label: string) =>
  tile(container, label).querySelector<HTMLInputElement>("input")!;

/** The bold start of the sample address shown on a family tile. */
const prefix = (container: HTMLElement, label: string) =>
  tile(container, label).querySelector(".neurai-choice__prefix")!.textContent;

/** The whole sample address on a family tile; CSS cuts the tail when needed. */
const sample = (container: HTMLElement, label: string) =>
  tile(container, label).querySelector(".neurai-choice__address")!.textContent;

async function mount(withOldWebwallet?: boolean) {
  const onPick = jest.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () =>
    root.render(<Harness onPick={onPick} withOldWebwallet={withOldWebwallet} />)
  );
  // `HTMLElement.click()` reports `detail: 0`, which is how a keyboard-driven
  // activation looks; the dropdown only treats `detail > 0` as a finished
  // choice, so a test standing in for a real click has to say so.
  const click = async (label: string) => {
    await act(async () => {
      radio(container, label).dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
      );
    });
  };
  const open = async () => {
    await act(async () => trigger(container).click());
  };
  return { container, onPick, click, open, unmount: () => act(async () => root.unmount()) };
}

test("opens on mainnet Legacy, with the families mainnet cannot use yet still visible", async () => {
  const { container, unmount } = await mount();
  try {
    expect(radio(container, "Mainnet").checked).toBe(true);
    expect(radio(container, "Legacy").checked).toBe(true);
    for (const family of ["ECDSA", "PQ"]) {
      expect(radio(container, family).disabled).toBe(true);
      expect(tile(container, family).className).toContain("is-disabled");
      expect(tile(container, family).textContent).toContain("soon");
    }
    expect(tile(container, "Legacy").className).toContain("is-selected");
    // Mainnet samples, not the testnet ones, and each row explains itself.
    expect(prefix(container, "Legacy")).toBe("N");
    expect(prefix(container, "ECDSA")).toBe("nq1r");
    expect(prefix(container, "PQ")).toBe("pq1z");
    expect(sample(container, "Legacy")).toBe("NZCg1vAEJ9Cjsbqbo97eFquRo4spLXpLax");
    expect(tile(container, "Legacy").textContent).toContain("Base58 addresses");
  } finally {
    await unmount();
  }
});

test("testnet enables every family and lands on ECDSA", async () => {
  const { container, onPick, click, unmount } = await mount();
  try {
    await click("Testnet");
    expect(onPick).toHaveBeenLastCalledWith("xna-ecdsa-test");
    expect(radio(container, "ECDSA").checked).toBe(true);
    for (const family of ["Legacy", "ECDSA", "PQ"]) {
      expect(radio(container, family).disabled).toBe(false);
    }
    expect(prefix(container, "ECDSA")).toBe("tnq1r");
    expect(prefix(container, "Legacy")).toBe("t");
    expect(prefix(container, "PQ")).toBe("tpq1z");
    expect(sample(container, "Legacy")).toBe("tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3");

    await click("PQ");
    expect(onPick).toHaveBeenLastCalledWith("xna-pq-strict-test");
    await click("Legacy");
    expect(onPick).toHaveBeenLastCalledWith("xna-legacy-test");
  } finally {
    await unmount();
  }
});

test("returning to mainnet from a family mainnet cannot use falls back to Legacy", async () => {
  const { onPick, click, unmount } = await mount();
  try {
    await click("Testnet");
    await click("PQ");
    await click("Mainnet");
    expect(onPick).toHaveBeenLastCalledWith("xna");
  } finally {
    await unmount();
  }
});

test("the old web wallet derivation is offered only under mainnet Legacy", async () => {
  const { container, onPick, click, unmount } = await mount();
  const oldWallet = () => container.querySelector<HTMLInputElement>("#old-webwallet");
  try {
    expect(oldWallet()!.checked).toBe(false);
    await act(async () => oldWallet()!.click());
    expect(onPick).toHaveBeenLastCalledWith("xna-legacy");
    expect(oldWallet()!.checked).toBe(true);
    // Unchecking goes back to the current derivation, not to another family.
    await act(async () => oldWallet()!.click());
    expect(onPick).toHaveBeenLastCalledWith("xna");

    await click("Testnet");
    expect(oldWallet()).toBeNull();
  } finally {
    await unmount();
  }
});

test("the network picker alone never offers the old derivation", async () => {
  // Login leaves the toggle out of the Create branch, so a new wallet cannot
  // land on coin type 0; the picker itself must not put it back.
  const { container, unmount } = await mount(false);
  try {
    expect(container.querySelector("#old-webwallet")).toBeNull();
    expect(radio(container, "Legacy").checked).toBe(true);
  } finally {
    await unmount();
  }
});

test("the address type list stays shut until asked, and shuts again on a pick", async () => {
  const { container, onPick, click, open, unmount } = await mount();
  try {
    // Collapsed, showing the chosen family and saying it can be opened.
    expect(panel(container).hidden).toBe(true);
    expect(trigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(trigger(container).textContent).toContain("Legacy");
    expect(trigger(container).querySelector(".neurai-choice__prefix")!.textContent).toBe("N");

    await open();
    expect(panel(container).hidden).toBe(false);
    expect(trigger(container).getAttribute("aria-expanded")).toBe("true");

    // Testnet, so every family can be picked and the list closes behind it.
    await click("Testnet");
    await open();
    await click("PQ");
    expect(onPick).toHaveBeenLastCalledWith("xna-pq-strict-test");
    expect(panel(container).hidden).toBe(true);
    expect(trigger(container).textContent).toContain("PQ");
    expect(trigger(container).querySelector(".neurai-choice__prefix")!.textContent).toBe("tpq1z");
  } finally {
    await unmount();
  }
});

test("moving through the list with the keyboard keeps it open; Escape closes it", async () => {
  const { container, onPick, click, open, unmount } = await mount();
  try {
    // Testnet, where every family can actually be moved onto.
    await click("Testnet");
    await open();

    // What a keyboard activation looks like: a click reporting `detail: 0`,
    // which is exactly what `HTMLElement.click()` produces.
    await act(async () => radio(container, "PQ").click());
    expect(onPick).toHaveBeenLastCalledWith("xna-pq-strict-test");
    expect(panel(container).hidden).toBe(false);

    await act(async () => {
      panel(container).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(panel(container).hidden).toBe(true);
    // Escape closes the list; it does not undo what was already chosen.
    expect(onPick).toHaveBeenLastCalledWith("xna-pq-strict-test");
  } finally {
    await unmount();
  }
});
