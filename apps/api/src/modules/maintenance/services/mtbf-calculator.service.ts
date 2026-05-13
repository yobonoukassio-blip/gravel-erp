import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EquipmentAvailability } from '../entities/equipment-availability.entity';

/**
 * MTBFCalculatorService (MNT-05).
 *
 * MTBF (Mean Time Between Failures) = total_operating_hours / failure_count
 * MTTR (Mean Time To Repair) = sum(downtime_minutes) / failure_count
 * Both NULL when failure_count = 0 (rendered as "N/A" by dashboard).
 * Rolling 12 months window. Refreshed by WorkOrderService.close().
 */
@Injectable()
export class MtbfCalculatorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async refreshForEquipment(params: { tenantId: string; equipmentId: string }): Promise<void> {
    const { tenantId, equipmentId } = params;

    // Sum corrective WO downtime in last 12 months (preventive WOs excluded from MTBF math)
    const result = await this.ds.query<
      Array<{ failures: string | null; total_downtime: string | null }>
    >(
      `SELECT COUNT(*) AS failures,
              COALESCE(SUM(downtime_minutes), 0) AS total_downtime
       FROM work_order
       WHERE tenant_id = $1
         AND equipment_id = $2
         AND type = 'corrective'
         AND status = 'closed'
         AND closed_at_utc >= NOW() - INTERVAL '12 months'`,
      [tenantId, equipmentId],
    );

    const failures = Number(result[0]?.failures ?? 0);
    const totalDowntimeMinutes = Number(result[0]?.total_downtime ?? 0);

    let mtbfHours: number | null = null;
    let mttrHours: number | null = null;
    if (failures > 0) {
      // Total period is 12 months = 8760h; uptime = total - downtime
      const totalDowntimeHours = totalDowntimeMinutes / 60;
      const uptime = Math.max(0, 8760 - totalDowntimeHours);
      mtbfHours = uptime / failures;
      mttrHours = totalDowntimeHours / failures;
    }

    await this.ds
      .createQueryBuilder()
      .insert()
      .into(EquipmentAvailability)
      .values({
        equipmentId,
        tenantId,
        mtbfHours: mtbfHours != null ? mtbfHours.toFixed(2) : null,
        mttrHours: mttrHours != null ? mttrHours.toFixed(2) : null,
        failureCount: failures,
        totalDowntimeMinutes,
      })
      .orUpdate(
        ['tenant_id', 'mtbf_hours', 'mttr_hours', 'failure_count', 'total_downtime_minutes', 'computed_at_utc'],
        ['equipment_id'],
      )
      .execute();
  }
}
