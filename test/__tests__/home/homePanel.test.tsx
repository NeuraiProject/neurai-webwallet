/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { HomePanel } from "@/home/Home";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Leaving the home page used to unmount it, so coming back fetched the history
// and every asset's metadata again and the page visibly reloaded. It now stays
// mounted and hidden, and keeps refreshing in the background with new blocks.

const address = "tDjYjjNMUiEfSKxSWB5RhgNqFWHCzdGtf3";
const deltas = [
  { assetName: "XNA", satoshis: 1234567890, txid: "a".repeat(64), index: 0, blockindex: 0, height: 2900, address },
];

function setup() {
  const getHistory = jest.fn(async () => deltas);
  const rpc = jest.fn(async () => null);
  const wallet = {
    network: "xna-test",
    baseCurrency: "XNA",
    rpc,
    getHistory,
    getAddressObjects: () => [{ address, path: "m/44'/1'/0'/0/0" }],
    getAddresses: () => [address],
  } as any;
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (active: boolean, blockCount = 1) =>
    act(async () =>
      root.render(
        <HomePanel active={active} wallet={wallet} assets={[{ assetName: "ALPHA", balance: "100000000" }]}
          mempool={[]} balance="12.34" blockCount={blockCount} setRoute={() => undefined} receiveAddress={address} />,
      ),
    );
  return { getHistory, rpc, container, root, render };
}

test("returning to the home page shows what it had, without asking the node again", async () => {
  const { getHistory, rpc, container, root, render } = setup();
  try {
    await render(true);
    expect(container.textContent).toContain("Received");
    const historyCalls = getHistory.mock.calls.length;
    const rpcCalls = rpc.mock.calls.length;

    await render(false);
    expect((container.firstChild as HTMLElement).hidden).toBe(true);

    await render(true);
    expect((container.firstChild as HTMLElement).hidden).toBe(false);
    expect(container.textContent).toContain("Received");
    expect(getHistory.mock.calls.length).toBe(historyCalls);
    expect(rpc.mock.calls.length).toBe(rpcCalls);
  } finally {
    await act(async () => root.unmount());
  }
});

test("a new block still refreshes it in the background while hidden", async () => {
  const { getHistory, root, render } = setup();
  try {
    await render(false, 1);
    const historyCalls = getHistory.mock.calls.length;

    await render(false, 2);

    expect(getHistory.mock.calls.length).toBe(historyCalls + 1);
  } finally {
    await act(async () => root.unmount());
  }
});
