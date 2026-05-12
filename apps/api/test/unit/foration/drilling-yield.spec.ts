import { ForationEventHandlers } from '../../../src/modules/foration/event-handlers/drilled-hole.handler';

/**
 * FOR-03 yield m/h:
 *
 * The actual SQL aggregation runs in Postgres against the materialized
 * view (`drilling_yield_per_machine_day`). Here we validate:
 *
 *   1. The yield formula matches our spec (total_depth_m / total_hours)
 *      with corrections excluded.
 *   2. The event handler debounces REFRESH MATERIALIZED VIEW per tenant.
 */

interface Hole {
  depthM: number;
  hours: number;
  isCorrection: boolean;
}

function computeYieldExcludingCorrections(holes: Hole[]): {
  total_depth_m: number;
  total_hours: number;
  yield_m_per_h: number;
} {
  const active = holes.filter((h) => !h.isCorrection);
  const total_depth_m = active.reduce((s, h) => s + h.depthM, 0);
  const total_hours = active.reduce((s, h) => s + h.hours, 0);
  return {
    total_depth_m,
    total_hours,
    yield_m_per_h: total_hours > 0 ? total_depth_m / total_hours : 0,
  };
}

describe('Drilling yield formula (FOR-03)', () => {
  it('computes 50m / 4h = 12.5 m/h for 10 holes', () => {
    const holes: Hole[] = Array.from({ length: 10 }, () => ({
      depthM: 5,
      hours: 0.4,
      isCorrection: false,
    }));
    const result = computeYieldExcludingCorrections(holes);
    expect(result.total_depth_m).toBe(50);
    expect(result.total_hours).toBeCloseTo(4, 5);
    expect(result.yield_m_per_h).toBeCloseTo(12.5, 5);
  });

  it('excludes correction events from the aggregation', () => {
    const holes: Hole[] = [
      { depthM: 10, hours: 1, isCorrection: false },
      { depthM: 10, hours: 1, isCorrection: true }, // correction — excluded
    ];
    const result = computeYieldExcludingCorrections(holes);
    expect(result.total_depth_m).toBe(10);
    expect(result.yield_m_per_h).toBe(10);
  });

  it('returns 0 yield when total hours = 0', () => {
    const result = computeYieldExcludingCorrections([]);
    expect(result.yield_m_per_h).toBe(0);
  });
});

describe('ForationEventHandlers debounce', () => {
  let calls: string[];
  let handler: ForationEventHandlers;

  beforeEach(() => {
    jest.useFakeTimers();
    calls = [];
    const fakeDs = {
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
      }),
    };
    handler = new ForationEventHandlers(fakeDs as never);
  });

  afterEach(() => {
    handler.onModuleDestroy();
    jest.useRealTimers();
  });

  const evt = (tenantId: string) => ({
    tenantId,
    payload: {
      tenant_id: tenantId,
      hole_id: 'h',
      operational_day_id: 'd',
      machine_id: 'm',
      operator_id: 'o',
    },
  });

  it('coalesces 5 events within 30s into a single REFRESH', async () => {
    for (let i = 0; i < 5; i++) {
      handler.onHoleDrilled(evt('tenant-1'));
      jest.advanceTimersByTime(1000);
    }
    expect(calls).toHaveLength(0);
    jest.advanceTimersByTime(30_000);
    // Allow the microtask queue to drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/REFRESH MATERIALIZED VIEW CONCURRENTLY/);
    expect(calls[0]).toMatch(/drilling_yield_per_machine_day/);
  });

  it('debounces independently per tenant', async () => {
    handler.onHoleDrilled(evt('tenant-1'));
    handler.onHoleDrilled(evt('tenant-2'));
    jest.advanceTimersByTime(30_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(2);
  });

  it('contains string "REFRESH MATERIALIZED VIEW CONCURRENTLY" and uses debounce', async () => {
    handler.onHoleDrilled(evt('tenant-z'));
    jest.advanceTimersByTime(30_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.join('\n')).toContain('REFRESH MATERIALIZED VIEW CONCURRENTLY');
  });
});
