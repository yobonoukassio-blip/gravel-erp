/**
 * StockpileValuationService unit tests — STK-03 (cost_model_version=1).
 */
import { StockpileValuationService } from '../../../src/modules/stockpile/services/stockpile-valuation.service';

describe('StockpileValuationService.computeWeightedAverage (STK-03)', () => {
  const svc = new StockpileValuationService();

  it('canonical 2-inflow scenario: 1000 kg @100/t + 1000 kg @200/t → 150/t', () => {
    // First inflow lands at 0 prior balance → new_avg = 100.
    const afterFirst = svc.computeWeightedAverage({
      oldAvgMinorUnits: 0n,
      oldBalanceKg: 0n,
      newCostPerTonMinorUnits: 100n,
      newInflowKg: 1000n,
    });
    expect(afterFirst).toBe(100n);

    const afterSecond = svc.computeWeightedAverage({
      oldAvgMinorUnits: 100n,
      oldBalanceKg: 1000n,
      newCostPerTonMinorUnits: 200n,
      newInflowKg: 1000n,
    });
    expect(afterSecond).toBe(150n);
  });

  it('returns 0 when both balances are zero', () => {
    expect(
      svc.computeWeightedAverage({
        oldAvgMinorUnits: 0n,
        oldBalanceKg: 0n,
        newCostPerTonMinorUnits: 0n,
        newInflowKg: 0n,
      }),
    ).toBe(0n);
  });

  it('handles asymmetric volumes: 9000 kg @100 + 1000 kg @200 → 110', () => {
    const avg = svc.computeWeightedAverage({
      oldAvgMinorUnits: 100n,
      oldBalanceKg: 9000n,
      newCostPerTonMinorUnits: 200n,
      newInflowKg: 1000n,
    });
    expect(avg).toBe(110n);
  });

  it('computeInflowCost stub returns XOF zero-cost (Phase 2 stub)', async () => {
    const cost = await svc.computeInflowCost({
      tenantId: 't',
      rotationId: 'r',
      operationalDayId: 'od',
      loadedTonnageKg: 1000n,
    });
    expect(cost.currency).toBe('XOF');
    expect(cost.costPerTonMinorUnits).toBe(0n);
  });
});
