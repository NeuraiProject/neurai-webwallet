export function formatNumberWith8Decimals(num: number | string) {
  const locale = typeof navigator !== "undefined" ? navigator.language : "sv-SE"; //Default to swedish locale if no runtime info
  if (typeof num === 'string') {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(num);
    if (match) {
      const whole = BigInt(match[2]).toLocaleString(locale);
      const separator = new Intl.NumberFormat(locale).formatToParts(1.1).find(p => p.type === "decimal")?.value ?? '.';
      return match[1] + whole + (match[3] ? separator + match[3] : "");
    }
  }
  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: 0, // Do not force decimal places if not needed
    maximumFractionDigits: 8, // Allow up to 8 decimal places if needed
  });


  return formatted;
}
