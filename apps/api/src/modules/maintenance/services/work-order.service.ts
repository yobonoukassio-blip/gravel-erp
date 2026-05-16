import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
}
