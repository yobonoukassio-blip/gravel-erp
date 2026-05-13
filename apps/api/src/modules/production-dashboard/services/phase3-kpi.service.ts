import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface MaintenanceKpi {
  equipmentId: string;
  equipmentLabel: string;
  mtbfHours: number | null;
  mttrHours: number | null;
  failureCount: number;
  status: string;
}

export interface TirKpi {
  openBlastPlansCount: number;
  lastBlastDate: string | null;
  pendingReconciliations: number;
}

export interface VteRevenueKpi {
  weekRevenueXof: string;
  monthRevenueXof: string;
  isProvisional: true; // always provisional — same discipline as cost_per_ton
}

/**
 * Phase 3 dashboard KPI aggregator service.
 * Extends Phase 2 dashboard (DSH-02) with maintenance/TIR/VTE widgets.
 */
@Injectable()
export class Phase3KpiService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async maintenanceKpis(params: { tenantId: string; siteId: string }): Promise<MaintenanceKpi[]> {
    const rows = await this.ds.query<
      Array<{
        equipment_id: string;
        label: string;
        mtbf_hours: string | null;
        mttr_hours: string | null;
        failure_count: number;
        status: string;
      }>
    >(
      `SELECT eq.id AS equipment_id, eq.label, ea.mtbf_hours, ea.mttr_hours,
              COALESCE(ea.failure_count, 0) AS failure_count, eq.status
       FROM production_equipment eq
       LEFT JOIN equipment_availability ea ON ea.equipment_id = eq.id
       WHERE eq.tenant_id = $1 AND eq.site_id = $2
       ORDER BY eq.label`,
      [params.tenantId, params.siteId],
    );
    return rows.map((r) => ({
      equipmentId: r.equipment_id,
      equipmentLabel: r.label,
      mtbfHours: r.mtbf_hours != null ? Number(r.mtbf_hours) : null,
      mttrHours: r.mttr_hours != null ? Number(r.mttr_hours) : null,
      failureCount: Number(r.failure_count),
      status: r.status,
    }));
  }

  async tirKpis(params: { tenantId: string; siteId: string }): Promise<TirKpi> {
    const [openBlast] = await this.ds.query<Array<{ c: string }>>(
      `SELECT COUNT(*) AS c FROM blast_plan
       WHERE tenant_id = $1 AND site_id = $2 AND status IN ('draft', 'hse_approved', 'loaded')`,
      [params.tenantId, params.siteId],
    );
    const [lastBlast] = await this.ds.query<Array<{ d: string | null }>>(
      `SELECT MAX(fired_at_utc)::date::text AS d FROM blast_plan
       WHERE tenant_id = $1 AND site_id = $2 AND status = 'fired'`,
      [params.tenantId, params.siteId],
    );
    const [pending] = await this.ds.query<Array<{ c: string }>>(
      `SELECT COUNT(*) AS c FROM operational_day
       WHERE tenant_id = $1 AND site_id = $2
         AND closure_blockers @> '[{"code":"EXPLOSIVES_RECONCILIATION_GAP"}]'::jsonb`,
      [params.tenantId, params.siteId],
    );
    return {
      openBlastPlansCount: Number(openBlast.c ?? 0),
      lastBlastDate: lastBlast.d,
      pendingReconciliations: Number(pending.c ?? 0),
    };
  }

  async vteRevenue(params: { tenantId: string; siteId: string }): Promise<VteRevenueKpi> {
    // Aggregate signed BL tonnage × contract unit price for week and month windows
    const computeForWindow = async (interval: string): Promise<bigint> => {
      const result = await this.ds.query<Array<{ rev: string | null }>>(
        `SELECT COALESCE(SUM((bl.tonnage_kg * sc.unit_price_minor_units) / 1000)::bigint, 0) AS rev
         FROM bon_de_livraison bl
         JOIN sale_contract sc ON sc.id = bl.sale_contract_id
         WHERE bl.tenant_id = $1 AND bl.site_id = $2
           AND bl.status = 'signed'
           AND bl.signed_at_utc >= NOW() - INTERVAL '${interval}'`,
        [params.tenantId, params.siteId],
      );
      return BigInt(result[0]?.rev ?? '0');
    };

    const week = await computeForWindow('7 days');
    const month = await computeForWindow('30 days');
    return {
      weekRevenueXof: week.toString(),
      monthRevenueXof: month.toString(),
      isProvisional: true,
    };
  }
}
