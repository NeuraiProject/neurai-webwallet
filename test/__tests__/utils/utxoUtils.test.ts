import { pickForcedUtxosForAmount } from "@/utils/utxoUtils";

describe("pickForcedUtxosForAmount", () => {
  it("selects UTXOs greedily to reach required sats", () => {
    const utxos = [
      { value: 1.0 },
      { satoshis: 50000000 },
      { value: 0.1 }
    ];
    const result = pickForcedUtxosForAmount(utxos, 120000000);
    expect(result.sumSats).toBeGreaterThanOrEqual(120000000);
    expect(result.picked.length).toBeGreaterThan(0);
  });

  it("filters invalid UTXOs", () => {
    const utxos = [
      { value: 0 },
      { satoshis: -1 },
      { value: "bad" },
      { satoshis: 1000 }
    ];
    const result = pickForcedUtxosForAmount(utxos as any[], 500);
    expect(result.sumSats).toBe(1000);
    expect(result.picked.length).toBe(1);
  });
});
