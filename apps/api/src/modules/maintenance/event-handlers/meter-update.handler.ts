import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface RefuelAppendedEvent {
  tenantId: string;
  equipmentId: string;
  equipmentHourMeterReading: string; // numeric arrives as string
}

interface RotationCompletedEvent {
  outboxId?: string;
  payload: {
    tenant_id?: string;
    truck_equipment_id?: string | null;
    km_total_after?: string | null;
  };
}

/**
 * MeterUpdateHandler (Phase 8 ALT-01 / D-05 / D-06).
 *
 * Denormalizes hour and km meters onto production_equipment via the
 * IF-HIGHER rule. Prevents regressions when late mobile sync brings in
 * a refuel reading older than the latest known.
 *
 * No bulk recompute; transitions are event-driven only (D-09 spirit).
 */
@Injectable()
export class MeterUpdateHandler {
  private readonly logger = new Logger(MeterUpdateHandler.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @OnEvent('production.fuel.refuel_appended')
  async onRefuelCreated(evt: RefuelAppendedEvent): Promise<void> {
    if (!evt.equipmentId || !evt.equipmentHourMeterReading) return;
    await this.updateHoursIfHigher(
      evt.tenantId,
      evt.equipmentId,
      evt.equipmentHourMeterReading,
    );
  }

  @OnEvent('production.transport.rotation_completed')
  async onRotationCompleted(evt: RotationCompletedEvent): Promise<void> {
    const p = evt.payload;
    if (!p?.truck_equipment_id || p.km_total_after == null) return;
    if (!p.tenant_id) return;
    await this.updateKmIfHigher(
      p.tenant_id,
      p.truck_equipment_id,
      p.km_total_after,
    );
  }

  /** D-06 IF HIGHER guard on hour meter. */
  async updateHoursIfHigher(
    tenantId: string,
    equipmentId: string,
    readingNumericString: string,
  ): Promise<void> {
    const result = await this.ds.query(
      `UPDATE production_equipment
         SET hour_meter_current = $3::numeric,
             updated_at = now()
       WHERE id = $1 AND tenant_id = $2
         AND (hour_meter_current IS NULL OR hour_meter_current < $3::numeric)`,
      [equipmentId, tenantId, readingNumericString],
    );
    this.logger.debug(
      `meter.hours equipment=${equipmentId} reading=${readingNumericString} updated=${(result as unknown as { rowCount?: number })?.rowCount ?? 0}`,
    );
  }

  /** D-06 IF HIGHER guard on km/odometer. */
  async updateKmIfHigher(
    tenantId: string,
    equipmentId: string,
    kmNumericString: string,
  ): Promise<void> {
    const result = await this.ds.query(
      `UPDATE production_equipment
         SET odometer_km_current = $3::numeric,
             updated_at = now()
       WHERE id = $1 AND tenant_id = $2
         AND (odometer_km_current IS NULL OR odometer_km_current < $3::numeric)`,
      [equipmentId, tenantId, kmNumericString],
    );
    this.logger.debug(
      `meter.km equipment=${equipmentId} reading=${kmNumericString} updated=${(result as unknown as { rowCount?: number })?.rowCount ?? 0}`,
    );
  }
}
