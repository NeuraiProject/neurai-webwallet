import React from "react";

export interface BalancePoint {
  blockHeight: number;
  balance: number;
}

/**
 * The wallet's own balance over time.
 *
 * Deliberately not a price chart: the balance is derived from the transaction
 * history the wallet already downloads, so it needs no market data. That also
 * makes it the only chart that still says something on testnet, where a price
 * would be meaningless.
 *
 * Hand-drawn SVG rather than a charting library. The bundle already warns at
 * ~1.8 MB, and a filled line with two gridlines is a few dozen lines of path
 * arithmetic — not worth 100 kB of dependency.
 */
export function BalanceChart({ points }: { points: BalancePoint[] }) {
  // Two points are the minimum that can describe a line.
  if (points.length < 2) return null;

  const width = 380;
  const height = 92;
  const values = points.map((p) => p.balance);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat balance would divide by zero; give it a band so the line sits mid-height.
  const span = max - min || Math.max(max, 1);
  const top = 6;
  const usable = height - top - 6;

  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => top + (1 - (v - min) / span) * usable;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Balance over the wallet's transaction history"
      className="w-full h-[92px] block overflow-visible"
    >
      <defs>
        <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={height / 3} x2={width} y2={height / 3} stroke="var(--color-base-300)" strokeWidth="1" />
      <line x1="0" y1={(height / 3) * 2} x2={width} y2={(height / 3) * 2} stroke="var(--color-base-300)" strokeWidth="1" />
      <path d={area} fill="url(#balance-fill)" />
      <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last.balance)} r="3.5" fill="var(--color-primary)" />
    </svg>
  );
}
