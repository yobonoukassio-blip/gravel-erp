import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DrillingYieldRow {
  tenant_id: string;
  operational_day_id: string;
  machine_id: string;
  operator_id: string;
  total_depth_m: number;
  total_machine_hours: number;
  yield_m_per_h: number;
  hole_count: number;
}

export interface FuelConsumptionRow {
  machine_id: string;
  total_liters: number;
  hole_count: number;
}

/**
 * DrillingYieldService — exposes FOR-03 (yield m/h) and a fuel aggregation
 * tied to FOR-04 (fuel per drilling session). Both query Postgres directly;
 * yield reads from the materialized view, fuel reads from drilled_hole.
 */
@Injectable()
export class DrillingYieldService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getYield(
    tenantId: string,
    operationalDayId: string,
    machineId?: string,
  ): Promise<DrillingYieldRow[]> {
    const params: unknown[] = [tenantId, operationalDayId];
    let where =
      'tenant_id = $1 AND operational_day_id = $2';
    if (machineId) {
      params.push(machineId);
      where += ` AND machine_id = $${params.length}`;
    }
    const rows = await this.ds.query(
      `SELECT tenant_id, operational_day_id, machine_id, operator_id,
              total_depth_m::float AS total_depth_m,
              total_machine_hours::float AS total_machine_hours,
              yield_m_per_h::float AS yield_m_per_h,
              hole_count::int AS hole_count
       FROM drilling_yield_per_machine_day
       WHERE ${where}
       ORDER BY yield_m_per_h DESC`,
      params,
    );
    return rows as DrillingYieldRow[];
  }

  async getFuelConsumptionForEquipment(
    tenantId: string,
    machineId: string,
    from: Date,
    to: Date,
  ): Promise<FuelConsumptionRow> {
    const rows: Array<{
      total_liters: string | null;
      hole_count: string;
    }> = await this.ds.query(
      `SELECT COALESCE(SUM(fuel_liters_consumed), 0)::numeric AS total_liters,
              COUNT(*)::int AS hole_count
       FROM drilled_hole
       WHERE tenant_id = $1
         AND machine_id = $2
         AND created_at_utc >= $3
         AND created_at_utc <  $4
         AND corrects_hole_id IS NULL`,
      [tenantId, machineId, from, to],
    );
    const row = rows[0] ?? { total_liters: '0', hole_count: '0' };
    return {
      machine_id: machineId,
      total_liters: Number(row.total_liters ?? 0),
      hole_count: Number(row.hole_count ?? 0),
    };
  }
}
