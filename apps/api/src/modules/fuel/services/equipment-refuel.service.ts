import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EquipmentRefuel } from '../entities/equipment-refuel.entity';
import { FuelTankEventService } from './fuel-tank-event.service';

export interface CreateEquipmentRefuelInput {
  tenantId: string;
  siteId: string;
  tankId: string;
  equipmentId: string;
  operatorId: string;
  liters: number;
  equipmentHourMeterReading: number;
  gaugePhotoBlobSha256?: string | null;
  operationalDayId: string;
  createdAtLocal: Date;
  ianaTimezone: string;
  notes?: string | null;
  createdBy: string;
  occurredAtUtc: Date;
}

interface PreviousRefuelRow {
  equipment_hour_meter_reading: string;
}

interface LatestDeliveryRow {
  cost_per_liter_minor_units: string | null;
  currency: string | null;
}

@Injectable()
export class EquipmentRefuelService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly fuelEventService: FuelTankEventService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Create an equipment refuel record atomically:
   *   1. Validate hour_meter_reading >= previous reading for same equipment
   *   2. Insert FUEL_DISPENSE_OUT fuel_tank_event (negative liters_delta)
   *   3. Insert equipment_refuel row
   *   4. Compute hours_since_previous
   *   5. Insert equipment_fuel_consumption row
   *
   * All in one transaction. Emits production.fuel.refuel_appended post-commit.
   */
  async create(input: CreateEquipmentRefuelInput): Promise<EquipmentRefuel> {
    const result = await this.ds.transaction(async (em: EntityManager) => {
      // Validate hour meter monotonicity
      await this.validateHourMeter(em, input.tenantId, input.equipmentId, input.equipmentHourMeterReading);

      // Fetch latest cost from most recent FUEL_DELIVERY_IN on this tank
      const latestDelivery = await this.fetchLatestDeliveryCost(em, input.tenantId, input.tankId);

      // Compute hours since previous refuel
      const hoursSincePrevious = await this.computeHoursSince(
        em,
        input.tenantId,
        input.equipmentId,
        input.equipmentHourMeterReading,
      );

      // 1) Append FUEL_DISPENSE_OUT to fuel_tank_event
      await this.fuelEventService.append({
        tenantId: input.tenantId,
        siteId: input.siteId,
        tankId: input.tankId,
        eventType: 'FUEL_DISPENSE_OUT',
        litersDelta: -input.liters,
        operationalDayId: input.operationalDayId,
        sourceReference: { refuel_id: 'pending' }, // updated after refuel insert
        occurredAtUtc: input.occurredAtUtc,
        createdBy: input.createdBy,
        actorRole: 'FIELD_OPERATOR',
        costPerLiterMinorUnits: latestDelivery?.cost_per_liter_minor_units
          ? BigInt(latestDelivery.cost_per_liter_minor_units)
          : null,
        currency: latestDelivery?.currency ?? null,
        manager: em,
      });

      // 2) Insert equipment_refuel
      const refuelId = randomUUID();
      const refuelRows = (await em.query(
        `INSERT INTO equipment_refuel (
           id, tenant_id, site_id, tank_id, equipment_id, operator_id,
           liters, equipment_hour_meter_reading, gauge_photo_blob_sha256,
           operational_day_id, created_at_local, iana_timezone, notes,
           created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          refuelId,
          input.tenantId, input.siteId, input.tankId, input.equipmentId,
          input.operatorId, input.liters.toString(),
          input.equipmentHourMeterReading.toString(),
          input.gaugePhotoBlobSha256 ?? null,
          input.operationalDayId,
          input.createdAtLocal,
          input.ianaTimezone,
          input.notes ?? null,
          input.createdBy,
        ],
      )) as Array<Record<string, unknown>>;

      const refuel = this.mapRefuelRow(refuelRows[0]);

      // 3) Insert equipment_fuel_consumption
      await em.query(
        `INSERT INTO equipment_fuel_consumption (
           id, tenant_id, site_id, equipment_id, refuel_id,
           operational_day_id, liters, hour_meter_reading,
           hours_since_previous, cost_per_liter_minor_units, currency
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          randomUUID(),
          input.tenantId, input.siteId, input.equipmentId, refuelId,
          input.operationalDayId,
          input.liters.toString(),
          input.equipmentHourMeterReading.toString(),
          hoursSincePrevious != null ? hoursSincePrevious.toString() : null,
          latestDelivery?.cost_per_liter_minor_units ?? null,
          latestDelivery?.currency ?? null,
        ],
      );

      return refuel;
    });

    this.events.emit('production.fuel.refuel_appended', {
      tenantId: result.tenantId,
      siteId: result.siteId,
      tankId: result.tankId,
      equipmentId: result.equipmentId,
      liters: parseFloat(result.liters),
      refuelId: result.id,
      equipmentHourMeterReading: result.equipmentHourMeterReading,
    });

    return result;
  }

  private async validateHourMeter(
    em: EntityManager,
    tenantId: string,
    equipmentId: string,
    newReading: number,
  ): Promise<void> {
    const rows = (await em.query(
      `SELECT equipment_hour_meter_reading
         FROM equipment_refuel
        WHERE tenant_id = $1 AND equipment_id = $2
        ORDER BY created_at_utc DESC
        LIMIT 1`,
      [tenantId, equipmentId],
    )) as PreviousRefuelRow[];

    if (rows.length > 0) {
      const previous = parseFloat(rows[0].equipment_hour_meter_reading);
      if (newReading < previous) {
        throw new BadRequestException({
          code: 'ERR_HOUR_METER_REGRESSION',
          message: `Hour meter reading ${newReading} is less than previous reading ${previous}.`,
        });
      }
    }
  }

  private async computeHoursSince(
    em: EntityManager,
    tenantId: string,
    equipmentId: string,
    newReading: number,
  ): Promise<number | null> {
    const rows = (await em.query(
      `SELECT equipment_hour_meter_reading
         FROM equipment_refuel
        WHERE tenant_id = $1 AND equipment_id = $2
        ORDER BY created_at_utc DESC
        LIMIT 1`,
      [tenantId, equipmentId],
    )) as PreviousRefuelRow[];

    if (rows.length === 0) return null;
    const previous = parseFloat(rows[0].equipment_hour_meter_reading);
    return Math.round((newReading - previous) * 10) / 10;
  }

  private async fetchLatestDeliveryCost(
    em: EntityManager,
    tenantId: string,
    tankId: string,
  ): Promise<LatestDeliveryRow | null> {
    const rows = (await em.query(
      `SELECT cost_per_liter_minor_units, currency
         FROM fuel_tank_event
        WHERE tenant_id = $1 AND tank_id = $2
          AND event_type = 'FUEL_DELIVERY_IN'
          AND cost_per_liter_minor_units IS NOT NULL
        ORDER BY occurred_at_utc DESC
        LIMIT 1`,
      [tenantId, tankId],
    )) as LatestDeliveryRow[];
    return rows.length > 0 ? rows[0] : null;
  }

  private mapRefuelRow(r: Record<string, unknown>): EquipmentRefuel {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      tankId: r['tank_id'] as string,
      equipmentId: r['equipment_id'] as string,
      operatorId: r['operator_id'] as string,
      liters: String(r['liters']),
      equipmentHourMeterReading: String(r['equipment_hour_meter_reading']),
      gaugePhotoBlobSha256: (r['gauge_photo_blob_sha256'] as string | null) ?? null,
      operationalDayId: r['operational_day_id'] as string,
      createdAtLocal: new Date(r['created_at_local'] as string | Date),
      ianaTimezone: r['iana_timezone'] as string,
      notes: (r['notes'] as string | null) ?? null,
      createdBy: r['created_by'] as string,
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
    };
  }
}
