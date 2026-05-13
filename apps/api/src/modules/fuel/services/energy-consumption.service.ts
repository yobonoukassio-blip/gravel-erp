import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EnergyConsumptionReading, EnergyUsageType } from '../entities/energy-consumption-reading.entity';

export interface UpsertEnergyReadingInput {
  tenantId: string;
  siteId: string;
  yearMonth: string;
  usageType: EnergyUsageType;
  kwh: number;
  sourceMeterCode?: string | null;
  recordedBy: string;
  notes?: string | null;
}

/**
 * EnergyConsumptionService (CAR-04) — manage monthly electricity readings.
 *
 * Supports idempotent upsert via the UNIQUE(tenant_id, site_id, year_month, usage_type)
 * constraint. Re-recording the same month/usage overwrites the previous value.
 */
@Injectable()
export class EnergyConsumptionService {
  private readonly logger = new Logger(EnergyConsumptionService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Idempotent upsert — inserts or updates a monthly reading.
   * The 4 usage types are: concassage, criblage, ateliers, bureaux.
   */
  async upsert(input: UpsertEnergyReadingInput): Promise<EnergyConsumptionReading> {
    const rows = (await this.ds.query(
      `INSERT INTO energy_consumption_reading (
         id, tenant_id, site_id, year_month, usage_type, kwh,
         source_meter_code, recorded_by, notes
       ) VALUES ($1, $2, $3, $4, $5::energy_usage_type, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, site_id, year_month, usage_type)
       DO UPDATE SET
         kwh = EXCLUDED.kwh,
         source_meter_code = EXCLUDED.source_meter_code,
         recorded_by = EXCLUDED.recorded_by,
         recorded_at_utc = now(),
         notes = EXCLUDED.notes
       RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.siteId,
        input.yearMonth,
        input.usageType,
        input.kwh.toString(),
        input.sourceMeterCode ?? null,
        input.recordedBy,
        input.notes ?? null,
      ],
    )) as Array<Record<string, unknown>>;

    return this.mapRow(rows[0]);
  }

  async listForSiteMonth(
    tenantId: string,
    siteId: string,
    yearMonth: string,
  ): Promise<EnergyConsumptionReading[]> {
    const rows = (await this.ds.query(
      `SELECT * FROM energy_consumption_reading
        WHERE tenant_id = $1 AND site_id = $2 AND year_month = $3
        ORDER BY usage_type`,
      [tenantId, siteId, yearMonth],
    )) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(r: Record<string, unknown>): EnergyConsumptionReading {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      yearMonth: r['year_month'] as string,
      usageType: r['usage_type'] as EnergyUsageType,
      kwh: String(r['kwh']),
      sourceMeterCode: (r['source_meter_code'] as string | null) ?? null,
      recordedBy: r['recorded_by'] as string,
      recordedAtUtc: new Date(r['recorded_at_utc'] as string | Date),
      notes: (r['notes'] as string | null) ?? null,
    };
  }
}
