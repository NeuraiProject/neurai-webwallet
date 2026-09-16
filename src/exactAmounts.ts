import {
  decimalToSatoshis,
  satoshisToDecimal,
  toRawInteger,
} from "@neuraiproject/neurai-create-transaction";

export type Amount = number | string;
export type RawAmount = number | string | bigint;

/** Preserve the numeric API only when a decimal round-trip retains every unit. */
export function displayRaw(raw: bigint): Amount {
  const text = satoshisToDecimal(raw);
  const absolute = raw < 0n ? -raw : raw;
  const numeric = Number(text);
  return (absolute <= 9007199254740991n || absolute % 100000000n === 0n) &&
    decimalToSatoshis(String(numeric)) === raw
    ? numeric
    : text;
}

export function addAmounts(a: Amount, b: Amount): Amount {
  return displayRaw(decimalToSatoshis(a) + decimalToSatoshis(b));
}

export function absAmount(value: Amount): Amount {
  const raw = decimalToSatoshis(value);
  return displayRaw(raw < 0n ? -raw : raw);
}

export function compareAmounts(a: Amount, b: Amount): number {
  const left = decimalToSatoshis(a);
  const right = decimalToSatoshis(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Form input is decimal text throughout; never parseFloat before signing. */
export function amountFromInput(input: string, allowZero = false): string {
  const text = input.trim();
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) throw new Error("Enter a decimal amount with at most 8 decimal places");
  const raw = decimalToSatoshis(text);
  if (raw < 0n || (!allowZero && raw === 0n) || raw > 2100000000000000000n) {
    throw new Error("Amount is outside the supported range");
  }
  return satoshisToDecimal(raw);
}

export { decimalToSatoshis, satoshisToDecimal, toRawInteger };
