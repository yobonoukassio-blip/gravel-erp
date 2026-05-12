/**
 * REQ: FND-07 — Money stocké en bigint minor units + 3 montants (origine/site/groupe).
 * Source: D-15, D-16, D-17, D-18, PITFALLS.md #3.
 * Implementing plan: W1-P02 (money helpers — dinero.js v2 wrappers + columns convention).
 *
 * Wave 0 RED.
 */
import { CURRENCY_SCALE, getCurrencyScale } from '@gravel/shared-types';

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
    throw new Error('NOT IMPLEMENTED — plan W1-P02 (money helpers)');
  });

  it('EUR stored as bigint with scale 2; 12.34 EUR = 1234n minor units', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });

  it('rejects float currency math (no JS number arithmetic on money)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });

  it('three amounts per transaction: original + site_functional + group with fx_rate_id', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });

  it('banker rounding half-up at minor unit (no cumulative rounding drift)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });
});
