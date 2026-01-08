/**
 * Formatting utilities for the Neurai WebWallet
 * Pure formatting functions with no side effects
 */

/**
 * Normalizes asset amounts from various formats
 *
 * Many RPC methods return asset amounts in satoshis (1e8). This function
 * applies a heuristic to convert satoshi amounts to decimal amounts when appropriate.
 *
 * @param raw - The raw amount value (string or number)
 * @returns The normalized amount as a decimal number
 *
 * @example
 * normalizeAssetAmountMaybe(1000000) // Returns 0.01 (assumes satoshis)
 * normalizeAssetAmountMaybe(5.5) // Returns 5.5 (assumes decimal)
 * normalizeAssetAmountMaybe("invalid") // Returns 0
 */
export function normalizeAssetAmountMaybe(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : (raw as number);
  if (!Number.isFinite(n)) return 0;

  // Heuristic: many RPCs return asset amounts in satoshis (1e8). If it looks like an integer
  // larger than typical human-scale amounts, treat it as satoshis.
  if (Number.isInteger(n) && Math.abs(n) > 100_000) {
    return n / 1e8;
  }

  return n;
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
