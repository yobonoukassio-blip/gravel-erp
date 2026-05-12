/**
 * Money helpers — D-15, D-16, D-17, D-18. PITFALLS.md #3.
 *
 * Hard rules:
 *   - Storage is `bigint` minor units + ISO-4217 CHAR(3) currency.
 *   - NEVER use JS `number` arithmetic on money. `number` is acceptable only
 *     as a one-time external input that we immediately convert to bigint via
 *     string serialization (avoiding float drift).
 *   - FX conversion references an immutable `fx_rate_id`. Rounding is applied
 *     ONCE at the final minor-unit step (no cumulative rounding).
 */
import { getCurrencyScale, MoneyAmount, TransactionAmounts } from '@gravel/shared-types';

export { CURRENCY_SCALE, getCurrencyScale } from '@gravel/shared-types';
export type { MoneyAmount, TransactionAmounts } from '@gravel/shared-types';

export interface FxRateSnapshot {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rateNumerator: bigint;
  rateDenominator: bigint;
}

/**
 * Convert a major-unit decimal input (e.g. 12.34) to bigint minor units.
 * Uses string formatting to avoid float drift (0.1 + 0.2 → "0.30" not "0.3000000000000004").
 */
export function toMinor(majorAmount: number, currency: string): bigint {
  const scale = getCurrencyScale(currency);
  if (!Number.isFinite(majorAmount)) {
    throw new Error(`toMinor: non-finite amount ${majorAmount}`);
  }
  // toFixed performs IEEE-754 half-to-even at the requested decimal scale.
  // For XOF (scale=0) it rounds to an integer; for EUR (scale=2) it truncates
  // to 2 decimals. This is the only place `number` touches money.
  const rounded = majorAmount.toFixed(scale);
  // Strip the decimal point and sign-aware.
  const negative = rounded.startsWith('-');
  const stripped = (negative ? rounded.slice(1) : rounded).replace('.', '');
  return BigInt(negative ? '-' + stripped : stripped);
}

export function fromMinor(amountMinor: bigint, currency: string): string {
  const scale = getCurrencyScale(currency);
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const s = abs.toString().padStart(scale + 1, '0');
  const whole = s.slice(0, s.length - scale);
  const frac = scale === 0 ? '' : '.' + s.slice(s.length - scale);
  return (negative ? '-' : '') + whole + frac;
}

export function money(amountMinor: bigint, currency: string): MoneyAmount {
  // Validate currency known at construction.
  getCurrencyScale(currency);
  return { amountMinor, currency };
}

export function add(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  if (a.currency !== b.currency) {
    throw new Error(`Money currency mismatch: ${a.currency} + ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  if (a.currency !== b.currency) {
    throw new Error(`Money currency mismatch: ${a.currency} - ${b.currency}`);
  }
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

/**
 * Half-to-even (banker's) rounded integer division of (n * num) by (denom).
 * Used by `convert` for FX. Avoids cumulative rounding.
 */
function divHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Division by non-positive');
  const negative = numerator < 0n;
  const absN = negative ? -numerator : numerator;
  const quotient = absN / denominator;
  const remainder = absN % denominator;
  const twice = remainder * 2n;
  let result: bigint;
  if (twice < denominator) {
    result = quotient;
  } else if (twice > denominator) {
    result = quotient + 1n;
  } else {
    // Exactly half — round to even.
    result = quotient % 2n === 0n ? quotient : quotient + 1n;
  }
  return negative ? -result : result;
}

export function convert(amount: MoneyAmount, fx: FxRateSnapshot): MoneyAmount {
  if (amount.currency !== fx.fromCurrency) {
    throw new Error(`FX currency mismatch: amount=${amount.currency} fx.from=${fx.fromCurrency}`);
  }
  const sourceScale = BigInt(getCurrencyScale(fx.fromCurrency));
  const targetScale = BigInt(getCurrencyScale(fx.toCurrency));
  // result_minor = amount_minor * (rate_num / rate_denom) * 10^(targetScale - sourceScale)
  // Compose into one division at the very end (half-even).
  const scaleDelta = targetScale - sourceScale;
  let numerator = amount.amountMinor * fx.rateNumerator;
  let denominator = fx.rateDenominator;
  if (scaleDelta >= 0n) {
    numerator *= 10n ** scaleDelta;
  } else {
    denominator *= 10n ** -scaleDelta;
  }
  return {
    amountMinor: divHalfEven(numerator, denominator),
    currency: fx.toCurrency,
  };
}

/**
 * Build the canonical three-amount record (D-17):
 *  original           : amount as entered.
 *  siteFunctional     : converted to the site's functional currency.
 *  group              : converted to the group pivot currency.
 *
 * All three share the same `fxRateId`. If the source and target currencies are
 * identical, we still record fxRateId for traceability.
 */
export function toTransactionAmounts(
  original: MoneyAmount,
  siteFunctionalCurrency: string,
  groupCurrency: string,
  fxToSite: FxRateSnapshot,
  fxToGroup: FxRateSnapshot,
): TransactionAmounts {
  const siteAmt =
    original.currency === siteFunctionalCurrency ? original : convert(original, fxToSite);
  const groupAmt =
    original.currency === groupCurrency ? original : convert(original, fxToGroup);
  return {
    original,
    siteFunctional: siteAmt,
    group: groupAmt,
    fxRateId: fxToSite.id, // canonical reference; group rate is on the same booking.
  };
}
