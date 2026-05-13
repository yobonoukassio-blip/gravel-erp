import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  FuelAnomalyService,
  ANOMALY_HIGH_MULTIPLIER,
  ANOMALY_LOW_MULTIPLIER,
  AnomalyDetectedPayload,
} from '../../../src/modules/fuel/services/fuel-anomaly.service';

/**
 * FuelAnomalyService unit tests — CAR-03.
 *
 * Seeded with 30d of normal consumption and a 7d window, verifies:
 *   - Ratio > 1.5× median → anomaly_detected with severity='high'
 *   - Normal data only → no event
 *   - Ratio < 0.4× median → anomaly_detected with severity='low'
 */

interface ConsumptionRow {
  liters: string;
  hours_since_previous: string;
}

interface MedianRow {
  median_ratio: string | null;
}

function buildConsumptionRows(count: number, litersPerHour: number, hoursPerRow: number): ConsumptionRow[] {
  return Array.from({ length: count }, () => ({
    liters: (litersPerHour * hoursPerRow).toFixed(2),
    hours_since_previous: hoursPerRow.toFixed(1),
  }));
}

class FakeDb {
  /** Data returned for the 7d window query. */
  rows7d: ConsumptionRow[] = [];
  /** Median ratio returned for the 30d preceding window. */
  medianRatio: string | null = null;

  async query(sql: string, _params: unknown[] = []): Promise<unknown[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // 7d window query
    if (normalized.includes('created_at_utc >=') && !normalized.includes('created_at_utc <')) {
      return this.rows7d;
    }

    // 30d preceding median query
    if (normalized.includes('percentile_cont')) {
      return [{ median_ratio: this.medianRatio }];
    }

    return [];
  }
}

class FakeDataSource {
  db = new FakeDb();
  async query(sql: string, params: unknown[]): Promise<unknown[]> {
    return this.db.query(sql, params);
  }
}

function makeService(): { svc: FuelAnomalyService; ds: FakeDataSource; bus: EventEmitter2 } {
  const ds = new FakeDataSource();
  const bus = new EventEmitter2();
  const svc = new FuelAnomalyService(ds as unknown as never, bus);
  return { svc, ds, bus };
}

describe('FuelAnomalyService.computeAndDetect (CAR-03)', () => {
  it('emits anomaly_detected with severity=high when ratio > 1.5× median', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.anomaly_detected', spy);

    // Normal consumption: 6 L/h over 30d window
    ds.db.medianRatio = '6.0';

    // Last 7d: 15 L/h — well above 1.5× (9 L/h)
    ds.db.rows7d = buildConsumptionRows(7, 15, 8); // 7 refuels, 8h each

    const detected = await svc.computeAndDetect('t1', 's1', 'eq1');

    expect(detected).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0] as AnomalyDetectedPayload;
    expect(payload.severity).toBe('high');
    expect(payload.ratio7d).toBeGreaterThan(ANOMALY_HIGH_MULTIPLIER * 6);
    expect(payload.median30d).toBe(6);
  });

  it('does NOT emit when consumption is normal (within thresholds)', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.anomaly_detected', spy);

    // Median 6 L/h, 7d also ~6 L/h (normal)
    ds.db.medianRatio = '6.0';
    ds.db.rows7d = buildConsumptionRows(7, 6, 8); // exactly at median

    const detected = await svc.computeAndDetect('t1', 's1', 'eq1');

    expect(detected).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits anomaly_detected with severity=low when ratio < 0.4× median', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.anomaly_detected', spy);

    // Median 6 L/h → low threshold is 2.4 L/h
    ds.db.medianRatio = '6.0';

    // Last 7d: 1 L/h — below 0.4× (2.4 L/h)
    ds.db.rows7d = buildConsumptionRows(7, 1, 8);

    const detected = await svc.computeAndDetect('t1', 's1', 'eq1');

    expect(detected).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0] as AnomalyDetectedPayload;
    expect(payload.severity).toBe('low');
    expect(payload.ratio7d).toBeLessThan(ANOMALY_LOW_MULTIPLIER * 6);
  });

  it('returns false when no 7d consumption data exists', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.anomaly_detected', spy);

    ds.db.medianRatio = '6.0';
    ds.db.rows7d = [];

    const detected = await svc.computeAndDetect('t1', 's1', 'eq1');

    expect(detected).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns false when no 30d median exists (first week of operation)', async () => {
    const { svc, ds, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.anomaly_detected', spy);

    ds.db.medianRatio = null; // no historical data
    ds.db.rows7d = buildConsumptionRows(7, 15, 8);

    const detected = await svc.computeAndDetect('t1', 's1', 'eq1');

    expect(detected).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('default constants match plan requirements (1.5 and 0.4)', () => {
    expect(ANOMALY_HIGH_MULTIPLIER).toBe(1.5);
    expect(ANOMALY_LOW_MULTIPLIER).toBe(0.4);
  });
});
