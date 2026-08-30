import { deriveWalletHistory } from "@/home/useWalletHistory";

// Two pieces of real logic sit between the raw deltas and the home page: which
// asset a transaction is "about", and the running balance the chart plots.
// Both are easy to get subtly wrong and neither would fail loudly.

const delta = (over: Record<string, unknown>) => ({
  txid: "tx1",
  assetName: "XNA",
  satoshis: 0,
  height: 100,
  address: "tME",
  ...over,
});

describe("balance series", () => {
  it("accumulates the network currency, oldest first", () => {
    const { balanceSeries } = deriveWalletHistory(
      [
        delta({ txid: "a", satoshis: 500000000, height: 10 }),
        delta({ txid: "b", satoshis: 300000000, height: 20 }),
        delta({ txid: "c", satoshis: -200000000, height: 30 }),
      ],
      "XNA",
    );

    expect(balanceSeries.map((p) => p.balance)).toEqual([5, 8, 6]);
    expect(balanceSeries.map((p) => p.blockHeight)).toEqual([10, 20, 30]);
  });

  it("orders by block height, not by the order the node returned", () => {
    // Deltas do not arrive sorted; plotting them as received draws a zigzag
    // that is not the wallet's history.
    const { balanceSeries } = deriveWalletHistory(
      [
        delta({ txid: "late", satoshis: 100000000, height: 90 }),
        delta({ txid: "early", satoshis: 400000000, height: 10 }),
      ],
      "XNA",
    );

    expect(balanceSeries.map((p) => p.blockHeight)).toEqual([10, 90]);
    expect(balanceSeries.map((p) => p.balance)).toEqual([4, 5]);
  });

  it("ignores other assets: the chart is the currency balance", () => {
    const { balanceSeries } = deriveWalletHistory(
      [
        delta({ txid: "a", satoshis: 100000000, height: 10 }),
        delta({ txid: "b", assetName: "&DEPINTESTING", satoshis: 100000000, height: 20 }),
      ],
      "XNA",
    );

    expect(balanceSeries).toHaveLength(1);
  });

  it("skips transactions that net to zero for the currency", () => {
    // A delta pair that cancels would otherwise add a flat point that means
    // nothing to anyone reading the chart.
    const { balanceSeries } = deriveWalletHistory(
      [
        delta({ txid: "a", satoshis: 100000000, height: 10 }),
        delta({ txid: "b", satoshis: 50000000, height: 20 }),
        delta({ txid: "b", satoshis: -50000000, height: 20 }),
      ],
      "XNA",
    );

    expect(balanceSeries.map((p) => p.balance)).toEqual([1]);
  });
});

describe("activity", () => {
  it("is newest first", () => {
    const { activity } = deriveWalletHistory(
      [
        delta({ txid: "old", satoshis: 100000000, height: 10 }),
        delta({ txid: "new", satoshis: 200000000, height: 99 }),
      ],
      "XNA",
    );

    expect(activity.map((a) => a.transactionId)).toEqual(["new", "old"]);
  });

  it("names the token of an issuance, not the currency it spent", () => {
    // The library folds the negative currency delta of an asset operation into
    // its fee, so only the token is left to name — which is the right answer.
    const { activity } = deriveWalletHistory(
      [
        delta({ txid: "issue", satoshis: -50000000, height: 30 }),
        delta({ txid: "issue", assetName: "&NEWTOKEN", satoshis: 100000000000, height: 30 }),
      ],
      "XNA",
    );

    expect(activity[0].assetName).toBe("&NEWTOKEN");
    expect(activity[0].extraAssets).toBe(0);
  });

  it("takes the direction from the library, not from the sign", () => {
    // An issuance shows a POSITIVE token movement and is still an outgoing
    // transaction. Reading the arrow off the sign would draw it as received.
    const { activity } = deriveWalletHistory(
      [
        delta({ txid: "issue", satoshis: -50000000, height: 30 }),
        delta({ txid: "issue", assetName: "&NEWTOKEN", satoshis: 100000000000, height: 30 }),
      ],
      "XNA",
    );

    expect(activity[0].value).toBeGreaterThan(0);
    expect(activity[0].outgoing).toBe(true);
  });

  it("marks a plain spend as outgoing", () => {
    const { activity } = deriveWalletHistory([delta({ txid: "out", satoshis: -700000000, height: 5 })], "XNA");
    expect(activity[0].outgoing).toBe(true);
  });

  it("marks a plain receipt as incoming", () => {
    const { activity } = deriveWalletHistory([delta({ txid: "in", satoshis: 700000000, height: 5 })], "XNA");
    expect(activity[0].outgoing).toBe(false);
  });

  it("survives an empty history", () => {
    expect(deriveWalletHistory([], "XNA")).toEqual({ activity: [], balanceSeries: [] });
  });
});
