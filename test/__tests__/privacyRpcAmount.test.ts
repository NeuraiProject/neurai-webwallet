import { parseRpcJson } from "@neuraiproject/neurai-rpc";
import { rpcAmountToSatoshis } from "@neuraiproject/neurai-privacy/client";

// Same text the node writes for amounts: integer part, dot and exactly 8 decimals.
const nodeText = (sats: bigint) => `${sats / 100000000n}.${(sats % 100000000n).toString().padStart(8, "0")}`;
// Same path as the webwallet: node JSON, neurai-rpc parsing, then postMessage to the pool worker.
const throughWallet = (sats: bigint) =>
  structuredClone((parseRpcJson(`{"value":${nodeText(sats)}}`) as { value: unknown }).value);

test("a large fee coin converts exactly where float arithmetic did not", () => {
  const value = throughWallet(899986985000n);
  expect(value).toBe(8999.86985);
  expect(Number(value) * 1e8).not.toBe(899986985000);
  expect(rpcAmountToSatoshis(value)).toBe(899986985000n);
});

test("amounts the RPC library keeps as exact text convert exactly", () => {
  expect(typeof throughWallet(9500000012345678n)).toBe("string");
  expect(rpcAmountToSatoshis(throughWallet(9500000012345678n))).toBe(9500000012345678n);
  expect(rpcAmountToSatoshis(throughWallet(2100000000000000000n))).toBe(2100000000000000000n);
});

test("small amounts and exponent formatting convert exactly", () => {
  expect(rpcAmountToSatoshis(throughWallet(546n))).toBe(546n);
  expect(rpcAmountToSatoshis(throughWallet(1n))).toBe(1n);
  expect(rpcAmountToSatoshis(0.0000001)).toBe(10n);
  expect(rpcAmountToSatoshis("1e-8")).toBe(1n);
  expect(rpcAmountToSatoshis(5000)).toBe(500000000000n);
  expect(rpcAmountToSatoshis(0)).toBe(0n);
});

test("invalid, negative, over-precise and out-of-range amounts are rejected", () => {
  for (const value of ["0.000000001", "-1", -1, NaN, Infinity, "", "1.2.3", "0x10", null, undefined, {}, [1],
    "21000000000.00000001", "1e-9"]) {
    expect(() => rpcAmountToSatoshis(value)).toThrow();
  }
});

test("random coin values survive node text, neurai-rpc and the worker boundary exactly", () => {
  let seed = 0x2f6b1d3an;
  const next = () => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return seed; };
  for (const limit of [100000000000n, 1000000000000n, 9000000000000000n, 2100000000000000000n]) {
    for (let i = 0; i < 1250; i++) {
      const sats = next() % (limit + 1n);
      expect(rpcAmountToSatoshis(throughWallet(sats))).toBe(sats);
    }
  }
});
