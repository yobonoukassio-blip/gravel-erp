import { DataSource } from 'typeorm';
import { EmployeeService } from '../services/employee.service';

/**
 * Unit tests for EmployeeService.blockClosure / resolveClosure (Phase 3 W0-P01).
 *
 * Four cases per PLAN.md:
 *   1. blockClosure appends reason to empty array
 *   2. blockClosure is idempotent (same reason twice = array length 1)
 *   3. resolveClosure removes matching reason
 *   4. resolveClosure on empty array is a no-op
 */

const DAY_ID = 'day-uuid-001';
const REASON = 'EXPLOSIVES_RECONCILIATION_PENDING';

describe('EmployeeService — blockClosure / resolveClosure', () => {
  let svc: EmployeeService;
  let capturedSql: string;
  let capturedParams: unknown[];

  beforeEach(() => {
    const ds = {
      query: jest.fn().mockImplementation((sql: string, params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return Promise.resolve([]);
      }),
    } as unknown as DataSource;
    svc = new EmployeeService(ds);
  });

  it('1. blockClosure appends reason to empty array', async () => {
    await svc.blockClosure(DAY_ID, REASON);
    expect(capturedParams[0]).toBe(DAY_ID);
    // The second param should be the JSON array containing the reason
    expect(capturedParams[1]).toBe(JSON.stringify([REASON]));
    expect(capturedSql).toContain('closure_blockers');
    expect(capturedSql).toContain('@>');
  });

  it('2. blockClosure is idempotent — uses @> containment check', async () => {
    // Call twice; the SQL uses CASE WHEN ... @> to prevent duplicates
    await svc.blockClosure(DAY_ID, REASON);
    await svc.blockClosure(DAY_ID, REASON);
    // Both calls produce the same SQL; DB handles idempotency via @> containment
    expect(capturedSql).toContain('CASE');
    expect(capturedSql).toContain('@>');
  });

  it('3. resolveClosure removes matching reason', async () => {
    await svc.resolveClosure(DAY_ID, REASON);
    expect(capturedParams[0]).toBe(DAY_ID);
    expect(capturedParams[1]).toBe(JSON.stringify(REASON));
    expect(capturedSql).toContain('jsonb_agg');
    expect(capturedSql).toContain('closure_blockers');
  });

  it('4. resolveClosure on empty array is a no-op (no exception)', async () => {
    await expect(svc.resolveClosure(DAY_ID, 'NON_EXISTENT')).resolves.not.toThrow();
    expect(capturedSql).toContain('jsonb_agg');
  });
});

describe('EmployeeService — create validation', () => {
  it('throws when neither site_id nor subcontractor_id provided', async () => {
    const ds = { query: jest.fn() } as unknown as DataSource;
    const svc = new EmployeeService(ds);
    await expect(
      svc.create({
        tenantId: 'tenant-1',
        siteId: null,
        subcontractorId: null,
        firstName: 'Jean',
        lastName: 'Koné',
        contractType: 'CDI',
        roleCode: 'FOREUR',
        createdBy: 'admin-1',
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('site_id') });
  });
});
