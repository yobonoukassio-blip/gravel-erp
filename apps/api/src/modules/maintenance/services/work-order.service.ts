import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { RhHabilitationService } from '../../rh/services/rh-habilitation.service';
import { ProductionEquipment } from '../../master-data/production-equipment.entity';
import { PreventiveMaintenancePlan } from '../entities/preventive-maintenance-plan.entity';
import { WorkOrder, WorkOrderType } from '../entities/work-order.entity';
import { MtbfCalculatorService } from './mtbf-calculator.service';

interface OpenWorkOrderDto {
  tenantId: string;
  siteId: string;
  equipmentId: string;
  type: WorkOrderType;
  diagnosis?: string;
  pmPlanId?: string;
  technicianId?: string;
  /** Phase 8: populated only by the PM scheduler. Optional everywhere else. */
  preventiveContext?: {
    severity: 'warning' | 'critical';
    dueReason: 'hours' | 'km' | 'days';
    overdueBy: number;
  };
}

interface CloseWorkOrderDto {
  tenantId: string;
  workOrderId: string;
  resolution: string;
  downtimeMinutes: number;
  laborHours: number;
}

/**
 * WorkOrderService (MNT-03, ALT-01).
 *
 * open() — creates WO, transitions production_equipment.status → MAINTENANCE.
 * close() — sets WO.closed, transitions equipment → ACTIVE, refreshes MTBF/MTTR projection.
 * findOpen() — idempotency primitive for the preventive-maintenance scheduler (D-02).
 */
@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
    private readonly mtbf: MtbfCalculatorService,
    private readonly habilitation: RhHabilitationService,
  ) {}

  /**
   * Idempotency primitive for the preventive-maintenance scheduler (D-02).
   * Returns the most recently opened WO for the given (equipment, pmPlan,
   * type) tuple with status in ('open','in_progress'), or null.
   */
  async findOpen(criteria: {
    tenantId: string;
    equipmentId: string;
    type: WorkOrderType;
    pmPlanId?: string | null;
  }): Promise<WorkOrder | null> {
    const qb = this.ds
      .createQueryBuilder(WorkOrder, 'wo')
      .where('wo.tenant_id = :tenantId', { tenantId: criteria.tenantId })
      .andWhere('wo.equipment_id = :equipmentId', { equipmentId: criteria.equipmentId })
      .andWhere('wo.type = :type', { type: criteria.type })
      .andWhere(`wo.status IN ('open','in_progress')`)
      .orderBy('wo.opened_at_utc', 'DESC')
      .limit(1);

    if (criteria.pmPlanId === null || criteria.pmPlanId === undefined) {
      qb.andWhere('wo.pm_plan_id IS NULL');
    } else {
      qb.andWhere('wo.pm_plan_id = :pmPlanId', { pmPlanId: criteria.pmPlanId });
    }

    const row = await qb.getOne();
    return row ?? null;
  }

  async open(dto: OpenWorkOrderDto): Promise<WorkOrder> {
    return this.ds.transaction(async (manager) => {
      const wo = manager.create(WorkOrder, {
        tenantId: dto.tenantId,
        siteId: dto.siteId,
        equipmentId: dto.equipmentId,
        type: dto.type,
        status: 'open',
        diagnosis: dto.diagnosis ?? null,
        pmPlanId: dto.pmPlanId ?? null,
        technicianId: dto.technicianId ?? null,
        openedAtUtc: new Date(),
      });
      const saved = await manager.save(wo);

      await manager.query(
        `UPDATE production_equipment SET status = 'maintenance', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [dto.equipmentId, dto.tenantId],
      );

      this.events.emit('maintenance.work_order.opened', {
        tenantId: dto.tenantId,
        workOrderId: saved.id,
        equipmentId: dto.equipmentId,
      });

      // Phase 8 (D-17): emit preventive_opened for Alert bridge handler.
      if (dto.type === 'preventive') {
        this.events.emit('maintenance.work_order.preventive_opened', {
          tenant_id: dto.tenantId,
          site_id: dto.siteId,
          equipment_id: dto.equipmentId,
          pm_plan_id: dto.pmPlanId ?? null,
          work_order_id: saved.id,
          severity: dto.preventiveContext?.severity ?? 'warning',
          due_reason: dto.preventiveContext?.dueReason ?? null,
          overdue_by: dto.preventiveContext?.overdueBy ?? null,
        });
      }

      return saved;
    });
  }

  async close(dto: CloseWorkOrderDto): Promise<WorkOrder> {
    return this.ds.transaction(async (manager) => {
      const wo = await manager.findOne(WorkOrder, {
        where: { id: dto.workOrderId, tenantId: dto.tenantId },
      });
      if (!wo) throw new BadRequestException(`work_order ${dto.workOrderId} not found`);
      if (wo.status === 'closed') {
        throw new BadRequestException('work_order already closed');
      }

      // HSE-04 gate (audit 2026-05-17): block closure when the assigned
      // technician does not hold a valid FORMATION_HSE certification on
      // the closure date. Skip if no technician was assigned (the WO can
      // still be closed administratively by a manager — the open() path
      // logs that intent).
      if (wo.technicianId) {
        await this.habilitation.assertValidAt(
          wo.technicianId,
          'FORMATION_HSE',
          new Date(),
        );
      }

      await manager.update(
        WorkOrder,
        { id: dto.workOrderId },
        {
          status: 'closed',
          resolution: dto.resolution,
          downtimeMinutes: dto.downtimeMinutes,
          laborHours: dto.laborHours.toFixed(2),
          closedAtUtc: new Date(),
        },
      );

      await manager.query(
        `UPDATE production_equipment SET status = 'active', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [wo.equipmentId, dto.tenantId],
      );

      // Phase 8 T04 (D-04): advance linked PM plan state when closing a
      // preventive WO. Without this, the cron from T02 would re-open the
      // same plan on every hourly tick after first close because the
      // hours/km trigger condition (current >= last_executed + interval)
      // would never advance. Runs in the same transaction — rolls back
      // with the WO close if anything throws.
      if (wo.type === 'preventive' && wo.pmPlanId) {
        await this.advancePmPlanState(manager, dto.tenantId, wo);
      }

      const refreshed = await manager.findOneOrFail(WorkOrder, { where: { id: dto.workOrderId } });

      // Refresh MTBF/MTTR projection (outside main tx but immediate)
      void this.mtbf.refreshForEquipment({
        tenantId: dto.tenantId,
        equipmentId: wo.equipmentId,
      });

      this.events.emit('maintenance.work_order.closed', {
        tenantId: dto.tenantId,
        workOrderId: dto.workOrderId,
        siteId: wo.siteId,
        equipmentId: wo.equipmentId,
        laborHours: dto.laborHours.toFixed(2),
        downtimeMinutes: dto.downtimeMinutes,
        closedAtUtc: new Date().toISOString(),
      });

      return refreshed;
    });
  }

  /**
   * Phase 8 T04 (D-04): advance the linked PM plan state when a preventive
   * WO is closed. Runs inside the close() transaction.
   *
   * Per D-04: "Pour intervalType='days', persiste nextDueAtUtc =
   * lastExecutedAtUtc + intervalValue days apres chaque WorkOrder ferme.
   * Pour hours ou km, le champ reste null ; le job compare directement
   * production_equipment.current_hours/km >= lastExecutedMeter + intervalValue
   * au runtime."
   *
   * Orphan plans (deleted while a WO referenced them) are a no-op — the WO
   * close still succeeds.
   */
  private async advancePmPlanState(
    manager: EntityManager,
    tenantId: string,
    wo: WorkOrder,
  ): Promise<void> {
    const plan = await manager.findOne(PreventiveMaintenancePlan, {
      where: { id: wo.pmPlanId!, tenantId },
    });
    if (!plan) {
      this.logger.warn(
        `[WorkOrderService.close] preventive WO ${wo.id} references missing pm_plan ${wo.pmPlanId}; skipping plan-state advance.`,
      );
      return;
    }

    const equipment = await manager.findOne(ProductionEquipment, {
      where: { id: wo.equipmentId, tenantId },
    });

    const now = new Date();
    const updates: Partial<PreventiveMaintenancePlan> = {
      lastExecutedAtUtc: now,
    };

    if (plan.intervalUnit === 'days') {
      // D-04: persist next_due_at_utc = now + interval_value days.
      const next = new Date(now);
      next.setUTCDate(next.getUTCDate() + plan.intervalValue);
      updates.nextDueAtUtc = next;
      updates.lastExecutedMeter = null; // days-based plan does not snapshot meter
    } else if (plan.intervalUnit === 'hours') {
      updates.lastExecutedMeter =
        equipment?.hourMeterCurrent ?? plan.lastExecutedMeter;
      updates.nextDueAtUtc = null;
    } else {
      // 'km'
      updates.lastExecutedMeter =
        equipment?.odometerKmCurrent ?? plan.lastExecutedMeter;
      updates.nextDueAtUtc = null;
    }

    await manager.update(
      PreventiveMaintenancePlan,
      { id: plan.id, tenantId },
      updates,
    );
  }
}
