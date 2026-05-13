/**
 * StockpileBalanceService unit tests — STK-01 projection math.
 *
 * Uses an in-memory fake DataSource emulating SELECT FOR UPDATE / INSERT /
 * UPDATE semantics on stockpile_balance. Threshold/valuation collaborators
 * are stubbed; their math is exercised separately.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  StockpileBalanceService,
  ApplyEventInput,
} from '../../../src/modules/stockpile/services/stockpile-balance.service';
import { StockpileValuationService } from '../../../src/modules/stockpile/services/stockpile-valuation.service';
import { StockpileThresholdService } from '../../../src/modules/stockpile/services/stockpile-threshold.service';

interface BalanceRow {
  tenant_id: string;
  site_id: string;
  stockpile_id: string;
  calibre_code: string;
  balance_kg: string;
  weighted_avg_cost_per_ton_minor_units: string;
  currency: string | null;
}

class FakeEm {
  rows: BalanceRow[] = [];

  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const n = sql.replace(/\s+/g, ' ').trim();
    if (n.startsWith('SELECT tenant_id, stockpile_id, calibre_code, site_id')) {
      const [tenantId, stockpileId, calibreCode] = params as [string, string, string];
      const m = this.rows.find(
        (r) =>
          r.tenant_id === tenantId &&
          r.stockpile_id === stockpileId &&
          r.calibre_code === calibreCode,
      );
      return m ? [m] : [];
    }
    if (n.startsWith('INSERT INTO stockpile_balance')) {
      const [
        tenantId,
        siteId,
        stockpileId,
        calibreCode,
        balanceKg,
        _eventId,
        weightedAvg,
        currency,
      ] = params as [string, string, string, string, string, string, string, string | null];
      this.rows.push({
        tenant_id: tenantId,
        site_id: siteId,
        stockpile_id: stockpileId,
        calibre_code: calibreCode,
        balance_kg: balanceKg,
        weighted_avg_cost_per_ton_minor_units: weightedAvg,
        currency,
      });
      return [];
    }
    if (n.startsWith('UPDATE stockpile_balance')) {
      const [tenantId, stockpileId, calibreCode, balanceKg, _eventId, weightedAvg, currency] =
        params as [string, string, string, string, string, string, string | null];
      const r = this.rows.find(
        (x) =>
          x.tenant_id === tenantId &&
          x.stockpile_id === stockpileId &&
          x.calibre_code === calibreCode,
      );
      if (r) {
        r.balance_kg = balanceKg;
        r.weighted_avg_cost_per_ton_minor_units = weightedAvg;
        r.currency = currency;
      }
      return [];
    }
    return [];
  }
}

class FakeDs {
  em = new FakeEm();
  async transaction<T>(cb: (em: FakeEm) => Promise<T>): Promise<T> {
    return cb(this.em);
  }
  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    return this.em.query(sql, params);
  }
}

function makeService(): {
  svc: StockpileBalanceService;
  ds: FakeDs;
  thresholdCrossings: unknown[];
} {
  const ds = new FakeDs();
  const valuation = new StockpileValuationService();
  const events = new EventEmitter2();
  const crossings: unknown[] = [];
  const thresholdSvc: Pick<StockpileThresholdService, 'checkCrossing'> = {
    checkCrossing: async (input) => {
      crossings.push(input);
    },
  };
  const svc = new StockpileBalanceService(
    ds as unknown as never,
    valuation,
    thresholdSvc as StockpileThresholdService,
    events,
  );
  return { svc, ds, thresholdCrossings: crossings };
}

function inflow(overrides: Partial<ApplyEventInput> = {}): ApplyEventInput {
  return {
    tenantId: 't1',
    siteId: 's1',
    stockpileId: 'sp1',
    calibreCode: '0-31_5',
    eventType: 'STOCKPILE_INFLOW',
    tonnageDeltaKg: 1000n,
    costPerTonMinorUnits: 0n,
    currency: 'XOF',
    eventId: 'e1',
    ...overrides,
  };
}

describe('StockpileBalanceService.applyEvent — projection math (STK-01)', () => {
  it('3 INFLOW events totalling +5000 kg → balance = 5000', async () => {
    const { svc, ds } = makeService();
    await svc.applyEvent(inflow({ tonnageDeltaKg: 1500n, eventId: 'e1' }));
    await svc.applyEvent(inflow({ tonnageDeltaKg: 2000n, eventId: 'e2' }));
    await svc.applyEvent(inflow({ tonnageDeltaKg: 1500n, eventId: 'e3' }));
    expect(BigInt(ds.em.rows[0].balance_kg)).toBe(5000n);
  });

  it('OUTFLOW reduces the balance', async () => {
    const { svc, ds } = makeService();
    await svc.applyEvent(inflow({ tonnageDeltaKg: 5000n, eventId: 'e1' }));
    await svc.applyEvent(
      inflow({
        eventType: 'STOCKPILE_OUTFLOW_SALE',
        tonnageDeltaKg: -2000n,
        eventId: 'e2',
      }),
    );
    expect(BigInt(ds.em.rows[0].balance_kg)).toBe(3000n);
  });

  it('returns previous and new balances for downstream threshold checks', async () => {
    const { svc } = makeService();
    await svc.applyEvent(inflow({ tonnageDeltaKg: 1000n, eventId: 'e1' }));
    const result = await svc.applyEvent(inflow({ tonnageDeltaKg: 500n, eventId: 'e2' }));
    expect(result.oldBalanceKg).toBe(1000n);
    expect(result.newBalanceKg).toBe(1500n);
  });

  it('invokes threshold-crossing check on every event', async () => {
    const { svc, thresholdCrossings } = makeService();
    await svc.applyEvent(inflow({ eventId: 'e1' }));
    await svc.applyEvent(inflow({ eventId: 'e2' }));
    expect(thresholdCrossings.length).toBe(2);
  });
});
