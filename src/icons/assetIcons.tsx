import React from "react";

/**
 * Icons for the asset list and the activity feed.
 *
 * Same geometry as the navigator's icons in `./index.tsx`: a 24px grid, no
 * fill, 2px strokes, round caps and joins. A DePIN row and the DePIN section of
 * the navigation should be drawn the same way, or the list reads as a different
 * product from the shell around it.
 *
 * Colour is inherited (`currentColor`) rather than baked in: the kind is
 * carried by the shape and by the chip beside it, and five accent colours in
 * five rows would be noise.
 */

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** DePIN token: physical infrastructure, so a device outline. */
export function IconDepinAsset(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}

/** Qualifier (`#NAME`): tags addresses, so the literal hash. */
export function IconQualifierAsset(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

/** Sub-asset (`PARENT/CHILD`): stacked layers say "child of" without words. */
export function IconSubAsset(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

/** Plain asset: the same tag the navigator uses for the Asset section. */
export function IconPlainAsset(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

/**
 * Direction of a transaction. Slightly lighter than the 2px of the navigation:
 * these sit on a tinted tile, where a heavier stroke turns into a blob.
 */
export function IconIncoming(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2.25} {...props}>
      <line x1="12" y1="4" x2="12" y2="20" />
      <polyline points="19 13 12 20 5 13" />
    </svg>
  );
}

export function IconOutgoing(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} strokeWidth={2.25} {...props}>
      <line x1="12" y1="20" x2="12" y2="4" />
      <polyline points="5 11 12 4 19 11" />
    </svg>
  );
}
