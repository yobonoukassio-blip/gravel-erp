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
}

interface CloseWorkOrderDto {
  tenantId: string;
  workOrderId: string;
  resolution: string;
  downtimeMinutes: number;
  laborHours: number;
}

/**
 * WorkOrderService (MNT-03).
 *
 * open() — creates WO, transitions production_equipment.status → MAINTENANCE.
 * close() — sets WO.closed, transitions equipment → ACTIVE, refreshes MTBF/MTTR projection.
 */
@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
    private readonly mtbf: MtbfCalculatorService,
  ) {}

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
