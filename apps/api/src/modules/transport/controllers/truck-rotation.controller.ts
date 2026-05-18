import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { TruckRotation } from '../entities/truck-rotation.entity';
import { TruckRotationService } from '../services/truck-rotation.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string };
}

interface CreateRotationDto {
  site_id: string;
  operational_day_id: string;
  truck_equipment_id?: string | null;
  driver_id?: string | null;
  loaded_at_bench_id: string;
  unloaded_at_zone_id: string;
  material_type: 'granite_brut' | 'tout_venant' | 'sterile';
  weighing_ticket_id: string;
  loaded_at_utc: string;
}

interface AssignTruckDto {
  truck_equipment_id: string;
}

interface CompleteRotationDto {
  unloaded_at_utc: string;
}

/**
 * TruckRotation controller (TRP-01, TRP-03).
 */
@Controller('rotations')
export class TruckRotationController {
  constructor(private readonly service: TruckRotationService) {}

  @Post()
  async create(
    @Body() dto: CreateRotationDto,
    @Req() req: AuthedRequest,
  ): Promise<TruckRotation> {
    return this.service.create({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      operationalDayId: dto.operational_day_id,
      truckEquipmentId: dto.truck_equipment_id ?? null,
      driverId: dto.driver_id ?? null,
      loadedAtBenchId: dto.loaded_at_bench_id,
      unloadedAtZoneId: dto.unloaded_at_zone_id,
      materialType: dto.material_type,
      weighingTicketId: dto.weighing_ticket_id,
      loadedAtUtc: new Date(dto.loaded_at_utc),
      createdBy: req.user.userId,
    });
  }

  /** TRP-03: Chef Carrière manually assigns truck to a pending rotation. */
  @Post(':id/assign')
  async assignTruck(
    @Param('id') id: string,
    @Body() dto: AssignTruckDto,
    @Req() req: AuthedRequest,
  ): Promise<TruckRotation> {
    return this.service.assignTruck(
      id,
      req.user.tenantId,
      dto.truck_equipment_id,
    );
  }

  /** D2-35: complete (publishes rotation_completed outbox event). */
  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Body() dto: CompleteRotationDto,
    @Req() req: AuthedRequest,
  ): Promise<TruckRotation> {
    return this.service.complete(
      id,
      req.user.tenantId,
      new Date(dto.unloaded_at_utc),
    );
  }

  @Get('pending-dispatch')
  async pendingDispatch(@Req() req: AuthedRequest): Promise<TruckRotation[]> {
    return this.service.listPendingDispatch(req.user.tenantId);
  }

  @Get()
  async list(
    @Query('operational_day_id') operationalDayId: string | undefined,
    @Req() req: AuthedRequest,
  ): Promise<TruckRotation[]> {
    // Optional filter: without operational_day_id we return the most recent
    // rotations for the tenant. The dispatch board calls this without args
    // on first paint to populate the grid.
    if (!operationalDayId) {
      return this.service.listRecent(req.user.tenantId);
    }
    return this.service.listForOperationalDay(
      operationalDayId,
      req.user.tenantId,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<TruckRotation> {
    return this.service.findById(id, req.user.tenantId);
  }
}
