import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  FuelReconciliationService,
  RECONCILIATION_DRIFT_THRESHOLD_PCT,
  ReconciliationDriftPayload,
} from '../../../src/modules/fuel/services/fuel-reconciliation.service';
import { FuelTankEventService } from '../../../src/modules/fuel/services/fuel-tank-event.service';

/**
 * FuelReconciliationService unit tests — CAR-01 / D2-53.
 *
 * Verifies:
 *   - drift > 0.5% capacity → FUEL_RECONCILIATION event inserted + alert emitted
 *   - drift <= 0.5% capacity → FUEL_RECONCILIATION event inserted but NO alert
 *   - RECONCILIATION_DRIFT_THRESHOLD_PCT = 0.005
 */

interface TankRow {
  id: string;
  tenant_id: string;
  site_id: string;
  capacity_liters: number;
}

interface FuelEventInserted {
  event_type: string;
  liters_delta: string;
  source_reference: Record<string, unknown>;
}

class FakeDb {
  tank: TankRow | null = null;
  theoreticalSum: number = 0;
  projectedBalance: number | null = null; // null = no projection row
  fuelEventsInserted: FuelEventInserted[] = [];
  prevHashRows: Array<{ row_hash: Buffer }> = [];

  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // fetchPrevHash (fuel event service)
    if (normalized.startsWith('SELECT row_hash FROM fuel_tank_event')) {
      return this.prevHashRows;
    }

    // INSERT fuel_tank_event (reconciliation event)
    if (normalized.startsWith('INSERT INTO fuel_tank_event')) {
      const eventType = params[4] as string;
      const litersDelta = params[5] as string;
      const sourceRef = JSON.parse(params[7] as string) as Record<string, unknown>;
      this.fuelEventsInserted.push({ event_type: eventType, liters_delta: litersDelta, source_reference: sourceRef });
      // Return a minimal row so the service can map it
      return [{
        id: 'recon-event-id', tenant_id: params[1], site_id: params[2],
        tank_id: params[3], event_type: eventType, liters_delta: litersDelta,
        operational_day_id: params[6], source_reference: params[7],
        occurred_at_utc: params[8], created_by: params[9],
        prev_hash: params[10], row_hash: params[11],
        cost_per_liter_minor_units: null, currency: null, created_at_utc: new Date(),
      }];
    }

    // Fetch tank
    if (normalized.startsWith('SELECT id, tenant_id, site_id, capacity_liters FROM fuel_tank')) {
      return this.tank ? [this.tank] : [];
    }

    // Theoretical sum
    if (normalized.includes('COALESCE(SUM(liters_delta)')) {
      return [{ total: this.theoreticalSum.toString() }];
    }

    // Projected balance
    if (normalized.includes('SELECT balance_liters FROM fuel_tank_balance')) {
      if (this.projectedBalance === null) return [];
      return [{ balance_liters: this.projectedBalance.toString() }];
    }

    // Operational day
    if (normalized.includes('SELECT id FROM operational_days')) {
      return [{ id: 'opday-1' }];
    }

    return [];
  }
}

class FakeDataSource {
  db = new FakeDb();
  async query(sql: string, params: unknown[]): Promise<unknown[]> {
    return this.db.query(sql, params);
  }
  async transaction<T>(cb: (em: FakeDb) => Promise<T>): Promise<T> {
    return cb(this.db);
  }
}

function makeService(): {
  svc: FuelReconciliationService;
  ds: FakeDataSource;
  bus: EventEmitter2;
} {
  const ds = new FakeDataSource();
  const bus = new EventEmitter2();
  const fuelEventSvc = new FuelTankEventService(ds as unknown as never, bus);
  const svc = new FuelReconciliationService(ds as unknown as never, fuelEventSvc, bus);
  return { svc, ds, bus };
}

describe('FuelReconciliationService.runForTank (CAR-01)', () => {
  it('tank capacity 10000L: drift 100L (1%) > 0.5% threshold → emits alert + inserts FUEL_RECONCILIATION', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.reconciliation_drift_detected', spy);

    ds.db.tank = { id: 'tank1', tenant_id: 't1', site_id: 's1', capacity_liters: 10000 };
    ds.db.theoreticalSum = 8500;
    ds.db.projectedBalance = 8400; // drift = 100L = 1%

    const drifted = await svc.runForTank('tank1');

    expect(drifted).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0] as ReconciliationDriftPayload;
    expect(payload.theoreticalBalance).toBe(8500);
    expect(payload.projectedBalance).toBe(8400);
    expect(payload.driftLiters).toBe(100);
    expect(payload.driftPct).toBeCloseTo(0.01, 4);

    // FUEL_RECONCILIATION event inserted
    expect(ds.db.fuelEventsInserted).toHaveLength(1);
    expect(ds.db.fuelEventsInserted[0].event_type).toBe('FUEL_RECONCILIATION');
    expect(ds.db.fuelEventsInserted[0].liters_delta).toBe('0');
    expect(ds.db.fuelEventsInserted[0].source_reference['theoretical_balance']).toBe(8500);
    expect(ds.db.fuelEventsInserted[0].source_reference['drift_liters']).toBe(100);
  });

  it('tank capacity 10000L: drift 40L (0.4%) < 0.5% threshold → no alert but FUEL_RECONCILIATION event inserted', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.reconciliation_drift_detected', spy);

    ds.db.tank = { id: 'tank1', tenant_id: 't1', site_id: 's1', capacity_liters: 10000 };
    ds.db.theoreticalSum = 8500;
    ds.db.projectedBalance = 8460; // drift = 40L = 0.4%

    const drifted = await svc.runForTank('tank1');

    expect(drifted).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    // FUEL_RECONCILIATION still inserted
    expect(ds.db.fuelEventsInserted).toHaveLength(1);
    expect(ds.db.fuelEventsInserted[0].event_type).toBe('FUEL_RECONCILIATION');
  });

  it('returns false when tank not found', async () => {
    const { svc, ds } = makeService();
    ds.db.tank = null;

    const result = await svc.runForTank('unknown-tank');
    expect(result).toBe(false);
  });

  it('negative drift (theoretical < projected) also triggers alert if abs > threshold', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.reconciliation_drift_detected', spy);

    ds.db.tank = { id: 'tank1', tenant_id: 't1', site_id: 's1', capacity_liters: 10000 };
    ds.db.theoreticalSum = 8400;
    ds.db.projectedBalance = 8500; // drift = -100L → abs = 100L = 1%

    const drifted = await svc.runForTank('tank1');

    expect(drifted).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0] as ReconciliationDriftPayload;
    expect(payload.driftLiters).toBe(-100);
  });

  it('RECONCILIATION_DRIFT_THRESHOLD_PCT equals 0.005 (0.5%)', () => {
    expect(RECONCILIATION_DRIFT_THRESHOLD_PCT).toBe(0.005);
  });

  it('uses FUEL_RECONCILIATION token verbatim in inserted event', async () => {
    const { svc, ds } = makeService();
    ds.db.tank = { id: 'tank1', tenant_id: 't1', site_id: 's1', capacity_liters: 10000 };
    ds.db.theoreticalSum = 5000;
    ds.db.projectedBalance = 5000;

    await svc.runForTank('tank1');

    const ev = ds.db.fuelEventsInserted[0];
    expect(ev.event_type).toBe('FUEL_RECONCILIATION');
  });
});
