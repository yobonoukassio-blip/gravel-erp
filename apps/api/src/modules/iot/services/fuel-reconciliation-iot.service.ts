import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface FuelReconciliationResult {
  date: string;
  equipmentId: string;
  manualLitres: number;
  iotLitres: number | null;
  driftLitres: number;
  driftPct: number;
  status: 'within_tolerance' | 'drift_warning' | 'drift_critical';
}

/**
 * FuelReconciliationIotService (IOT-03).
 *
 * Compares manual fuel entries (equipment_refuel) with IoT readings
 * (fuel_level_litres deltas on the same equipment for the same day).
 * Drift threshold: < 5% within_tolerance, 5-15% drift_warning, > 15% drift_critical.
 * Excludes data_quality_flag != 'valid' IoT readings from comparison.
 */
@Injectable()
export class FuelReconciliationIotService {
  private readonly logger = new Logger(FuelReconciliationIotService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async reconcileForDate(params: {
    tenantId: string;
    siteId: string;
    date: string;
  }): Promise<FuelReconciliationResult[]> {
    const results = await this.ds.query<
      Array<{
        equipment_id: string;
        manual_litres: string | null;
        iot_first: string | null;
        iot_last: string | null;
      }>
    >(
      `WITH manual AS (
         SELECT equipment_id, COALESCE(SUM(litres_dispensed), 0)::numeric AS total
         FROM equipment_refuel
         WHERE tenant_id = $1 AND refueled_at_utc::date = $2
         GROUP BY equipment_id
       ),
       iot AS (
         SELECT v.device_id AS equipment_id,
                MIN(v.value) AS iot_first,
                MAX(v.value) AS iot_last
         FROM iot_reading_validated v
         WHERE v.tenant_id = $1
           AND v.sensor_type = 'fuel_level_litres'
           AND v.data_quality_flag = 'valid'
           AND v.observed_at_utc::date = $2
         GROUP BY v.device_id
       )
       SELECT COALESCE(m.equipment_id, i.equipment_id) AS equipment_id,
              m.total::text AS manual_litres,
              i.iot_first::text AS iot_first,
              i.iot_last::text AS iot_last
       FROM manual m FULL OUTER JOIN iot i ON m.equipment_id = i.equipment_id`,
      [params.tenantId, params.date],
    );

    return results.map((r) => {
      const manual = Number(r.manual_litres ?? 0);
      const iotDelta =
        r.iot_first != null && r.iot_last != null
          ? Math.max(0, Number(r.iot_first) - Number(r.iot_last))
          : null;
      const drift = iotDelta != null ? Math.abs(manual - iotDelta) : 0;
      const driftPct = manual > 0 ? (drift / manual) * 100 : 0;

      let status: FuelReconciliationResult['status'] = 'within_tolerance';
      if (driftPct > 15) status = 'drift_critical';
      else if (driftPct > 5) status = 'drift_warning';

      return {
        date: params.date,
        equipmentId: r.equipment_id,
        manualLitres: manual,
        iotLitres: iotDelta,
        driftLitres: Number(drift.toFixed(2)),
        driftPct: Number(driftPct.toFixed(2)),
        status,
      };
    });
  }
}
