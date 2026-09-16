import {decimalToSatoshis, displayRaw, type Amount} from "../exactAmounts";

/** listassetbalancesbyaddress returns decimal token quantities, including large ones. */
export function normalizeAssetAmount(raw: unknown): Amount {
  if (typeof raw !== "number" && typeof raw !== "string") return 0;
  try { return displayRaw(decimalToSatoshis(raw)); } catch { return 0; }
}

/**
 * Shortens a Neurai address for display purposes
 *
 * @param address - The full Neurai address (optional)
 * @returns Shortened address in format "Nxxx...xxxx" or original if too short
 *
 * @example
 * shortenAddress("NSEax8pKQb78C1ZeMt4Nia9DgFfKDntmmf") // Returns "NSEa...tmmf"
 * shortenAddress("") // Returns ""
 * shortenAddress("N123") // Returns "N123" (too short to shorten)
 */
export function shortenAddress(address?: string): string {
  const a = (address ?? '').trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}

/**
 * Formats a Unix timestamp to a localized date-time string without seconds
 *
 * @param unixTimestamp - Unix timestamp in seconds
 * @returns Formatted date string in format "MM/DD/YYYY, HH:mm"
 *
 * @example
 * formatUnixTimestampNoSeconds(1704067200) // Returns "01/01/2024, 00:00"
 */
export function formatUnixTimestampNoSeconds(unixTimestamp: number): string {
  const d = new Date(unixTimestamp * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Formats a Unix timestamp to a compact date-time string with 2-digit year
 *
 * @param unixTimestamp - Unix timestamp in seconds
 * @returns Formatted date string in format "MM/DD/YY, HH:mm"
 *
 * @example
 * formatUnixTimestampNoSecondsShortYear(1704067200) // Returns "01/01/24, 00:00"
 */
export function formatUnixTimestampNoSecondsShortYear(unixTimestamp: number): string {
  const d = new Date(unixTimestamp * 1000);
  return d.toLocaleString(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
