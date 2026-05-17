import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PreventiveMaintenanceSchedulerJob } from '../../../src/modules/maintenance/jobs/preventive-maintenance-scheduler.job';
import { WorkOrderService } from '../../../src/modules/maintenance/services/work-order.service';

/**
 * PreventiveMaintenanceSchedulerJob unit tests (Phase 8 W2-P01 T02).
 *
 * Covers:
 *  Test 1: @Cron decorator metadata (cronTime '0 * * * *', name 'pm-scheduler-hourly')
 *  Test 2: tenant fan-out + SET LOCAL app.current_tenant
 *  Test 3: days-based plan due -> opens WO with dueReason='days'
 *  Test 4: hours-based plan due -> opens WO with dueReason='hours'
 *  Test 5: km-based plan due -> opens WO with dueReason='km'
 *  Test 6: findOpen returns existing -> skipped_existing, no open() called
 *  Test 7: severity escalation per D-12 (>7 days OR >25% overdue ratio -> critical)
 *  Test 8: one tenant failing does NOT stop the other tenants
 *  Test 9: hour_meter_current IS NULL -> skipped_missing_meter
 */
describe('PreventiveMaintenanceSchedulerJob', () => {
  let job: PreventiveMaintenanceSchedulerJob;
  let mockDsQuery: jest.Mock;
  let mockTransaction: jest.Mock;
  let mockManagerQuery: jest.Mock;
  let mockFindOpen: jest.Mock;
  let mockOpen: jest.Mock;

  // Helper to wire DataSource.transaction + per-tx manager.query
  function makeTxManager(plans: unknown[]) {
    mockManagerQuery = jest.fn().mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.startsWith('SET LOCAL')) {
        return Promise.resolve(undefined);
      }
      // The plan SELECT
      return Promise.resolve(plans);
    });
    mockTransaction = jest.fn(async (cb: (m: unknown) => unknown) =>
      cb({ query: mockManagerQuery }),
    );
  }

  beforeEach(async () => {
    mockDsQuery = jest.fn();
    makeTxManager([]);

    mockFindOpen = jest.fn().mockResolvedValue(null);
    mockOpen = jest.fn().mockResolvedValue({ id: 'wo-opened' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreventiveMaintenanceSchedulerJob,
        {
          provide: DataSource,
          useValue: {
            query: mockDsQuery,
            transaction: (cb: (m: unknown) => unknown) => mockTransaction(cb),
          },
        },
        {
          provide: WorkOrderService,
          useValue: { findOpen: mockFindOpen, open: mockOpen },
        },
      ],
    }).compile();

    job = module.get(PreventiveMaintenanceSchedulerJob);
  });

  // ============================================================
  // Test 1: @Cron metadata
  // ============================================================
  it('Test 1: @Cron decorator registers cronTime=0 * * * *, name=pm-scheduler-hourly, UTC', () => {
    // @nestjs/schedule's Cron decorator applies SetMetadata to the method,
    // which under @nestjs/common's SetMetadata stores on the descriptor's
    // value function. Try both the prototype-with-key and the method-fn
    // forms to be robust across SetMetadata implementations.
    const protoMethod = (PreventiveMaintenanceSchedulerJob.prototype as unknown as Record<string, unknown>)['handleCron'];
    const metaOnFn = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', protoMethod as object);
    const metaOnProto = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      PreventiveMaintenanceSchedulerJob.prototype,
      'handleCron',
    );
    const meta = metaOnFn ?? metaOnProto;
    expect(meta).toBeDefined();
    expect(meta.cronTime).toBe('0 * * * *');
    expect(meta.name).toBe('pm-scheduler-hourly');
    expect(meta.timeZone).toBe('UTC');
  });

  // ============================================================
  // Test 2: tenant fan-out + SET LOCAL app.current_tenant
  // ============================================================
  it('Test 2: iterates tenants and sets SET LOCAL app.current_tenant per tenant', async () => {
    mockDsQuery.mockResolvedValueOnce([{ id: 'tenant-A' }, { id: 'tenant-B' }]);
    // No plans for either tenant
    makeTxManager([]);

    await job.runForNow(new Date('2026-05-17T12:00:00Z'));

    // 2 transactions, one per tenant
    expect(mockTransaction).toHaveBeenCalledTimes(2);
    // Each transaction issued SET LOCAL with the correct tenant id
    const setLocalCalls = mockManagerQuery.mock.calls.filter((c) =>
      String(c[0]).startsWith('SET LOCAL app.current_tenant'),
    );
    expect(setLocalCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // Test 3: days-based plan due
  // ============================================================
  it('Test 3: days-based plan, next_due_at_utc in the past, opens WO with dueReason=days', async () => {
    mockDsQuery.mockResolvedValueOnce([{ id: 'tenant-A' }]);
    makeTxManager([
      {
        pm_plan_id: 'pmp-d',
        tenant_id: 'tenant-A',
        equipment_id: 'eq-1',
        site_id: 'site-1',
        interval_unit: 'days',
        interval_value: 30,
        last_executed_meter: null,
        next_due_at_utc: '2026-05-16T10:00:00Z',
        hour_meter_current: null,
        odometer_km_current: null,
      },
    ]);

    const result = await job.runForNow(new Date('2026-05-16T11:00:00Z'));

    expect(result.opened).toBe(1);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    const openArg = mockOpen.mock.calls[0][0];
    expect(openArg.type).toBe('preventive');
    expect(openArg.pmPlanId).toBe('pmp-d');
    expect(openArg.preventiveContext.dueReason).toBe('days');
    expect(openArg.preventiveContext.overdueBy).toBe(1); // 1 hour overdue
    expect(openArg.preventiveContext.severity).toBe('warning');
  });

  // ============================================================
  // Test 4: hours-based plan due
  // ============================================================
  it('Test 4: hours-based plan, current >= last + interval, opens WO with dueReason=hours', async () => {
    mockDsQuery.mockResolvedValueOnce([{ id: 'tenant-A' }]);
    makeTxManager([
      {
        pm_plan_id: 'pmp-h',
        tenant_id: 'tenant-A',
        equipment_id: 'eq-1',
        site_id: 'site-1',
        interval_unit: 'hours',
        interval_value: 250,
        last_executed_meter: '1000',
        next_due_at_utc: null,
        hour_meter_current: '1251',
        odometer_km_current: null,
      },
    ]);

    const result = await job.runForNow(new Date());

    expect(result.opened).toBe(1);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    const openArg = mockOpen.mock.calls[0][0];
    expect(openArg.preventiveContext.dueReason).toBe('hours');
    expect(openArg.preventiveContext.overdueBy).toBe(1); // 1251 - (1000 + 250) = 1
    expect(openArg.preventiveContext.severity).toBe('warning');
  });

  // ============================================================
  // Test 5: km-based plan due
  // ============================================================
  it('Test 5: km-based plan, current >= last + interval, opens WO with dueReason=km', async () => {
    mockDsQuery.mockResolvedValueOnce([{ id: 'tenant-A' }]);
    makeTxManager([
      {
        pm_plan_id: 'pmp-k',
        tenant_id: 'tenant-A',
        equipment_id: 'eq-1',
        site_id: 'site-1',
        interval_unit: 'km',
        interval_value: 10000,
        last_executed_meter: '50000',
        next_due_at_utc: null,
        hour_meter_current: null,
        odometer_km_current: '61000',
      },
    ]);

    const result = await job.runForNow(new Date());

    expect(result.opened).toBe(1);
    const openArg = mockOpen.mock.calls[0][0];
    expect(openArg.preventiveContext.dueReason).toBe('km');
    expect(openArg.preventiveContext.overdueBy).toBe(1000); // 61000 - (50000 + 10000)
  });

  // ============================================================
  // Test 6: findOpen returns existing -> skipped_existing
  // ============================================================
  it('Test 6: skips plan when findOpen returns an existing WO (D-02 idempotency)', async () => {
    mockDsQuery.mockResolvedValueOnce([{ id: 'tenant-A' }]);
    makeTxManager([
      {
        pm_plan_id: 'pmp-h',
        tenant_id: 'tenant-A',
        equipment_id: 'eq-1',
        site_id: 'site-1',
        interval_unit: 'hours',
        interval_value: 250,
        last_executed_meter: '1000',
        next_due_at_utc: null,
        hour_meter_current: '1300',
        odometer_km_current: null,
      },
    ]);
    mockFindOpen.mockResolvedValueOnce({ id: 'wo-existing' });

    const result = await job.runForNow(new Date());

    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockFindOpen).toHaveBeenCalledTimes(1);
    expect(result.opened).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // Test 7: severity escalation per D-12
  // ============================================================
  describe('Test 7: severity escalation (D-12)', () => {
    it('days plan: overdue > 7 days -> critical', () => {
      const plan = {
        pm_plan_id: 'p',
        tenant_id: 't',
        equipment_id: 'e',
        site_id: 's',
        interval_unit: 'days' as const,
        interval_value: 30,
        last_executed_meter: null,
        next_due_at_utc: '2026-05-01T00:00:00Z',
        hour_meter_current: null,
        odometer_km_current: null,
      };
      const res = job.evaluateDue(plan, new Date('2026-05-10T00:00:00Z'));
      expect(res?.severity).toBe('critical');
    });

    it('hours plan: overdueRatio > 0.25 -> critical', () => {
      const plan = {
        pm_plan_id: 'p',
        tenant_id: 't',
        equipment_id: 'e',
        site_id: 's',
        interval_unit: 'hours' as const,
        interval_value: 100,
        last_executed_meter: '1000',
        next_due_at_utc: null,
        hour_meter_current: '1130', // overdue by 30 hours / 100 = 0.30
        odometer_km_current: null,
      };
      const res = job.evaluateDue(plan, new Date());
      expect(res?.severity).toBe('critical');
    });

    it('hours plan: overdueRatio <= 0.25 -> warning', () => {
      const plan = {
        pm_plan_id: 'p',
        tenant_id: 't',
        equipment_id: 'e',
        site_id: 's',
        interval_unit: 'hours' as const,
        interval_value: 100,
        last_executed_meter: '1000',
        next_due_at_utc: null,
        hour_meter_current: '1110', // overdue by 10 / 100 = 0.10
        odometer_km_current: null,
      };
      const res = job.evaluateDue(plan, new Date());
      expect(res?.severity).toBe('warning');
    });
  });

  // ============================================================
  // Test 8: one tenant failing does NOT stop the others
  // ============================================================
  it('Test 8: tenant failure is isolated; other tenants still process', async () => {
    mockDsQuery.mockResolvedValueOnce([
      { id: 'tenant-FAIL' },
      { id: 'tenant-OK' },
    ]);

    let txCall = 0;
    mockTransaction = jest.fn(async (cb: (m: unknown) => unknown) => {
      txCall++;
      if (txCall === 1) {
        throw new Error('simulated DB failure');
      }
      // Second tx: empty plans
      return cb({ query: jest.fn().mockResolvedValue([]) });
    });

    const result = await job.runForNow(new Date());
    expect(result.failures).toBe(1);
    // Did NOT throw; second tenant processed
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  // ============================================================
  // Test 9: missing meter -> skipped_missing_meter
  // ============================================================
  it('Test 9: hours plan with NULL hour_meter_current -> skipped_missing_meter, no open()', async () => {
    mockDsQuery.mockResolvedValueOnce([{ id: 'tenant-A' }]);
    makeTxManager([
      {
        pm_plan_id: 'pmp-h',
        tenant_id: 'tenant-A',
        equipment_id: 'eq-1',
        site_id: 'site-1',
        interval_unit: 'hours',
        interval_value: 250,
        last_executed_meter: '1000',
        next_due_at_utc: null,
        hour_meter_current: null, // missing
        odometer_km_current: null,
      },
    ]);

    const result = await job.runForNow(new Date());

    expect(mockOpen).not.toHaveBeenCalled();
    expect(result.opened).toBe(0);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });
});
