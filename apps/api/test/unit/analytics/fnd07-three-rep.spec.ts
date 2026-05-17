import { buildThreeRepAmounts } from '../../../src/modules/analytics/services/three-rep-writer';
import { FxRateService } from '../../../src/modules/analytics/services/fx-rate.service';

/**
 * FND-07 — three-representation money writer.
 *
 * Verifies that `buildThreeRepAmounts` produces consistent
 * (original / site_functional / group) triples in every scenario and that the
 * legacy `amount_minor_units` mirrors site_functional for backward compat.
 */
describe('FND-07 — buildThreeRepAmounts', () => {
  function makeFx(rates: Record<string, { id: string; rate: number }>): FxRateService {
    return {
      convert: jest.fn(async (args: {
        fromCurrency: string;
        toCurrency: string;
        amountMinor: bigint;
      }) => {
        const key = `${args.fromCurrency}|${args.toCurrency}`;
        const r = rates[key];
        if (args.fromCurrency === args.toCurrency || !r) {
          return { convertedMinor: args.amountMinor, fxRateId: null };
        }
        const scaled = BigInt(Math.round(r.rate * 1e8));
        return {
          convertedMinor: (args.amountMinor * scaled) / 100_000_000n,
          fxRateId: r.id,
        };
      }),
    } as unknown as FxRateService;
  }

  it('returns identity when source = site = group (single-currency tenant)', async () => {
    const out = await buildThreeRepAmounts({
      fx: makeFx({}),
      tenantId: 't1',
      entryDate: '2026-05-17',
      amountMinor: 1_000_000n,
      sourceCurrency: 'XOF',
      siteCurrency: 'XOF',
      groupCurrency: 'XOF',
    });
    expect(out.amount_original_minor).toBe('1000000');
    expect(out.amount_site_functional_minor).toBe('1000000');
    expect(out.amount_group_minor).toBe('1000000');
    expect(out.amount_minor_units).toBe('1000000'); // legacy mirror
    expect(out.currency).toBe('XOF');
    expect(out.fx_rate_id).toBeNull();
  });

  it('converts source → site_functional → group with two FX hops (EUR site, XOF group)', async () => {
    // 1 EUR = 656 XOF (CFA franc fixed peg)
    const out = await buildThreeRepAmounts({
      fx: makeFx({
        'EUR|XOF': { id: 'fx-eur-xof', rate: 656 },
      }),
      tenantId: 't1',
      entryDate: '2026-05-17',
      amountMinor: 100_00n, // 100.00 EUR in minor units (EUR has 2 decimals)
      sourceCurrency: 'EUR',
      siteCurrency: 'EUR',
      groupCurrency: 'XOF',
    });
    expect(out.amount_original_minor).toBe('10000');
    expect(out.amount_site_functional_minor).toBe('10000'); // identity (source = site)
    // 10000 (cents) × 656 = 6 560 000 (XOF has 0 decimals)
    expect(out.amount_group_minor).toBe('6560000');
    expect(out.site_currency).toBe('EUR');
    expect(out.group_currency).toBe('XOF');
    expect(out.fx_rate_id).toBe('fx-eur-xof');
  });

  it('full chain USD source → EUR site → XOF group', async () => {
    const out = await buildThreeRepAmounts({
      fx: makeFx({
        'USD|EUR': { id: 'fx-usd-eur', rate: 0.92 },
        'EUR|XOF': { id: 'fx-eur-xof', rate: 656 },
      }),
      tenantId: 't1',
      entryDate: '2026-05-17',
      amountMinor: 1_000_00n, // 1000.00 USD
      sourceCurrency: 'USD',
      siteCurrency: 'EUR',
      groupCurrency: 'XOF',
    });
    expect(out.amount_original_minor).toBe('100000');
    // 100000 × 0.92 = 92 000 (EUR cents)
    expect(out.amount_site_functional_minor).toBe('92000');
    // 92000 × 656 = 60 352 000 (XOF)
    expect(out.amount_group_minor).toBe('60352000');
    // group hop preferred over functional hop when both exist
    expect(out.fx_rate_id).toBe('fx-eur-xof');
  });

  it('preserves legacy fields (amount_minor_units + currency = site-functional)', async () => {
    const out = await buildThreeRepAmounts({
      fx: makeFx({
        'EUR|XOF': { id: 'fx-1', rate: 656 },
      }),
      tenantId: 't1',
      entryDate: '2026-05-17',
      amountMinor: 50_00n,
      sourceCurrency: 'EUR',
      siteCurrency: 'EUR',
      groupCurrency: 'XOF',
    });
    expect(out.amount_minor_units).toBe(out.amount_site_functional_minor);
    expect(out.currency).toBe('EUR');
  });

  it('defaults group_currency to XOF when not supplied', async () => {
    const out = await buildThreeRepAmounts({
      fx: makeFx({}),
      tenantId: 't1',
      entryDate: '2026-05-17',
      amountMinor: 100n,
      sourceCurrency: 'XOF',
      siteCurrency: 'XOF',
    });
    expect(out.group_currency).toBe('XOF');
  });

  it('falls back to identity with fx_rate_id=null when no rate found', async () => {
    const out = await buildThreeRepAmounts({
      fx: makeFx({}), // no rates configured
      tenantId: 't1',
      entryDate: '2026-05-17',
      amountMinor: 1_000_00n,
      sourceCurrency: 'EUR',
      siteCurrency: 'XOF', // EUR→XOF missing
      groupCurrency: 'XOF',
    });
    expect(out.amount_original_minor).toBe('100000');
    expect(out.amount_site_functional_minor).toBe('100000'); // identity fallback
    expect(out.amount_group_minor).toBe('100000');
    expect(out.fx_rate_id).toBeNull();
  });
});
