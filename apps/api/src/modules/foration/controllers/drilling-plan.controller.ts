import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { DrillingPlan } from '../entities/drilling-plan.entity';
import { DrillingPlanService } from '../services/drilling-plan.service';

interface AuthedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

interface CreateDto {
  site_id: string;
  zone_id: string;
  bench_id: string;
  planned_hole_count: number;
  target_depth_m: number;
  diameter_mm: number;
  assigned_operator_id?: string | null;
  assigned_machine_id?: string | null;
  valid_from: string;
  valid_to?: string | null;
}

interface UpdateDto {
  planned_hole_count?: number;
  target_depth_m?: number;
  diameter_mm?: number;
  assigned_operator_id?: string | null;
  assigned_machine_id?: string | null;
  valid_from?: string;
  valid_to?: string | null;
}

@Controller('drilling-plans')
export class DrillingPlanController {
  constructor(private readonly service: DrillingPlanService) {}

  @Post()
  async create(@Body() dto: CreateDto, @Req() req: AuthedRequest): Promise<DrillingPlan> {
    return this.service.create({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      zoneId: dto.zone_id,
      benchId: dto.bench_id,
      plannedHoleCount: dto.planned_hole_count,
      targetDepthM: dto.target_depth_m,
      diameterMm: dto.diameter_mm,
      assignedOperatorId: dto.assigned_operator_id ?? null,
      assignedMachineId: dto.assigned_machine_id ?? null,
      validFrom: new Date(dto.valid_from),
      validTo: dto.valid_to ? new Date(dto.valid_to) : null,
      createdBy: req.user.userId,
    });
  }

  @Get()
  async findAll(
    @Query('site_id') siteId: string | undefined,
    @Req() req: AuthedRequest,
  ): Promise<DrillingPlan[]> {
    return this.service.findAll(req.user.tenantId, siteId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<DrillingPlan> {
    return this.service.findById(id, req.user.tenantId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDto,
    @Req() req: AuthedRequest,
  ): Promise<DrillingPlan> {
    return this.service.update(id, req.user.tenantId, {
      plannedHoleCount: dto.planned_hole_count,
      targetDepthM: dto.target_depth_m,
      diameterMm: dto.diameter_mm,
      assignedOperatorId: dto.assigned_operator_id,
      assignedMachineId: dto.assigned_machine_id,
      validFrom: dto.valid_from ? new Date(dto.valid_from) : undefined,
      validTo:
        dto.valid_to === undefined ? undefined : dto.valid_to === null ? null : new Date(dto.valid_to),
    });
  }

  @Post(':id/activate')
  async activate(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<DrillingPlan> {
    return this.service.activate(id, req.user.tenantId, req.user.userId);
  }

  @Post(':id/close')
  async close(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<DrillingPlan> {
    const isManager = req.user.role === 'SITE_MANAGER';
    return this.service.closePlan(id, req.user.tenantId, req.user.userId, isManager);
  }

  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<DrillingPlan> {
    return this.service.archive(id, req.user.tenantId);
  }
}
