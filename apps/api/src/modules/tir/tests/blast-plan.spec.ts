import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { BlastPlanService } from '../services/blast-plan.service';

/**
 * TIR-03 blast plan state machine spec.
 */
describe('BlastPlanService (TIR-03)', () => {
  let service: BlastPlanService;
  let mockDs: { query: jest.Mock };
  let mockRhHabilitation: { isValidAt: jest.Mock };
  let mockEvents: { emit: jest.Mock };

  const TENANT = 'tenant-ci';
  const PLAN_ID = 'plan-001';
  const HSE_OFFICER = 'hse-001';
  const OPERATOR = 'op-001';
  const SUPERVISOR = 'sup-001';
  const SHIFT_DATE = new Date('2026-05-13T06:00:00Z');
  const OP_DAY = { id: 'od-001', shiftStartLocal: SHIFT_DATE };

  function makePlanRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      id: PLAN_ID,
      tenant_id: TENANT,
      site_id: 'site-q1',
      operational_day_id: 'od-001',
      drilling_plan_id: 'dp-001',
      status: 'DRAFT',
      planned_by: 'planner-001',
      hse_approved_by: null,
      hse_approved_at_utc: null,
      loading_operator_id: null,
      loading_approved_at_utc: null,
      fire_requested_at_utc: null,
      clearance_token: null,
      fired_at_utc: null,
      notes_md: null,
      version: 1,
      created_at_utc: new Date().toISOString(),
      updated_at_utc: new Date().toISOString(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockDs = { query: jest.fn() };
    mockRhHabilitation = { isValidAt: jest.fn().mockResolvedValue(true) };
    mockEvents = { emit: jest.fn() };
    service = new BlastPlanService(
      mockDs as never,
      mockRhHabilitation as never,
      mockEvents as never,
    );
  });

  describe('create', () => {
    it('creates a plan in DRAFT status', async () => {
      mockDs.query.mockResolvedValueOnce([makePlanRow()]);
      const plan = await service.create({
        tenantId: TENANT,
        siteId: 'site-q1',
        operationalDayId: 'od-001',
        drillingPlanId: 'dp-001',
        plannedBy: 'planner-001',
      });
      expect(plan.status).toBe('DRAFT');
    });
  });

  describe('approveHse — DRAFT → HSE_APPROVED', () => {
    it('transitions successfully', async () => {
      mockDs.query
        .mockResolvedValueOnce([makePlanRow()]) // findById
        .mockResolvedValueOnce([makePlanRow({ status: 'HSE_APPROVED', hse_approved_by: HSE_OFFICER })]); // update
      const plan = await service.approveHse(PLAN_ID, HSE_OFFICER, TENANT);
      expect(plan.status).toBe('HSE_APPROVED');
    });

    it('throws when not in DRAFT', async () => {
      mockDs.query.mockResolvedValueOnce([makePlanRow({ status: 'LOADED' })]);
      await expect(service.approveHse(PLAN_ID, HSE_OFFICER, TENANT))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('approveLoading — HSE_APPROVED → LOADED (with habilitation gate)', () => {
    it('transitions successfully with valid habilitation', async () => {
      mockRhHabilitation.isValidAt.mockResolvedValue(true);
      mockDs.query
        .mockResolvedValueOnce([makePlanRow({ status: 'HSE_APPROVED' })])
        .mockResolvedValueOnce([makePlanRow({ status: 'LOADED', loading_operator_id: OPERATOR })]);
      const plan = await service.approveLoading(PLAN_ID, OPERATOR, OP_DAY, TENANT);
      expect(plan.status).toBe('LOADED');
      // Verify isValidAt was called with shiftStartLocal — NOT new Date()
      expect(mockRhHabilitation.isValidAt).toHaveBeenCalledWith(
        OPERATOR,
        'TIR_MINE_CI',
        SHIFT_DATE,
      );
    });

    it('throws ERR_HABILITATION_EXPIRED when TIR_MINE_CI cert is invalid', async () => {
      mockRhHabilitation.isValidAt.mockResolvedValue(false);
      mockDs.query.mockResolvedValueOnce([makePlanRow({ status: 'HSE_APPROVED' })]);
      await expect(service.approveLoading(PLAN_ID, OPERATOR, OP_DAY, TENANT))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws when plan is not HSE_APPROVED', async () => {
      mockDs.query.mockResolvedValueOnce([makePlanRow({ status: 'DRAFT' })]);
      await expect(service.approveLoading(PLAN_ID, OPERATOR, OP_DAY, TENANT))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('requestFire — LOADED → FIRE_REQUESTED', () => {
    it('transitions and emits event with valid supervisor cert', async () => {
      mockRhHabilitation.isValidAt.mockResolvedValue(true);
      mockDs.query
        .mockResolvedValueOnce([makePlanRow({ status: 'LOADED' })])
        .mockResolvedValueOnce([makePlanRow({ status: 'FIRE_REQUESTED', fire_requested_at_utc: new Date().toISOString() })]);
      const plan = await service.requestFire(PLAN_ID, SUPERVISOR, OP_DAY, TENANT);
      expect(plan.status).toBe('FIRE_REQUESTED');
      expect(mockEvents.emit).toHaveBeenCalledWith('tir.blast_plan.fire_requested', expect.objectContaining({
        planId: PLAN_ID,
      }));
    });

    it('throws ERR_HABILITATION_EXPIRED when TIR_SUPERVISOR_CI cert is invalid', async () => {
      mockRhHabilitation.isValidAt.mockResolvedValue(false);
      mockDs.query.mockResolvedValueOnce([makePlanRow({ status: 'LOADED' })]);
      await expect(service.requestFire(PLAN_ID, SUPERVISOR, OP_DAY, TENANT))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('transitionToFired — FIRE_REQUESTED|CLEARED → FIRED', () => {
    it('transitions from FIRE_REQUESTED', async () => {
      mockDs.query
        .mockResolvedValueOnce([makePlanRow({ status: 'FIRE_REQUESTED' })])
        .mockResolvedValueOnce([makePlanRow({ status: 'FIRED', fired_at_utc: new Date().toISOString() })]);
      const plan = await service.transitionToFired(PLAN_ID, TENANT);
      expect(plan.status).toBe('FIRED');
    });

    it('transitions from CLEARED', async () => {
      mockDs.query
        .mockResolvedValueOnce([makePlanRow({ status: 'CLEARED' })])
        .mockResolvedValueOnce([makePlanRow({ status: 'FIRED', fired_at_utc: new Date().toISOString() })]);
      const plan = await service.transitionToFired(PLAN_ID, TENANT);
      expect(plan.status).toBe('FIRED');
    });

    it('throws when already FIRED (idempotency guard)', async () => {
      mockDs.query.mockResolvedValueOnce([makePlanRow({ status: 'FIRED' })]);
      await expect(service.transitionToFired(PLAN_ID, TENANT))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when plan not found', async () => {
      mockDs.query.mockResolvedValueOnce([]);
      await expect(service.findById('non-existent', TENANT))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('isValidAt uses shiftStartLocal — Pitfall 2 guard', () => {
    it('passes shiftStartLocal to isValidAt, NOT new Date()', async () => {
      const fixedDate = new Date('2026-01-15T06:00:00Z');
      const opDay = { id: 'od-fixed', shiftStartLocal: fixedDate };
      mockRhHabilitation.isValidAt.mockResolvedValue(true);
      mockDs.query
        .mockResolvedValueOnce([makePlanRow({ status: 'HSE_APPROVED' })])
        .mockResolvedValueOnce([makePlanRow({ status: 'LOADED' })]);

      await service.approveLoading(PLAN_ID, OPERATOR, opDay, TENANT);

      const [, , passedDate] = mockRhHabilitation.isValidAt.mock.calls[0] as [string, string, Date];
      expect(passedDate).toBe(fixedDate);
      expect(passedDate.toISOString()).toBe('2026-01-15T06:00:00.000Z');
    });
  });
});
