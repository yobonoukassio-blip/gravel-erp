import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { DrilledHole } from '../entities/drilled-hole.entity';
import { DrilledHoleService } from '../services/drilled-hole.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string };
}

interface AppendDto {
  site_id: string;
  plan_id: string;
  hole_index_in_plan: number;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_accuracy_m?: number | null;
  actual_depth_m: number;
  actual_diameter_mm: number;
  inclination_deg?: number | null;
  started_at_local: string;
  ended_at_local: string;
  iana_timezone: string;
  operational_day_id: string;
  operator_id: string;
  machine_id: string;
  fuel_liters_consumed?: number | null;
  notes_text?: string | null;
  photo_blob_sha256?: string | null;
  tolerance_violation_reason?: string | null;
  corrects_hole_id?: string | null;
}

/**
 * DrilledHole controller — APPEND-ONLY surface.
 *
 * D2-11 contract:
 *   POST /drilled-holes        → append a new hole (or correction)
 *   GET  /drilled-holes        → list
 *   GET  /drilled-holes/:id    → fetch one
 *   PATCH/PUT/DELETE /...      → 405 Method Not Allowed (no mutation)
 */
@Controller('drilled-holes')
export class DrilledHoleController {
  constructor(private readonly service: DrilledHoleService) {}

  @Post()
  async append(
    @Body() dto: AppendDto,
    @Req() req: AuthedRequest,
  ): Promise<DrilledHole> {
    return this.service.append({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      planId: dto.plan_id,
      holeIndexInPlan: dto.hole_index_in_plan,
      gpsLatitude: dto.gps_latitude ?? null,
      gpsLongitude: dto.gps_longitude ?? null,
      gpsAccuracyM: dto.gps_accuracy_m ?? null,
      actualDepthM: dto.actual_depth_m,
      actualDiameterMm: dto.actual_diameter_mm,
      inclinationDeg: dto.inclination_deg ?? null,
      startedAtLocal: new Date(dto.started_at_local),
      endedAtLocal: new Date(dto.ended_at_local),
      ianaTimezone: dto.iana_timezone,
      operationalDayId: dto.operational_day_id,
      operatorId: dto.operator_id,
      machineId: dto.machine_id,
      fuelLitersConsumed: dto.fuel_liters_consumed ?? null,
      notesText: dto.notes_text ?? null,
      photoBlobSha256: dto.photo_blob_sha256 ?? null,
      toleranceViolationReason: dto.tolerance_violation_reason ?? null,
      correctsHoleId: dto.corrects_hole_id ?? null,
      createdBy: req.user.userId,
    });
  }

  @Get()
  async findAll(
    @Query('plan_id') planId: string,
    @Req() req: AuthedRequest,
  ): Promise<DrilledHole[]> {
    return this.service.findByPlan(planId, req.user.tenantId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<DrilledHole> {
    return this.service.findById(id, req.user.tenantId);
  }

  /**
   * D2-11 append-only enforcement. Any PATCH/PUT/DELETE → 405.
   * Catches /drilled-holes and /drilled-holes/:id alike.
   */
  @All(':id')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectMutation(): never {
    throw new HttpException(
      {
        code: 'METHOD_NOT_ALLOWED',
        message:
          'drilled_hole is append-only. Submit a new hole with corrects_hole_id to correct.',
      },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }
}
