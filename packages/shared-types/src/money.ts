/**
 * Money types — Source: D-16, D-17 (Phase 1 CONTEXT.md).
 *
 * NEVER use float/number for monetary amounts. Always store as integer minor
 * units (`bigint`) with an ISO-4217 currency code. Scale is currency-derived
 * (XOF/XAF=0, EUR/USD=2). Conversions use immutable FX rates referenced by id.
 */

/**
 * A money amount expressed as integer minor units in a specific currency.
 *  - For XOF / XAF (no decimals): `amountMinor` = whole units (1000 XOF → 1000n)
 *  - For EUR / USD (2 decimals):  `amountMinor` = cents (12.34 EUR → 1234n)
 */
export interface MoneyAmount {
  amountMinor: bigint;
  /** ISO 4217 CHAR(3) currency code. */
  currency: string;
}

/**
 * Every business transaction stores three representations:
 *  - original          : currency entered by the operator (e.g. EUR for an export sale)
 *  - siteFunctional    : converted to the site's functional currency (e.g. XOF for an Ivorian site)
 *  - group             : converted to the group reporting currency (e.g. XOF pivot)
 *
 * `fxRateId` references the immutable FX rate snapshot used at booking time.
 * The rate row is never updated; corrections create a new rate row.
 */
export interface TransactionAmounts {
  original: MoneyAmount;
  siteFunctional: MoneyAmount;
  group: MoneyAmount;
  fxRateId: string;
}

/**
 * Number of fractional digits per ISO-4217 currency code.
 * Extend as new currencies are introduced.
 */
export const CURRENCY_SCALE: Record<string, number> = {
  XOF: 0,
  XAF: 0,
  EUR: 2,
  USD: 2,
};

export function getCurrencyScale(currency: string): number {
  const scale = CURRENCY_SCALE[currency];
  if (scale === undefined) {
    throw new Error(
      `Unknown currency '${currency}'. Add it to CURRENCY_SCALE in @gravel/shared-types/money.ts.`,
    );
  }
  return scale;
}
