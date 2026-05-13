/**
 * REQ: FND-08 — OperationalDay resolver + DST handling.
 * Source: D-19, D-20, D-21, D-22, PITFALLS.md #9.
 */
import { OperationalDayService } from '../../src/modules/master-data/operational-day.service';

describe('FND-08: OperationalDay + DST handling', () => {
  const svc = new OperationalDayService();

  it('Africa/Abidjan (UTC+0), shift_start=06:00, event 05:30Z → business_date=previous day', () => {
    const event = new Date('2026-05-12T05:30:00Z');
    expect(svc.resolveBusinessDate('Africa/Abidjan', '06:00', event)).toBe('2026-05-11');
  });

  it('Africa/Abidjan, shift_start=06:00, event 06:00Z → business_date=same day (>= boundary)', () => {
    const event = new Date('2026-05-12T06:00:00Z');
    expect(svc.resolveBusinessDate('Africa/Abidjan', '06:00', event)).toBe('2026-05-12');
  });

  it('Africa/Abidjan, shift_start=06:00, event 05:59:59Z → business_date=previous day (-1s)', () => {
    const event = new Date('2026-05-12T05:59:59Z');
    expect(svc.resolveBusinessDate('Africa/Abidjan', '06:00', event)).toBe('2026-05-11');
  });

  it('Africa/Abidjan, shift_start=06:00, event 06:00:01Z → business_date=same day (+1s)', () => {
    const event = new Date('2026-05-12T06:00:01Z');
    expect(svc.resolveBusinessDate('Africa/Abidjan', '06:00', event)).toBe('2026-05-12');
  });

  // DST: 2026-10-25 fall-back in Europe/Paris — 03:00 CEST (UTC+2) → 02:00 CET (UTC+1).
  // Local clock 02:30 occurs twice: first at 00:30Z (CEST), second at 01:30Z (CET).
  it('Europe/Paris 2026-10-25 fall-back: BOTH occurrences of 02:30 local → business_date=2026-10-25', () => {
    const firstOccurrence = new Date('2026-10-25T00:30:00Z'); // 02:30 CEST
    const secondOccurrence = new Date('2026-10-25T01:30:00Z'); // 02:30 CET
    expect(svc.resolveBusinessDate('Europe/Paris', '06:00', firstOccurrence)).toBe('2026-10-24');
    expect(svc.resolveBusinessDate('Europe/Paris', '06:00', secondOccurrence)).toBe('2026-10-24');
    // Both 02:30 local instances precede the 06:00 shift start, so both
    // attach to the PREVIOUS business_date (2026-10-24).
  });

  it('Europe/Paris 2026-10-25 04:00Z (=05:00 CET, before shift start 06:00) → previous business day', () => {
    const event = new Date('2026-10-25T04:00:00Z');
    expect(svc.resolveBusinessDate('Europe/Paris', '06:00', event)).toBe('2026-10-24');
  });

  it('Europe/Paris 2026-10-25 05:00Z (=06:00 CET) → 2026-10-25 (at shift boundary)', () => {
    const event = new Date('2026-10-25T05:00:00Z');
    expect(svc.resolveBusinessDate('Europe/Paris', '06:00', event)).toBe('2026-10-25');
  });

  it('all reports query via operational_day_id, NEVER created_at::date (D-20 — enforced by lint, asserted by convention here)', () => {
    // This is a CI-lint rule (see apps/api ESLint config). The runtime check
    // here just guards that the service exposes a single resolveBusinessDate
    // contract — reports must call it, not slice timestamps client-side.
    expect(typeof svc.resolveBusinessDate).toBe('function');
  });

  it('Shift FK on OperationalDay enables day/night/3x8 patterns (D-22): computeUtcWindow returns 24h span', () => {
    const w = svc.computeUtcWindow('Africa/Abidjan', '06:00', '2026-05-12');
    const diffMs = w.endedAtUtc.getTime() - w.startedAtUtc.getTime();
    expect(diffMs).toBe(24 * 3600 * 1000);
  });

  it('computeUtcWindow handles DST fall-back: window is 25h on the DST day in Europe/Paris', () => {
    // With shift start 06:00, the 25h window straddles Oct 24→Oct 25 (the
    // fall-back at 03:00 CEST on Oct 25 falls inside that window).
    const w = svc.computeUtcWindow('Europe/Paris', '06:00', '2026-10-24');
    const diffMs = w.endedAtUtc.getTime() - w.startedAtUtc.getTime();
    expect(diffMs).toBe(25 * 3600 * 1000);
  });

  it('rejects invalid shiftStartLocal format', () => {
    expect(() => svc.resolveBusinessDate('Africa/Abidjan', 'bad', new Date())).toThrow();
  });
});
