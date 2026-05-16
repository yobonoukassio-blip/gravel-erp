// REQ: HSE-04 — assertValidAt() hard gate.
//
// Pure-unit spec for the new throw-on-failure variant of the habilitation
// check. Verifies:
//   1. Pass-through when employee holds a valid cert at asOfDate
//   2. ForbiddenException with code=HABILITATION_MISSING when missing
//   3. Side-effect: hse.habilitation.gap event emitted on failure (for
//      AlertDispatcher routing)
//   4. asOfDate is always the explicit argument — service never calls
//      new Date() internally (deterministic for replays/tests)

import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  HabilitationGapException,
  RhHabilitationService,
} from '../services/rh-habilitation.service';

function makeStubDs(rowsToReturn: unknown[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const ds = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rowsToReturn;
    },
  };
  return { ds, calls };
}

describe('RhHabilitationService.assertValidAt (HSE-04 gate)', () => {
  const EMPLOYEE = '11111111-1111-1111-1111-111111111111';
  const CERT = 'PERMIS_EXPLOSIFS';
  const AS_OF = new Date('2026-05-15T08:00:00Z');

  it('returns silently when employee holds a valid cert as-of the date', async () => {
    const { ds, calls } = makeStubDs([{ '?column?': 1 }]);
    const emitter = new EventEmitter2();
    const emitSpy = jest.spyOn(emitter, 'emit');
    const svc = new RhHabilitationService(ds as never, emitter);

    await expect(svc.assertValidAt(EMPLOYEE, CERT, AS_OF)).resolves.toBeUndefined();

    // Single isValidAt SQL call; gap event NOT emitted
    expect(calls).toHaveLength(1);
    expect(emitSpy).not.toHaveBeenCalledWith('hse.habilitation.gap', expect.anything());
  });

  it('throws ForbiddenException + emits hse.habilitation.gap when no valid cert', async () => {
    const { ds } = makeStubDs([]); // no rows = no valid cert
    const emitter = new EventEmitter2();
    const emitSpy = jest.spyOn(emitter, 'emit');
    const svc = new RhHabilitationService(ds as never, emitter);

    await expect(
      svc.assertValidAt(EMPLOYEE, CERT, AS_OF),
    ).rejects.toBeInstanceOf(HabilitationGapException);
    await expect(
      svc.assertValidAt(EMPLOYEE, CERT, AS_OF),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(emitSpy).toHaveBeenCalledWith('hse.habilitation.gap', {
      employeeId: EMPLOYEE,
      certCode: CERT,
      asOfDate: '2026-05-15',
    });
  });

  it('uses the explicit asOfDate string for the SQL parameter (no new Date())', async () => {
    const { ds, calls } = makeStubDs([{ '?column?': 1 }]);
    const svc = new RhHabilitationService(ds as never, new EventEmitter2());

    await svc.assertValidAt(EMPLOYEE, CERT, new Date('2025-12-31T23:00:00Z'));

    // The day param in the WHERE clause must be the slice() of asOfDate
    expect(calls[0].params[2]).toBe('2025-12-31');
  });

  it('exception payload exposes a structured 403 with code=HABILITATION_MISSING', async () => {
    const { ds } = makeStubDs([]);
    const svc = new RhHabilitationService(ds as never, new EventEmitter2());

    try {
      await svc.assertValidAt(EMPLOYEE, CERT, AS_OF);
      fail('Expected HabilitationGapException');
    } catch (err) {
      const response = (err as ForbiddenException).getResponse() as {
        code: string;
        employeeId: string;
        certCode: string;
        asOfDate: string;
      };
      expect(response.code).toBe('HABILITATION_MISSING');
      expect(response.employeeId).toBe(EMPLOYEE);
      expect(response.certCode).toBe(CERT);
      expect(response.asOfDate).toBe('2026-05-15');
    }
  });
});
