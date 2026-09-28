/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { Balance } from "@/Balance";
import { Home } from "@/home/Home";
import { formatSummaryAmount } from "@/formatSummaryAmount";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The header and the home page summarise: at most two decimals, whole coins
// only above 100,000. Send keeps every decimal (formatNumberWith8Decimals).
describe("formatSummaryAmount", () => {
  it("keeps at most two decimals, dropping the rest instead of rounding up", () => {
    expect(formatSummaryAmount("1234.56789")).toBe("1,234.56");
    expect(formatSummaryAmount("0.999")).toBe("0.99");
    expect(formatSummaryAmount("99999.999")).toBe("99,999.99");
    expect(formatSummaryAmount(1234.5)).toBe("1,234.5");
    expect(formatSummaryAmount("12")).toBe("12");
    expect(formatSummaryAmount("0.01")).toBe("0.01");
  });

  it("shows whole coins only above 100,000 coins", () => {
    expect(formatSummaryAmount("100000")).toBe("100,000");
    expect(formatSummaryAmount("100000.99")).toBe("100,000");
    expect(formatSummaryAmount("123456789.12345678")).toBe("123,456,789");
    expect(formatSummaryAmount("20999999999.99999999")).toBe("20,999,999,999");
  });

  it("never shows a non-zero amount as zero", () => {
    expect(formatSummaryAmount("0.00000001")).toBe("<0.01");
    expect(formatSummaryAmount("0.009")).toBe("<0.01");
    expect(formatSummaryAmount("0")).toBe("0");
  });

  it("keeps the sign", () => {
    expect(formatSummaryAmount("-1234.567")).toBe("-1,234.56");
    expect(formatSummaryAmount("-0.005")).toBe("-<0.01");
  });
});

describe("summary views", () => {
  it("the header shows the balance with at most two decimals", () => {
    const wallet = { network: "xna-test", baseCurrency: "XNA" } as any;

    const html = renderToStaticMarkup(<Balance balance="1234.56789" mempool={[]} wallet={wallet} />);

    expect(html).toContain("1,234.56 XNA");
    expect(html).not.toContain("1,234.56789");
  });

  it("the home page shows balances and holdings above 100,000 without decimals", async () => {
    const wallet = {
      network: "xna-test",
      baseCurrency: "XNA",
      rpc: jest.fn(async () => null),
      getHistory: jest.fn(async () => []),
      getAddressObjects: () => [],
    } as any;
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <Home
            wallet={wallet}
            // Asset balances arrive in base units, as the node reports them.
            assets={[{ assetName: "BIGSUPPLY", balance: "15000050000000" }, { assetName: "SMALL", balance: "1234560000" }]}
            mempool={[]}
            balance="123456.789"
            blockCount={1}
            setRoute={() => undefined}
            receiveAddress=""
          />,
        ),
      );
      const text = container.textContent ?? "";
      expect(text).toContain("123,456");
      expect(text).not.toContain("123,456.7");
      expect(text).toContain("150,000");
      expect(text).not.toContain("150,000.5");
      expect(text).toContain("12.34");
      expect(text).not.toContain("12.3456");
    } finally {
      await act(async () => root.unmount());
    }
  });
});
