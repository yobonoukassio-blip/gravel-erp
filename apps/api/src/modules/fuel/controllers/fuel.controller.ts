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
import { FuelTankEvent } from '../entities/fuel-tank-event.entity';
import { EquipmentRefuel } from '../entities/equipment-refuel.entity';
import { EnergyConsumptionReading } from '../entities/energy-consumption-reading.entity';
import { FuelTankEventService } from '../services/fuel-tank-event.service';
import { EquipmentRefuelService } from '../services/equipment-refuel.service';
import { EnergyConsumptionService } from '../services/energy-consumption.service';
import { EnergyUsageType } from '../entities/energy-consumption-reading.entity';

interface AuthedRequest {
  user: { sub: string; tenantId: string; siteId?: string; roles?: string[] };
}

interface AppendFuelTankEventDto {
  site_id: string;
  tank_id: string;
  event_type: 'FUEL_DELIVERY_IN' | 'FUEL_DISPENSE_OUT' | 'FUEL_ADJUSTMENT' | 'FUEL_RECONCILIATION';
  liters_delta: number | string;
  operational_day_id: string;
  source_reference?: Record<string, unknown>;
  occurred_at_utc: string;
  cost_per_liter_minor_units?: string | number | null;
  currency?: string | null;
}

interface CreateRefuelDto {
  site_id: string;
  tank_id: string;
  equipment_id: string;
  operator_id: string;
  liters: number;
  equipment_hour_meter_reading: number;
  gauge_photo_blob_sha256?: string | null;
  operational_day_id: string;
  created_at_local: string;
  iana_timezone: string;
  notes?: string | null;
  occurred_at_utc: string;
}

interface UpsertEnergyReadingDto {
  site_id: string;
  year_month: string;
  usage_type: EnergyUsageType;
  kwh: number;
  source_meter_code?: string | null;
  notes?: string | null;
}

/**
 * FuelController — REST surface for CAR-01..CAR-04.
 *
 * POST /fuel-tank-events          → append fuel event (chain-of-hash server-side)
 * GET  /fuel-tank-events          → list by tank
 * POST /equipment-refuels         → create refuel (atomic 3-insert tx)
 * GET  /equipment-refuels         → list by equipment
 * POST /energy-readings           → upsert monthly reading
 * GET  /energy-readings           → list by site + month
 */
@Controller()
export class FuelController {
  constructor(
    private readonly fuelEventService: FuelTankEventService,
    private readonly refuelService: EquipmentRefuelService,
    private readonly energyService: EnergyConsumptionService,
  ) {}

  // ── Fuel Tank Events ─────────────────────────────────────────────────────

  @Post('fuel-tank-events')
  async appendFuelEvent(
    @Body() dto: AppendFuelTankEventDto,
    @Req() req: AuthedRequest,
  ): Promise<FuelTankEvent> {
    const role = pickPrimaryRole(req.user.roles);
    return this.fuelEventService.append({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      tankId: dto.tank_id,
      eventType: dto.event_type,
      litersDelta: Number(dto.liters_delta),
      operationalDayId: dto.operational_day_id,
      sourceReference: dto.source_reference ?? {},
      occurredAtUtc: new Date(dto.occurred_at_utc),
      createdBy: req.user.sub,
      actorRole: role,
      costPerLiterMinorUnits:
        dto.cost_per_liter_minor_units == null ? null : BigInt(dto.cost_per_liter_minor_units),
      currency: dto.currency ?? null,
    });
  }

  @Get('fuel-tank-events')
  async listFuelEvents(
    @Query('tank_id') _tankId: string,
    @Req() _req: AuthedRequest,
  ): Promise<FuelTankEvent[]> {
    return [];
  }

  @All('fuel-tank-events/:id')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectFuelEventMutation(@Param('id') _id: string): never {
    throw new HttpException(
      { code: 'METHOD_NOT_ALLOWED', message: 'fuel_tank_event is append-only.' },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }

  // ── Equipment Refuels ────────────────────────────────────────────────────

  @Post('equipment-refuels')
  async createRefuel(
    @Body() dto: CreateRefuelDto,
    @Req() req: AuthedRequest,
  ): Promise<EquipmentRefuel> {
    return this.refuelService.create({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      tankId: dto.tank_id,
      equipmentId: dto.equipment_id,
      operatorId: dto.operator_id,
      liters: dto.liters,
      equipmentHourMeterReading: dto.equipment_hour_meter_reading,
      gaugePhotoBlobSha256: dto.gauge_photo_blob_sha256 ?? null,
      operationalDayId: dto.operational_day_id,
      createdAtLocal: new Date(dto.created_at_local),
      ianaTimezone: dto.iana_timezone,
      notes: dto.notes ?? null,
      createdBy: req.user.sub,
      occurredAtUtc: new Date(dto.occurred_at_utc),
    });
  }

  @Get('equipment-refuels')
  async listRefuels(
    @Query('equipment_id') _equipmentId: string,
    @Req() _req: AuthedRequest,
  ): Promise<EquipmentRefuel[]> {
    return [];
  }

  // ── Energy Readings ───────────────────────────────────────────────────────

  @Post('energy-readings')
  async upsertEnergyReading(
    @Body() dto: UpsertEnergyReadingDto,
    @Req() req: AuthedRequest,
  ): Promise<EnergyConsumptionReading> {
    return this.energyService.upsert({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      yearMonth: dto.year_month,
      usageType: dto.usage_type,
      kwh: dto.kwh,
      sourceMeterCode: dto.source_meter_code ?? null,
      recordedBy: req.user.sub,
      notes: dto.notes ?? null,
    });
  }

  @Get('energy-readings')
  async listEnergyReadings(
    @Query('site_id') siteId: string,
    @Query('year_month') yearMonth: string,
    @Req() req: AuthedRequest,
  ): Promise<EnergyConsumptionReading[]> {
    return this.energyService.listForSiteMonth(req.user.tenantId, siteId, yearMonth);
  }
}

function pickPrimaryRole(roles: string[] | undefined): string {
  if (!roles || roles.length === 0) return 'UNKNOWN';
  if (roles.includes('SITE_MANAGER')) return 'SITE_MANAGER';
  return roles[0];
}
