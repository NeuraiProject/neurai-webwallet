import { decimalToSatoshis, satoshisToDecimal, type Amount } from "./exactAmounts";
import { formatNumberWith8Decimals } from "./formatNumberWith8Decimals";

const COIN = 100000000n;
/** Above this many coins, only whole coins are shown. */
const WHOLE_COINS_ABOVE = 100000n * COIN;
const HUNDREDTH = COIN / 100n;

/**
 * An amount for the summary views, the header and the home page: at most two
 * decimals, and whole coins only above 100,000 coins.
 *
 * Extra digits are dropped, never rounded up, so the figure never exceeds what
 * is held. A non-zero amount below 0.01 reads "<0.01" rather than a misleading
 * 0. Screens that act on the exact amount, such as Send, keep
 * formatNumberWith8Decimals.
 */
export function formatSummaryAmount(value: Amount): string {
  const raw = decimalToSatoshis(value);
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const step = magnitude > WHOLE_COINS_ABOVE ? COIN : HUNDREDTH;
  const kept = magnitude - (magnitude % step);
  if (kept === 0n && magnitude !== 0n) {
    return `${negative ? "-" : ""}<${formatNumberWith8Decimals(satoshisToDecimal(HUNDREDTH))}`;
  }
  return formatNumberWith8Decimals(satoshisToDecimal(negative ? -kept : kept));
}
