import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from '../entities/work-order.entity';
import { SparePart } from '../entities/spare-part.entity';
import { WorkOrderService } from '../services/work-order.service';
import { SparePartService } from '../services/spare-part.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string };
}

/** Maintenance REST endpoints (Phase 3 MNT-03 MNT-04). */
@Controller('maintenance')
export class MaintenanceController {
  constructor(
    @InjectRepository(WorkOrder) private readonly woRepo: Repository<WorkOrder>,
    @InjectRepository(SparePart) private readonly spRepo: Repository<SparePart>,
    private readonly woService: WorkOrderService,
    private readonly spService: SparePartService,
  ) {}

  @Get('work-orders')
  listWorkOrders(
    @Query('siteId') siteId: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const qb = this.woRepo
      .createQueryBuilder('wo')
      .where('wo.tenant_id = :tenantId', { tenantId: req.user.tenantId })
      .orderBy('wo.opened_at_utc', 'DESC')
      .limit(200);
    if (siteId) qb.andWhere('wo.site_id = :siteId', { siteId });
    if (status) qb.andWhere('wo.status = :status', { status });
    return qb.getMany();
  }

  @Post('work-orders')
  openWorkOrder(
    @Body()
    body: {
      siteId: string;
      equipmentId: string;
      type: 'corrective' | 'preventive';
      diagnosis?: string;
      pmPlanId?: string;
      technicianId?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.woService.open({ ...body, tenantId: req.user.tenantId });
  }

  @Patch('work-orders/:id/close')
  closeWorkOrder(
    @Param('id') workOrderId: string,
    @Body() body: { resolution: string; downtimeMinutes: number; laborHours: number },
    @Req() req: AuthedRequest,
  ) {
    return this.woService.close({ ...body, workOrderId, tenantId: req.user.tenantId });
  }

  @Get('spare-parts')
  listSpareParts(
    @Query('siteId') siteId: string | undefined,
    @Query('belowThreshold') belowThreshold: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const qb = this.spRepo
      .createQueryBuilder('sp')
      .where('sp.tenant_id = :tenantId', { tenantId: req.user.tenantId })
      .orderBy('sp.sku', 'ASC');
    if (siteId) qb.andWhere('sp.site_id = :siteId', { siteId });
    if (belowThreshold === 'true') qb.andWhere('sp.below_threshold = true');
    return qb.getMany();
  }

  @Post('spare-parts/:id/consume')
  consumeSparePart(
    @Param('id') sparePartId: string,
    @Body() body: { workOrderId: string; quantity: number },
    @Req() req: AuthedRequest,
  ) {
    return this.spService.consume({ ...body, sparePartId, tenantId: req.user.tenantId });
  }
}
