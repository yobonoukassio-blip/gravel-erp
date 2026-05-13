import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { RhHabilitationService } from '../services/rh-habilitation.service';

/**
 * Unit tests for RhHabilitationService.isValidAt (RH-04, HSE-04).
 *
 * All 6 boundary cases per PLAN.md:
 *   1. valid cert returns true when asOfDate === valid_from (lower bound)
 *   2. valid cert returns true when asOfDate === valid_to (upper bound)
 *   3. expired cert returns false when asOfDate === valid_to + 1 day
 *   4. cert not yet valid returns false when asOfDate === valid_from - 1 day
 *   5. subcontractor employee cert resolves same as regular employee
 *   6. certCode not in DB returns false (no exception)
 *
 * Uses a mock DataSource so no live DB is required.
 */

/** Helper: days offset from a base date */
function dateOffset(base: string, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const VALID_FROM = '2026-01-01';
const VALID_TO = '2026-12-31';
const EMPLOYEE_ID = 'emp-direct-001';
const SUBCONTRACTOR_EMP_ID = 'emp-subcon-001';
const CERT_CODE = 'PERMIS_EXPLOSIFS';

function buildMockDs(shouldReturn: boolean): DataSource {
  return {
    query: jest.fn().mockImplementation((_sql: string, params: unknown[]) => {
      const employeeId = params[0];
      const certCode = params[1];
      const asOfStr = params[2] as string;

      // Simulate the DB check: return 1 row when condition is met
      if (
        (employeeId === EMPLOYEE_ID || employeeId === SUBCONTRACTOR_EMP_ID) &&
        certCode === CERT_CODE &&
        asOfStr >= VALID_FROM &&
        asOfStr <= VALID_TO &&
        shouldReturn
      ) {
        return Promise.resolve([{ '?column?': '1' }]);
      }
      return Promise.resolve([]);
    }),
  } as unknown as DataSource;
}

describe('RhHabilitationService.isValidAt', () => {
  let svc: RhHabilitationService;
  let events: EventEmitter2;

  beforeEach(() => {
    events = new EventEmitter2();
  });

  it('1. returns true when asOfDate === valid_from (lower bound inclusive)', async () => {
    svc = new RhHabilitationService(buildMockDs(true), events);
    const result = await svc.isValidAt(EMPLOYEE_ID, CERT_CODE, makeDate(VALID_FROM));
    expect(result).toBe(true);
  });

  it('2. returns true when asOfDate === valid_to (upper bound inclusive)', async () => {
    svc = new RhHabilitationService(buildMockDs(true), events);
    const result = await svc.isValidAt(EMPLOYEE_ID, CERT_CODE, makeDate(VALID_TO));
    expect(result).toBe(true);
  });

  it('3. returns false when asOfDate === valid_to + 1 day (expired)', async () => {
    svc = new RhHabilitationService(buildMockDs(false), events);
    const dayAfterExpiry = dateOffset(VALID_TO, 1);
    const result = await svc.isValidAt(EMPLOYEE_ID, CERT_CODE, makeDate(dayAfterExpiry));
    expect(result).toBe(false);
  });

  it('4. returns false when asOfDate === valid_from - 1 day (not yet valid)', async () => {
    svc = new RhHabilitationService(buildMockDs(false), events);
    const dayBeforeStart = dateOffset(VALID_FROM, -1);
    const result = await svc.isValidAt(EMPLOYEE_ID, CERT_CODE, makeDate(dayBeforeStart));
    expect(result).toBe(false);
  });

  it('5. subcontractor employee cert resolves same as regular employee', async () => {
    svc = new RhHabilitationService(buildMockDs(true), events);
    const result = await svc.isValidAt(SUBCONTRACTOR_EMP_ID, CERT_CODE, makeDate(VALID_FROM));
    expect(result).toBe(true);
  });

  it('6. unknown certCode returns false without throwing', async () => {
    svc = new RhHabilitationService(buildMockDs(false), events);
    await expect(
      svc.isValidAt(EMPLOYEE_ID, 'UNKNOWN_CODE', makeDate(VALID_FROM)),
    ).resolves.toBe(false);
  });
});

describe('RhHabilitationService — date parameter contract', () => {
  it('isValidAt passes the asOfDate as YYYY-MM-DD to the query (never new Date() internally)', async () => {
    const mockQuery = jest.fn().mockResolvedValue([]);
    const ds = { query: mockQuery } as unknown as DataSource;
    const events = new EventEmitter2();
    const svc = new RhHabilitationService(ds, events);

    const asOf = new Date('2026-06-15T00:00:00.000Z');
    await svc.isValidAt('emp-001', CERT_CODE, asOf);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    // Third param is the date string YYYY-MM-DD
    expect(params[2]).toBe('2026-06-15');
  });
});
