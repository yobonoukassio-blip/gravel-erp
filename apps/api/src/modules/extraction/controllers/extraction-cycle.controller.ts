import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ExtractionCycle } from '../entities/extraction-cycle.entity';
import {
  CreateExtractionCycleInput,
  ExtractionCycleService,
} from '../services/extraction-cycle.service';
import {
  ExtractionYieldService,
  YieldRow,
} from '../services/extraction-yield.service';
import {
  DowntimeReasonCode,
  MaterialType,
} from '../entities/extraction-cycle.entity';

interface AuthedRequest {
  user: { sub: string; tenantId: string };
}

interface CreateCycleDto {
  site_id: string;
  operational_day_id: string;
  bench_id: string;
  equipment_id: string;
  operator_id: string;
  material_type: MaterialType;
  estimated_tonnage_t: number;
  cycle_started_at_local: string;
  cycle_ended_at_local: string;
  iana_timezone: string;
  downtime_minutes?: number | null;
  downtime_reason_code?: DowntimeReasonCode | null;
  notes?: string | null;
  corrects_id?: string | null;
}

@Controller('extraction/cycles')
export class ExtractionCycleController {
  constructor(
    private readonly svc: ExtractionCycleService,
    private readonly yieldSvc: ExtractionYieldService,
  ) {}

  @Post()
  async create(
    @Req() req: AuthedRequest,
    @Body() body: CreateCycleDto,
  ): Promise<ExtractionCycle> {
    const input: CreateExtractionCycleInput = {
      tenantId: req.user.tenantId,
      siteId: body.site_id,
      operationalDayId: body.operational_day_id,
      benchId: body.bench_id,
      equipmentId: body.equipment_id,
      operatorId: body.operator_id,
      materialType: body.material_type,
      estimatedTonnageT: body.estimated_tonnage_t,
      cycleStartedAtLocal: new Date(body.cycle_started_at_local),
      cycleEndedAtLocal: new Date(body.cycle_ended_at_local),
      ianaTimezone: body.iana_timezone,
      downtimeMinutes: body.downtime_minutes ?? null,
      downtimeReasonCode: body.downtime_reason_code ?? null,
      notes: body.notes ?? null,
      correctsId: body.corrects_id ?? null,
      createdBy: req.user.sub,
    };
    return this.svc.create(input);
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('operational_day_id') operationalDayId?: string,
    @Query('equipment_id') equipmentId?: string,
    @Query('operator_id') operatorId?: string,
  ): Promise<ExtractionCycle[]> {
    return this.svc.list({
      tenantId: req.user.tenantId,
      operationalDayId,
      equipmentId,
      operatorId,
    });
  }

  @Get('yield')
  async yield(
    @Req() req: AuthedRequest,
    @Query('operational_day_id') operationalDayId: string,
  ): Promise<YieldRow[]> {
    return this.yieldSvc.computeYield(req.user.tenantId, operationalDayId);
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<ExtractionCycle> {
    return this.svc.findById(id, req.user.tenantId);
  }

  // Append-only: reject PATCH / PUT / DELETE explicitly (D2-20).
  @Patch(':id')
  patchReject(): never {
    return this.svc.rejectMutation();
  }

  @Put(':id')
  putReject(): never {
    return this.svc.rejectMutation();
  }

  @Delete(':id')
  deleteReject(): never {
    return this.svc.rejectMutation();
  }
}
