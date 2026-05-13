import { CostPerTonProvisionalService } from '../services/cost-per-ton-provisional.service';

/**
 * CostPerTonProvisionalService unit tests (D2-100).
 *
 * Canonical test:
 *   100 L gasoil × 800 XOF/L = 80 000 XOF
 *   10 t inflow
 *   cost_per_ton = 80 000 / 10 = 8 000 XOF
 */
describe('CostPerTonProvisionalService', () => {
  let service: CostPerTonProvisionalService;
  let mockDs: { query: jest.Mock };

  const TENANT = 'tenant-1';
  const SITE = 'site-1';
  const DAY = 'day-1';

  beforeEach(() => {
    mockDs = { query: jest.fn() };
    service = new CostPerTonProvisionalService(mockDs as never);
  });

  it('computes 8000 XOF for 100L @ 800/L over 10t inflow', async () => {
    // fuel cost: 100 L × 800 XOF = 80 000 XOF minor units
    mockDs.query
      .mockResolvedValueOnce([{ total_fuel_cost_minor: '80000' }]) // fuel query
      .mockResolvedValueOnce([{ total_inflow_kg: '10000' }])       // inflow query (10 000 kg = 10 t)
      .mockResolvedValueOnce([{ currency: 'XOF' }]);               // currency query

    const result = await service.compute(TENANT, SITE, DAY);

    expect(result.amount_minor).toBe(8000n);
    expect(result.currency).toBe('XOF');
    expect(result.label).toBe('cost_per_ton_provisional');
  });

  it('returns 0 when no inflow tonnage exists (avoids division by zero)', async () => {
    mockDs.query
      .mockResolvedValueOnce([{ total_fuel_cost_minor: '50000' }])
      .mockResolvedValueOnce([{ total_inflow_kg: '0' }])
      .mockResolvedValueOnce([{ currency: 'XOF' }]);

    const result = await service.compute(TENANT, SITE, DAY);

    expect(result.amount_minor).toBe(0n);
  });

  it('returns 0 when both fuel cost and inflow are zero', async () => {
    mockDs.query
      .mockResolvedValueOnce([{ total_fuel_cost_minor: '0' }])
      .mockResolvedValueOnce([{ total_inflow_kg: '0' }])
      .mockResolvedValueOnce([{ currency: 'XOF' }]);

    const result = await service.compute(TENANT, SITE, DAY);

    expect(result.amount_minor).toBe(0n);
  });

  it('defaults to XOF when site has no functional_currency set', async () => {
    mockDs.query
      .mockResolvedValueOnce([{ total_fuel_cost_minor: '0' }])
      .mockResolvedValueOnce([{ total_inflow_kg: '0' }])
      .mockResolvedValueOnce([]); // no site row

    const result = await service.compute(TENANT, SITE, DAY);

    expect(result.currency).toBe('XOF');
  });

  it('always returns label cost_per_ton_provisional', async () => {
    mockDs.query
      .mockResolvedValueOnce([{ total_fuel_cost_minor: '0' }])
      .mockResolvedValueOnce([{ total_inflow_kg: '0' }])
      .mockResolvedValueOnce([{ currency: 'EUR' }]);

    const result = await service.compute(TENANT, SITE, DAY);

    expect(result.label).toBe('cost_per_ton_provisional');
  });

  it('rounds to nearest integer minor unit', async () => {
    // 100 L × 750 XOF = 75 000 XOF / 7 t = 10714.28... → rounds to 10714
    mockDs.query
      .mockResolvedValueOnce([{ total_fuel_cost_minor: '75000' }])
      .mockResolvedValueOnce([{ total_inflow_kg: '7000' }])
      .mockResolvedValueOnce([{ currency: 'XOF' }]);

    const result = await service.compute(TENANT, SITE, DAY);

    expect(result.amount_minor).toBe(10714n);
  });
});
