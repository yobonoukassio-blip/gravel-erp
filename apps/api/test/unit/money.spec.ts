/**
 * REQ: FND-07 — Money en bigint minor units + 3 amounts + banker's rounding.
 * Source: D-15, D-16, D-17, D-18, PITFALLS.md #3.
 */
import { CURRENCY_SCALE, getCurrencyScale } from '@gravel/shared-types';
import {
  add,
  convert,
  fromMinor,
  money,
  subtract,
  toMinor,
  toTransactionAmounts,
} from '../../src/common/money/dinero.helpers';

describe('FND-07: Money model — bigint minor units + 3 amounts', () => {
  it('CURRENCY_SCALE exposes XOF=0 and EUR=2', () => {
    expect(CURRENCY_SCALE.XOF).toBe(0);
    expect(CURRENCY_SCALE.EUR).toBe(2);
    expect(CURRENCY_SCALE.USD).toBe(2);
    expect(CURRENCY_SCALE.XAF).toBe(0);
  });

  it('getCurrencyScale throws for unknown currency', () => {
    expect(() => getCurrencyScale('BTC')).toThrow(/Unknown currency/);
  });

  it('XOF stored as bigint with scale 0; 1000 XOF = 1000n minor units', () => {
    expect(toMinor(1000, 'XOF')).toBe(1000n);
    expect(fromMinor(1000n, 'XOF')).toBe('1000');
  });

  it('EUR stored as bigint with scale 2; 12.34 EUR = 1234n minor units', () => {
    expect(toMinor(12.34, 'EUR')).toBe(1234n);
    expect(fromMinor(1234n, 'EUR')).toBe('12.34');
  });

  it('rejects float currency math (no JS number arithmetic on money) — 0.1+0.2 maps to 30n EUR not garbage', () => {
    // toFixed(2) rounds 0.30000000000000004 → "0.30" → 30n.
    expect(toMinor(0.1 + 0.2, 'EUR')).toBe(30n);
  });

  it('add: same currency adds minor units', () => {
    const r = add(money(1000n, 'XOF'), money(500n, 'XOF'));
    expect(r.amountMinor).toBe(1500n);
    expect(r.currency).toBe('XOF');
  });

  it('add: currency mismatch throws', () => {
    expect(() => add(money(100n, 'EUR'), money(100n, 'XOF'))).toThrow(/[Cc]urrency/);
  });

  it('subtract: same currency', () => {
    const r = subtract(money(1000n, 'XOF'), money(250n, 'XOF'));
    expect(r.amountMinor).toBe(750n);
  });

  it('convert: EUR → XOF with rate 656/1 produces XOF integer (scale 0)', () => {
    // 12.34 EUR @ 656 XOF / 1 EUR = 12.34 * 656 = 8095.04 → banker rounds to 8095 XOF.
    const r = convert(money(1234n, 'EUR'), {
      id: 'fx-1',
      fromCurrency: 'EUR',
      toCurrency: 'XOF',
      rateNumerator: 656n,
      rateDenominator: 1n,
    });
    expect(r.currency).toBe('XOF');
    expect(r.amountMinor).toBe(8095n);
  });

  it('convert: bankers rounding rounds .5 to nearest even', () => {
    // amount=5 minor in XOF → multiply by 1/2 → 2.5 → bankers: round to 2 (even).
    const r = convert(money(5n, 'XOF'), {
      id: 'fx-half',
      fromCurrency: 'XOF',
      toCurrency: 'XOF',
      rateNumerator: 1n,
      rateDenominator: 2n,
    });
    expect(r.amountMinor).toBe(2n);

    // amount=7 minor → 3.5 → bankers: round to 4 (even).
    const r2 = convert(money(7n, 'XOF'), {
      id: 'fx-half2',
      fromCurrency: 'XOF',
      toCurrency: 'XOF',
      rateNumerator: 1n,
      rateDenominator: 2n,
    });
    expect(r2.amountMinor).toBe(4n);
  });

  it('convert: rejects currency mismatch', () => {
    expect(() =>
      convert(money(100n, 'EUR'), {
        id: 'fx-bad',
        fromCurrency: 'USD',
        toCurrency: 'XOF',
        rateNumerator: 1n,
        rateDenominator: 1n,
      }),
    ).toThrow(/FX currency mismatch/);
  });

  it('three amounts per transaction: original + site_functional + group with shared fx_rate_id', () => {
    const original = money(1234n, 'EUR'); // 12.34 EUR booked
    const toXof = {
      id: 'fx-eur-xof',
      fromCurrency: 'EUR',
      toCurrency: 'XOF',
      rateNumerator: 656n,
      rateDenominator: 1n,
    };
    const tx = toTransactionAmounts(original, 'XOF', 'XOF', toXof, toXof);
    expect(tx.original.amountMinor).toBe(1234n);
    expect(tx.original.currency).toBe('EUR');
    expect(tx.siteFunctional.currency).toBe('XOF');
    expect(tx.group.currency).toBe('XOF');
    expect(tx.fxRateId).toBe('fx-eur-xof');
  });

  it('no cumulative rounding — round once at the final minor step', () => {
    // Direct conversion 1 EUR @ rate 1/3 yields 33 cents (1 EUR = 100 minor; 100/3 = 33.33 → 33).
    const r = convert(money(100n, 'EUR'), {
      id: 'fx-third',
      fromCurrency: 'EUR',
      toCurrency: 'EUR',
      rateNumerator: 1n,
      rateDenominator: 3n,
    });
    expect(r.amountMinor).toBe(33n);
  });
});
