import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { WorkOrderService } from '../../../src/modules/maintenance/services/work-order.service';
import { MtbfCalculatorService } from '../../../src/modules/maintenance/services/mtbf-calculator.service';
import { WorkOrder } from '../../../src/modules/maintenance/entities/work-order.entity';
import { PreventiveMaintenancePlan } from '../../../src/modules/maintenance/entities/preventive-maintenance-plan.entity';
import { ProductionEquipment } from '../../../src/modules/master-data/production-equipment.entity';

/**
 * WorkOrderService unit tests for Phase 8 W2-P01 (T01, T04).
 *
 * T01 — findOpen() idempotency primitive + preventive_opened event emission.
 * T04 — close() advances linked PM plan state (D-04) atomically.
 */
describe('WorkOrderService — Phase 8 W2-P01', () => {
  let service: WorkOrderService;
  let mockGetOne: jest.Mock;
  let mockCreateQueryBuilder: jest.Mock;
  let mockEmit: jest.Mock;
  let mockTransaction: jest.Mock;
  let mockManager: {
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
  };
  let qbChain: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(async () => {
    mockGetOne = jest.fn();
    qbChain = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: mockGetOne,
    };
    mockCreateQueryBuilder = jest.fn().mockReturnValue(qbChain);
    mockEmit = jest.fn();

    mockManager = {
      create: jest.fn((_entity, payload) => ({ ...payload })),
      save: jest.fn(async (entity) => ({ ...entity, id: 'wo-new' })),
      query: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
    };

    mockTransaction = jest.fn(async (cb: (m: unknown) => unknown) => cb(mockManager));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrderService,
        {
          provide: DataSource,
          useValue: {
            createQueryBuilder: mockCreateQueryBuilder,
            transaction: mockTransaction,
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: mockEmit },
        },
        {
          provide: MtbfCalculatorService,
          useValue: { refreshForEquipment: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(WorkOrderService);
  });

  // ============================================================
  // T01 — findOpen() idempotency primitive
  // ============================================================

  describe('findOpen()', () => {
    it('Test 1: returns the most recently opened WO matching (tenant, equipment, type, pmPlan)', async () => {
      const existingWo = {
        id: 'wo-1',
        tenantId: 'tenant-1',
        equipmentId: 'eq-1',
        type: 'preventive',
        status: 'open',
        pmPlanId: 'pmp-1',
        openedAtUtc: new Date('2026-05-16T10:00:00Z'),
      };
      mockGetOne.mockResolvedValueOnce(existingWo);

      const result = await service.findOpen({
        tenantId: 'tenant-1',
        equipmentId: 'eq-1',
        type: 'preventive',
        pmPlanId: 'pmp-1',
      });

      expect(result).toBe(existingWo);
      expect(mockCreateQueryBuilder).toHaveBeenCalledWith(WorkOrder, 'wo');
      expect(qbChain.where).toHaveBeenCalledWith('wo.tenant_id = :tenantId', { tenantId: 'tenant-1' });
      expect(qbChain.andWhere).toHaveBeenCalledWith('wo.equipment_id = :equipmentId', { equipmentId: 'eq-1' });
      expect(qbChain.andWhere).toHaveBeenCalledWith('wo.type = :type', { type: 'preventive' });
      expect(qbChain.andWhere).toHaveBeenCalledWith(`wo.status IN ('open','in_progress')`);
      expect(qbChain.andWhere).toHaveBeenCalledWith('wo.pm_plan_id = :pmPlanId', { pmPlanId: 'pmp-1' });
      expect(qbChain.orderBy).toHaveBeenCalledWith('wo.opened_at_utc', 'DESC');
      expect(qbChain.limit).toHaveBeenCalledWith(1);
    });

    it('Test 2: returns null when matching WO is closed/cancelled (filter excludes them)', async () => {
      // The status filter wo.status IN ('open','in_progress') means closed/cancelled rows
      // are not returned by the query — getOne returns null.
      mockGetOne.mockResolvedValueOnce(null);

      const result = await service.findOpen({
        tenantId: 'tenant-1',
        equipmentId: 'eq-1',
        type: 'preventive',
        pmPlanId: 'pmp-1',
      });

      expect(result).toBeNull();
    });

    it('Test 3: returns null when no WO exists for the equipment+pmPlan tuple', async () => {
      mockGetOne.mockResolvedValueOnce(null);

      const result = await service.findOpen({
        tenantId: 'tenant-1',
        equipmentId: 'eq-1',
        type: 'preventive',
        pmPlanId: 'pmp-orphan',
      });

      expect(result).toBeNull();
    });

    it('Test 4: tenantId is included in the WHERE clause (RLS-safe filter)', async () => {
      mockGetOne.mockResolvedValueOnce(null);

      await service.findOpen({
        tenantId: 'tenant-A',
        equipmentId: 'eq-shared',
        type: 'preventive',
        pmPlanId: 'pmp-1',
      });

      expect(qbChain.where).toHaveBeenCalledWith('wo.tenant_id = :tenantId', { tenantId: 'tenant-A' });
    });

    it('Test 5: returns the most recently opened WO (ORDER BY opened_at_utc DESC LIMIT 1)', async () => {
      const newerWo = {
        id: 'wo-newer',
        openedAtUtc: new Date('2026-05-16T15:00:00Z'),
      };
      mockGetOne.mockResolvedValueOnce(newerWo);

      const result = await service.findOpen({
        tenantId: 'tenant-1',
        equipmentId: 'eq-1',
        type: 'preventive',
        pmPlanId: 'pmp-1',
      });

      expect(result).toBe(newerWo);
      expect(qbChain.orderBy).toHaveBeenCalledWith('wo.opened_at_utc', 'DESC');
      expect(qbChain.limit).toHaveBeenCalledWith(1);
    });

    it('Test 6: when pmPlanId omitted, uses IS NULL guard', async () => {
      mockGetOne.mockResolvedValueOnce(null);

      await service.findOpen({
        tenantId: 'tenant-1',
        equipmentId: 'eq-1',
        type: 'corrective',
      });

      expect(qbChain.andWhere).toHaveBeenCalledWith('wo.pm_plan_id IS NULL');
    });
  });

  // ============================================================
  // T01 — open() emits preventive_opened with D-17 payload
  // ============================================================

  describe('open() preventive_opened emission (D-17)', () => {
    it('Test 7: emits maintenance.work_order.preventive_opened when type=preventive', async () => {
      mockManager.save.mockResolvedValueOnce({
        id: 'wo-new-1',
        tenantId: 't-1',
        siteId: 's-1',
        equipmentId: 'eq-1',
      });

      await service.open({
        tenantId: 't-1',
        siteId: 's-1',
        equipmentId: 'eq-1',
        type: 'preventive',
        pmPlanId: 'pmp-1',
        preventiveContext: {
          severity: 'warning',
          dueReason: 'hours',
          overdueBy: 25,
        },
      });

      const preventiveCall = mockEmit.mock.calls.find(
        (c) => c[0] === 'maintenance.work_order.preventive_opened',
      );
      expect(preventiveCall).toBeDefined();
      const payload = preventiveCall![1];
      expect(payload).toMatchObject({
        tenant_id: 't-1',
        site_id: 's-1',
        equipment_id: 'eq-1',
        pm_plan_id: 'pmp-1',
        work_order_id: 'wo-new-1',
        severity: 'warning',
        due_reason: 'hours',
        overdue_by: 25,
      });
    });

    it('Test 8: does NOT emit preventive_opened for corrective WOs', async () => {
      mockManager.save.mockResolvedValueOnce({ id: 'wo-c-1' });

      await service.open({
        tenantId: 't-1',
        siteId: 's-1',
        equipmentId: 'eq-1',
        type: 'corrective',
      });

      const preventiveCall = mockEmit.mock.calls.find(
        (c) => c[0] === 'maintenance.work_order.preventive_opened',
      );
      expect(preventiveCall).toBeUndefined();
    });

    it('Test 9: emits critical severity from preventiveContext when provided', async () => {
      mockManager.save.mockResolvedValueOnce({ id: 'wo-crit' });

      await service.open({
        tenantId: 't-1',
        siteId: 's-1',
        equipmentId: 'eq-1',
        type: 'preventive',
        pmPlanId: 'pmp-1',
        preventiveContext: {
          severity: 'critical',
          dueReason: 'days',
          overdueBy: 200,
        },
      });

      const preventiveCall = mockEmit.mock.calls.find(
        (c) => c[0] === 'maintenance.work_order.preventive_opened',
      );
      expect(preventiveCall![1]).toMatchObject({
        severity: 'critical',
        due_reason: 'days',
        overdue_by: 200,
      });
    });

    it('Test 10: defaults severity=warning when no preventiveContext provided', async () => {
      mockManager.save.mockResolvedValueOnce({ id: 'wo-defaults' });

      await service.open({
        tenantId: 't-1',
        siteId: 's-1',
        equipmentId: 'eq-1',
        type: 'preventive',
      });

      const preventiveCall = mockEmit.mock.calls.find(
        (c) => c[0] === 'maintenance.work_order.preventive_opened',
      );
      expect(preventiveCall![1].severity).toBe('warning');
      expect(preventiveCall![1].due_reason).toBeNull();
      expect(preventiveCall![1].overdue_by).toBeNull();
    });
  });

  // ============================================================
  // T04 — close() advances PM plan state (D-04)
  // ============================================================

  describe('close() — PM plan state advancement (D-04)', () => {
    const baseCloseDto = {
      tenantId: 't-1',
      workOrderId: 'wo-close-1',
      resolution: 'done',
      downtimeMinutes: 60,
      laborHours: 2,
    };

    function wireFindOne(workOrder: unknown, plan: unknown | null, equipment: unknown | null = null) {
      mockManager.findOne.mockImplementation((entity: unknown) => {
        if (entity === WorkOrder) return Promise.resolve(workOrder);
        if (entity === PreventiveMaintenancePlan) return Promise.resolve(plan);
        if (entity === ProductionEquipment) return Promise.resolve(equipment);
        return Promise.resolve(null);
      });
      mockManager.findOneOrFail.mockResolvedValue({ ...workOrder, status: 'closed' });
    }

    it('Test 11: days-based plan sets next_due_at_utc = now + interval_value days and last_executed_meter = null', async () => {
      const wo = {
        id: 'wo-close-1',
        tenantId: 't-1',
        equipmentId: 'eq-1',
        siteId: 's-1',
        type: 'preventive',
        status: 'open',
        pmPlanId: 'pmp-days',
      };
      const plan = {
        id: 'pmp-days',
        tenantId: 't-1',
        intervalUnit: 'days',
        intervalValue: 30,
      };
      wireFindOne(wo, plan);

      await service.close(baseCloseDto);

      // Expect a PreventiveMaintenancePlan UPDATE with nextDueAtUtc ~ now+30d and lastExecutedMeter null
      const planUpdateCall = mockManager.update.mock.calls.find(
        (c) => c[0] === PreventiveMaintenancePlan,
      );
      expect(planUpdateCall).toBeDefined();
      const updates = planUpdateCall![2];
      expect(updates.lastExecutedMeter).toBeNull();
      expect(updates.lastExecutedAtUtc).toBeInstanceOf(Date);
      expect(updates.nextDueAtUtc).toBeInstanceOf(Date);

      const now = new Date();
      const expected = new Date(now);
      expected.setUTCDate(expected.getUTCDate() + 30);
      const diffMs = Math.abs(updates.nextDueAtUtc.getTime() - expected.getTime());
      expect(diffMs).toBeLessThan(5000);
    });

    it('Test 12: hours-based plan snapshots equipment.hourMeterCurrent as last_executed_meter, leaves next_due_at_utc null', async () => {
      const wo = {
        id: 'wo-close-1',
        tenantId: 't-1',
        equipmentId: 'eq-1',
        siteId: 's-1',
        type: 'preventive',
        status: 'open',
        pmPlanId: 'pmp-hours',
      };
      const plan = {
        id: 'pmp-hours',
        tenantId: 't-1',
        intervalUnit: 'hours',
        intervalValue: 250,
        lastExecutedMeter: '1000',
      };
      const equipment = {
        id: 'eq-1',
        tenantId: 't-1',
        hourMeterCurrent: '1500.00',
      };
      wireFindOne(wo, plan, equipment);

      await service.close(baseCloseDto);

      const planUpdateCall = mockManager.update.mock.calls.find(
        (c) => c[0] === PreventiveMaintenancePlan,
      );
      expect(planUpdateCall).toBeDefined();
      const updates = planUpdateCall![2];
      expect(updates.lastExecutedMeter).toBe('1500.00');
      expect(updates.nextDueAtUtc).toBeNull();
      expect(updates.lastExecutedAtUtc).toBeInstanceOf(Date);
    });

    it('Test 13: km-based plan snapshots equipment.odometerKmCurrent as last_executed_meter', async () => {
      const wo = {
        id: 'wo-close-1',
        tenantId: 't-1',
        equipmentId: 'eq-1',
        siteId: 's-1',
        type: 'preventive',
        status: 'open',
        pmPlanId: 'pmp-km',
      };
      const plan = {
        id: 'pmp-km',
        tenantId: 't-1',
        intervalUnit: 'km',
        intervalValue: 10000,
        lastExecutedMeter: '50000',
      };
      const equipment = {
        id: 'eq-1',
        tenantId: 't-1',
        odometerKmCurrent: '61500.00',
      };
      wireFindOne(wo, plan, equipment);

      await service.close(baseCloseDto);

      const planUpdateCall = mockManager.update.mock.calls.find(
        (c) => c[0] === PreventiveMaintenancePlan,
      );
      expect(planUpdateCall).toBeDefined();
      const updates = planUpdateCall![2];
      expect(updates.lastExecutedMeter).toBe('61500.00');
      expect(updates.nextDueAtUtc).toBeNull();
    });

    it('Test 14: corrective WO does NOT touch preventive_maintenance_plan', async () => {
      const wo = {
        id: 'wo-close-1',
        tenantId: 't-1',
        equipmentId: 'eq-1',
        siteId: 's-1',
        type: 'corrective',
        status: 'open',
        pmPlanId: null,
      };
      wireFindOne(wo, null);

      await service.close(baseCloseDto);

      const planUpdateCall = mockManager.update.mock.calls.find(
        (c) => c[0] === PreventiveMaintenancePlan,
      );
      expect(planUpdateCall).toBeUndefined();
    });

    it('Test 15: orphan PM plan (deleted) — close succeeds without throwing, no plan UPDATE issued', async () => {
      const wo = {
        id: 'wo-close-1',
        tenantId: 't-1',
        equipmentId: 'eq-1',
        siteId: 's-1',
        type: 'preventive',
        status: 'open',
        pmPlanId: 'pmp-deleted',
      };
      // plan = null → orphan
      wireFindOne(wo, null);

      await expect(service.close(baseCloseDto)).resolves.toBeDefined();

      const planUpdateCall = mockManager.update.mock.calls.find(
        (c) => c[0] === PreventiveMaintenancePlan,
      );
      expect(planUpdateCall).toBeUndefined();
    });

    it('Test 16: plan UPDATE runs inside the same transaction as WO close (same manager)', async () => {
      const wo = {
        id: 'wo-close-1',
        tenantId: 't-1',
        equipmentId: 'eq-1',
        siteId: 's-1',
        type: 'preventive',
        status: 'open',
        pmPlanId: 'pmp-days',
      };
      const plan = {
        id: 'pmp-days',
        tenantId: 't-1',
        intervalUnit: 'days',
        intervalValue: 30,
      };
      wireFindOne(wo, plan);

      await service.close(baseCloseDto);

      // Verify the plan UPDATE was issued via the same manager passed into the
      // ds.transaction callback — same .update spy.
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      const planUpdateCall = mockManager.update.mock.calls.find(
        (c) => c[0] === PreventiveMaintenancePlan,
      );
      const woUpdateCall = mockManager.update.mock.calls.find(
        (c) => c[0] === WorkOrder,
      );
      expect(planUpdateCall).toBeDefined();
      expect(woUpdateCall).toBeDefined();
    });
  });
});
