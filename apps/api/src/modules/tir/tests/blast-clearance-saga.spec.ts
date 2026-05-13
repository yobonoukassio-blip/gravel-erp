import { BlastPlanSagaHandler } from '../saga/blast-plan-saga.handler';
import { BlastClearanceTimeoutJob } from '../jobs/blast-clearance-timeout.job';

/**
 * TIR-05 blast clearance saga spec.
 */
describe('BlastPlanSagaHandler (TIR-05)', () => {
  let saga: BlastPlanSagaHandler;
  let mockBlastPlanService: {
    transitionToFired: jest.Mock;
  };

  const TENANT = 'tenant-ci';
  const PLAN_ID = 'plan-001';
  const SITE_ID = 'site-q1';

  beforeEach(() => {
    mockBlastPlanService = {
      transitionToFired: jest.fn().mockResolvedValue({ id: PLAN_ID, status: 'FIRED' }),
    };
    saga = new BlastPlanSagaHandler(mockBlastPlanService as never);
  });

  describe('handleZoneCleared', () => {
    it('calls transitionToFired when zone_cleared event is received', async () => {
      await saga.handleZoneCleared({
        planId: PLAN_ID,
        clearanceToken: 'token-uuid',
        tenantId: TENANT,
      });
      expect(mockBlastPlanService.transitionToFired).toHaveBeenCalledWith(PLAN_ID, TENANT);
    });

    it('swallows error when plan is already FIRED (idempotent saga)', async () => {
      mockBlastPlanService.transitionToFired.mockRejectedValue(
        new Error('ERR_BLAST_PLAN_INVALID_STATUS'),
      );
      // Should NOT throw
      await expect(
        saga.handleZoneCleared({ planId: PLAN_ID, clearanceToken: 'tok', tenantId: TENANT }),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleClearanceTimeout', () => {
    it('logs but does not throw for timeout event', async () => {
      await expect(
        saga.handleClearanceTimeout({ planId: PLAN_ID, tenantId: TENANT, siteId: SITE_ID }),
      ).resolves.toBeUndefined();
    });
  });
});

describe('BlastClearanceTimeoutJob (TIR-05)', () => {
  let job: BlastClearanceTimeoutJob;
  let mockDs: { query: jest.Mock };
  let mockEvents: { emit: jest.Mock };

  const TENANT = 'tenant-ci';
  const PLAN_ID = 'plan-001';
  const SITE_ID = 'site-q1';

  beforeEach(() => {
    mockDs = { query: jest.fn() };
    mockEvents = { emit: jest.fn() };
    job = new BlastClearanceTimeoutJob(mockDs as never, mockEvents as never);
  });

  it('emits fire_clearance_timeout when plan is still FIRE_REQUESTED after 4h', async () => {
    mockDs.query.mockResolvedValueOnce([{ status: 'FIRE_REQUESTED' }]);
    await job.execute({ planId: PLAN_ID, tenantId: TENANT, siteId: SITE_ID });
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'tir.blast_plan.fire_clearance_timeout',
      expect.objectContaining({ planId: PLAN_ID }),
    );
  });

  it('does NOT emit timeout when plan is already FIRED', async () => {
    mockDs.query.mockResolvedValueOnce([{ status: 'FIRED' }]);
    await job.execute({ planId: PLAN_ID, tenantId: TENANT, siteId: SITE_ID });
    expect(mockEvents.emit).not.toHaveBeenCalled();
  });

  it('does NOT emit timeout when plan is CLEARED', async () => {
    mockDs.query.mockResolvedValueOnce([{ status: 'CLEARED' }]);
    await job.execute({ planId: PLAN_ID, tenantId: TENANT, siteId: SITE_ID });
    expect(mockEvents.emit).not.toHaveBeenCalled();
  });

  it('is a no-op when plan not found', async () => {
    mockDs.query.mockResolvedValueOnce([]);
    await expect(
      job.execute({ planId: PLAN_ID, tenantId: TENANT, siteId: SITE_ID }),
    ).resolves.toBeUndefined();
    expect(mockEvents.emit).not.toHaveBeenCalled();
  });
});
