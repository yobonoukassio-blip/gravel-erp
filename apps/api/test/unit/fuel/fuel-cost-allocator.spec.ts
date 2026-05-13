import { FuelCostAllocatorService } from '../../../src/modules/fuel/services/fuel-cost-allocator.service';

/**
 * FuelCostAllocatorService unit tests — wires W2-P05 stockpile valuation
 * (replaces XOF/0 stub) to the real per-op-day fuel cost.
 */

class FakeDb {
  totalCostMinorUnits: string = '0';
  currency: string | null = null;

  async query(_sql: string, _params: unknown[] = []): Promise<unknown[]> {
    return [
      {
        total_cost_minor_units: this.totalCostMinorUnits,
        currency: this.currency,
      },
    ];
  }
}

function make(): { svc: FuelCostAllocatorService; db: FakeDb } {
  const db = new FakeDb();
  const svc = new FuelCostAllocatorService(db as unknown as never);
  return { svc, db };
}

describe('FuelCostAllocatorService.allocateFuelCostForOperationalDay', () => {
  it('returns zeroed XOF when no consumption rows exist', async () => {
    const { svc } = make();
    const out = await svc.allocateFuelCostForOperationalDay({
      tenantId: 't1',
      siteId: 's1',
      operationalDayId: 'od1',
      tonnageKg: 1000n,
    });
    expect(out.amountMinorUnits).toBe(0n);
    expect(out.costPerTonMinorUnits).toBe(0n);
    expect(out.currency).toBe('XOF');
  });

  it('computes cost per ton from total fuel cost / tonnage', async () => {
    const { svc, db } = make();
    // 100 L × 75 000 XOF minor units = 7 500 000 minor units total
    db.totalCostMinorUnits = '7500000';
    db.currency = 'XOF';

    // 5_000 kg tonnage → 5 tonnes → 1 500 000 minor units / ton
    const out = await svc.allocateFuelCostForOperationalDay({
      tenantId: 't1',
      siteId: 's1',
      operationalDayId: 'od1',
      tonnageKg: 5000n,
    });
    expect(out.amountMinorUnits).toBe(7500000n);
    expect(out.costPerTonMinorUnits).toBe(1500000n);
    expect(out.currency).toBe('XOF');
  });

  it('returns total cost / 0 ton-per-ton when tonnage = 0 (degenerate)', async () => {
    const { svc, db } = make();
    db.totalCostMinorUnits = '7500000';
    db.currency = 'XOF';

    const out = await svc.allocateFuelCostForOperationalDay({
      tenantId: 't1',
      siteId: 's1',
      operationalDayId: 'od1',
      tonnageKg: 0n,
    });
    expect(out.costPerTonMinorUnits).toBe(0n);
    expect(out.amountMinorUnits).toBe(7500000n);
  });

  it('strips decimals from PG numeric result', async () => {
    const { svc, db } = make();
    db.totalCostMinorUnits = '7500000.50';
    db.currency = 'XOF';

    const out = await svc.allocateFuelCostForOperationalDay({
      tenantId: 't1',
      siteId: 's1',
      operationalDayId: 'od1',
      tonnageKg: 1000n,
    });
    // Decimals dropped → 7_500_000 minor units total
    expect(out.amountMinorUnits).toBe(7500000n);
  });
});
