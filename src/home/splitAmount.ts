/**
 * Splits a formatted amount into its whole and fractional parts.
 *
 * The home page sets the decimals a few points smaller than the whole number,
 * which needs the two halves separately.
 *
 * Which character separates them cannot be worked out from the string: the same
 * "1,284" is one thousand two hundred and eighty-four in English and one-and-a-
 * bit in German. So the separator is asked of `Intl` for the same locale the
 * formatter used, rather than guessed.
 */

/** The decimal separator a locale actually uses. */
export function decimalSeparator(locale?: string): string {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
    return parts.find((part) => part.type === "decimal")?.value ?? ".";
  } catch {
    return ".";
  }
}

export function splitAmount(
  formatted: string,
  separator: string,
): { whole: string; separator: string; fraction: string } {
  const at = separator ? formatted.lastIndexOf(separator) : -1;
  if (at === -1) return { whole: formatted, separator: "", fraction: "" };

  const fraction = formatted.slice(at + separator.length);
  if (!/^\d+$/.test(fraction)) return { whole: formatted, separator: "", fraction: "" };

  return { whole: formatted.slice(0, at), separator, fraction };
}
