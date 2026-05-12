/**
 * Sanity-test alongside the service (collated with the unit suite under
 * `test/unit/operational-day.spec.ts`). Kept here to follow NestJS convention.
 */
import { OperationalDayService } from './operational-day.service';

describe('OperationalDayService (co-located)', () => {
  it('instantiates and exposes resolveBusinessDate + computeUtcWindow', () => {
    const svc = new OperationalDayService();
    expect(typeof svc.resolveBusinessDate).toBe('function');
    expect(typeof svc.computeUtcWindow).toBe('function');
  });
});
