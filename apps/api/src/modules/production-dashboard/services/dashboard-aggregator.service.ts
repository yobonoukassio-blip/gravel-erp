import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CostPerTonProvisionalService, CostPerTonProvisionalResult } from './cost-per-ton-provisional.service';

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface FuelTankSummary {
  tank_id: string;
  label: string;
  balance_liters: number;
  pct_filled: number;
  anomalies_open: number;
}

export interface StockpileSummary {
  stockpile_id: string;
  label: string;
  balance_kg: bigint;
  threshold_status: 'ok' | 'warning' | 'critical';
}

export interface EquipmentOutOfService {
  equipment_id: string;
  label: string;
  out_of_service_since_utc: Date | null;
}

export interface OpenIncidentsBySeverity {
  severity: string;
  count: number;
}

export interface SiteDirectorDashboard {
  tonnage_today_kg: bigint;
  tonnage_yesterday_kg: bigint;
  tonnage_week_kg: bigint;
  tonnage_month_kg: bigint;
  drilling_yield_m_per_h_today: number;
  extraction_yield_t_per_h_today: number;
  tf_rolling_12m: number;
  open_incidents_by_severity: OpenIncidentsBySeverity[];
  fuel_tanks: FuelTankSummary[];
  stockpiles: StockpileSummary[];
  equipment_out_of_service: EquipmentOutOfService[];
  cost_per_ton_provisional: CostPerTonProvisionalResult;
  downtime_today_minutes: number;
}

export interface ActiveDrillingPlan {
  id: string;
  label: string;
  planned: number;
  drilled: number;
  progress_pct: number;
}

export interface TruckRotationCounts {
  total: number;
  in_progress: number;
  completed: number;
}

export interface QuarryChiefDashboard {
  active_drilling_plans: ActiveDrillingPlan[];
  crews_assigned_today: number;
  tolerance_violations_today: number;
  truck_rotations_today: TruckRotationCounts;
  weighing_queue_size: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * DashboardAggregatorService (DSH-01, DSH-02).
 *
 * Orchestrates cross-module KPI aggregation for both Directeur Site and
 * Chef Carrière dashboards. All queries are tenant-scoped.
 */
@Injectable()
export class DashboardAggregatorService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly costPerTon: CostPerTonProvisionalService,
  ) {}

  // -------------------------------------------------------------------------
  // Site Director (D2-70, D2-72)
  // -------------------------------------------------------------------------

  async computeForSiteDirector(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<SiteDirectorDashboard> {
    const [
      tonnages,
      drillingYield,
      extractionYield,
      tf,
      incidents,
      fuelTanks,
      stockpiles,
      outOfService,
      costPerTonProv,
      downtimeMinutes,
    ] = await Promise.all([
      this.fetchTonnages(tenantId, siteId, operationalDayId),
      this.fetchDrillingYield(tenantId, siteId, operationalDayId),
      this.fetchExtractionYield(tenantId, siteId, operationalDayId),
      this.fetchTf(tenantId, siteId),
      this.fetchOpenIncidents(tenantId, siteId),
      this.fetchFuelTanks(tenantId, siteId),
      this.fetchStockpiles(tenantId, siteId),
      this.fetchEquipmentOutOfService(tenantId, siteId),
      this.costPerTon.compute(tenantId, siteId, operationalDayId),
      this.fetchDowntimeMinutes(tenantId, siteId, operationalDayId),
    ]);

    return {
      ...tonnages,
      drilling_yield_m_per_h_today: drillingYield,
      extraction_yield_t_per_h_today: extractionYield,
      tf_rolling_12m: tf,
      open_incidents_by_severity: incidents,
      fuel_tanks: fuelTanks,
      stockpiles,
      equipment_out_of_service: outOfService,
      cost_per_ton_provisional: costPerTonProv,
      downtime_today_minutes: downtimeMinutes,
    };
  }

  // -------------------------------------------------------------------------
  // Quarry Chief (D2-73)
  // -------------------------------------------------------------------------

  async computeForQuarryChief(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<QuarryChiefDashboard> {
    const [
      activePlans,
      crewsAssigned,
      toleranceViolations,
      rotations,
      weighingQueue,
    ] = await Promise.all([
      this.fetchActiveDrillingPlans(tenantId, siteId),
      this.fetchCrewsAssigned(tenantId, siteId, operationalDayId),
      this.fetchToleranceViolations(tenantId, siteId, operationalDayId),
      this.fetchRotations(tenantId, siteId, operationalDayId),
      this.fetchWeighingQueue(tenantId, siteId),
    ]);

    return {
      active_drilling_plans: activePlans,
      crews_assigned_today: crewsAssigned,
      tolerance_violations_today: toleranceViolations,
      truck_rotations_today: rotations,
      weighing_queue_size: weighingQueue,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers — Site Director
  // -------------------------------------------------------------------------

  private async fetchTonnages(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<Pick<SiteDirectorDashboard, 'tonnage_today_kg' | 'tonnage_yesterday_kg' | 'tonnage_week_kg' | 'tonnage_month_kg'>> {
    // Today
    const todayRows = (await this.ds.query(
      `SELECT COALESCE(SUM(tonnage_delta_kg), 0)::text AS total
       FROM stockpile_event
       WHERE tenant_id = $1 AND site_id = $2
         AND operational_day_id = $3
         AND event_type = 'STOCKPILE_INFLOW'`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total: string }>;

    // Yesterday — join operational_day to get the day before
    const yesterdayRows = (await this.ds.query(
      `SELECT COALESCE(SUM(se.tonnage_delta_kg), 0)::text AS total
       FROM stockpile_event se
       JOIN operational_day od ON od.id = se.operational_day_id
         AND od.tenant_id = se.tenant_id
       JOIN operational_day od_today ON od_today.id = $3
         AND od_today.tenant_id = $1
       WHERE se.tenant_id = $1 AND se.site_id = $2
         AND se.event_type = 'STOCKPILE_INFLOW'
         AND od.date = od_today.date - INTERVAL '1 day'`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total: string }>;

    // Week (last 7 days)
    const weekRows = (await this.ds.query(
      `SELECT COALESCE(SUM(se.tonnage_delta_kg), 0)::text AS total
       FROM stockpile_event se
       JOIN operational_day od ON od.id = se.operational_day_id
         AND od.tenant_id = se.tenant_id
       JOIN operational_day od_today ON od_today.id = $3
         AND od_today.tenant_id = $1
       WHERE se.tenant_id = $1 AND se.site_id = $2
         AND se.event_type = 'STOCKPILE_INFLOW'
         AND od.date >= od_today.date - INTERVAL '6 days'`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total: string }>;

    // Month (last 30 days)
    const monthRows = (await this.ds.query(
      `SELECT COALESCE(SUM(se.tonnage_delta_kg), 0)::text AS total
       FROM stockpile_event se
       JOIN operational_day od ON od.id = se.operational_day_id
         AND od.tenant_id = se.tenant_id
       JOIN operational_day od_today ON od_today.id = $3
         AND od_today.tenant_id = $1
       WHERE se.tenant_id = $1 AND se.site_id = $2
         AND se.event_type = 'STOCKPILE_INFLOW'
         AND od.date >= od_today.date - INTERVAL '29 days'`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total: string }>;

    return {
      tonnage_today_kg: BigInt(todayRows[0]?.total ?? '0'),
      tonnage_yesterday_kg: BigInt(yesterdayRows[0]?.total ?? '0'),
      tonnage_week_kg: BigInt(weekRows[0]?.total ?? '0'),
      tonnage_month_kg: BigInt(monthRows[0]?.total ?? '0'),
    };
  }

  private async fetchDrillingYield(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<number> {
    const rows = (await this.ds.query(
      `SELECT COALESCE(AVG(yield_m_per_h), 0)::float AS avg_yield
       FROM drilling_yield_per_machine_day
       WHERE tenant_id = $1 AND operational_day_id = $2`,
      [tenantId, operationalDayId],
    )) as Array<{ avg_yield: number }>;
    // siteId used for future multi-site join; mark used
    void siteId;
    return Math.round((rows[0]?.avg_yield ?? 0) * 100) / 100;
  }

  private async fetchDowntimeMinutes(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<number> {
    const rows = (await this.ds.query(
      `SELECT COALESCE(SUM(downtime_minutes), 0)::int AS total
       FROM extraction_cycle
       WHERE tenant_id = $1 AND site_id = $2 AND operational_day_id = $3`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  private async fetchExtractionYield(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<number> {
    const rows = (await this.ds.query(
      `SELECT COALESCE(SUM(estimated_tonnage_t), 0)::float      AS total_t,
              COALESCE(SUM(
                EXTRACT(EPOCH FROM (cycle_ended_at_local - cycle_started_at_local)) / 3600
                - COALESCE(downtime_minutes, 0) / 60.0
              ), 0)::float AS total_h
       FROM extraction_cycle
       WHERE tenant_id = $1 AND site_id = $2 AND operational_day_id = $3`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total_t: number; total_h: number }>;
    const { total_t, total_h } = rows[0] ?? { total_t: 0, total_h: 0 };
    return total_h > 0 ? Math.round((total_t / total_h) * 100) / 100 : 0;
  }

  private async fetchTf(tenantId: string, siteId: string): Promise<number> {
    // TF = (incidents mortels + graves) / (Heures travaillées * 10^6) — rolling 12 months
    const rows = (await this.ds.query(
      `SELECT
         COUNT(*)::float AS incidents,
         (SELECT COALESCE(SUM(worked_hours), 0)::float
          FROM operational_day od2
          WHERE od2.tenant_id = $1 AND od2.site_id = $2
            AND od2.date >= CURRENT_DATE - INTERVAL '12 months') AS worked_hours
       FROM alert
       WHERE tenant_id = $1 AND site_id = $2
         AND severity IN ('high', 'critical')
         AND source_event_type LIKE 'hse.incident.%'
         AND created_at_utc >= now() - INTERVAL '12 months'`,
      [tenantId, siteId],
    )) as Array<{ incidents: number; worked_hours: number }>;

    const { incidents, worked_hours } = rows[0] ?? { incidents: 0, worked_hours: 0 };
    if (worked_hours <= 0) return 0;
    return Math.round((incidents / worked_hours) * 1_000_000 * 100) / 100;
  }

  private async fetchOpenIncidents(
    tenantId: string,
    siteId: string,
  ): Promise<OpenIncidentsBySeverity[]> {
    const rows = (await this.ds.query(
      `SELECT severity, COUNT(*)::int AS count
       FROM alert
       WHERE tenant_id = $1 AND site_id = $2 AND status = 'open'
       GROUP BY severity
       ORDER BY severity`,
      [tenantId, siteId],
    )) as Array<{ severity: string; count: number }>;
    return rows;
  }

  private async fetchFuelTanks(
    tenantId: string,
    siteId: string,
  ): Promise<FuelTankSummary[]> {
    const rows = (await this.ds.query(
      `SELECT
         ft.id AS tank_id,
         ft.label,
         COALESCE(ftb.balance_liters, 0)::float AS balance_liters,
         ft.capacity_liters,
         CASE WHEN ft.capacity_liters > 0
              THEN ROUND((COALESCE(ftb.balance_liters, 0)::numeric / ft.capacity_liters) * 100, 1)::float
              ELSE 0 END AS pct_filled,
         COUNT(a.id)::int AS anomalies_open
       FROM fuel_tank ft
       LEFT JOIN fuel_tank_balance ftb ON ftb.tank_id = ft.id AND ftb.tenant_id = ft.tenant_id
       LEFT JOIN alert a ON a.tenant_id = ft.tenant_id
         AND a.site_id = ft.site_id
         AND a.status = 'open'
         AND (a.payload->>'tank_id')::text = ft.id::text
       WHERE ft.tenant_id = $1 AND ft.site_id = $2
       GROUP BY ft.id, ft.label, ftb.balance_liters, ft.capacity_liters`,
      [tenantId, siteId],
    )) as Array<{
      tank_id: string;
      label: string;
      balance_liters: number;
      capacity_liters: number;
      pct_filled: number;
      anomalies_open: number;
    }>;

    return rows.map((r) => ({
      tank_id: r.tank_id,
      label: r.label,
      balance_liters: r.balance_liters,
      pct_filled: r.pct_filled,
      anomalies_open: r.anomalies_open,
    }));
  }

  private async fetchStockpiles(
    tenantId: string,
    siteId: string,
  ): Promise<StockpileSummary[]> {
    const rows = (await this.ds.query(
      `SELECT
         s.id AS stockpile_id,
         s.name AS label,
         COALESCE(sb.balance_kg, 0)::text AS balance_kg,
         CASE
           WHEN st.critical_threshold_kg IS NOT NULL
                AND COALESCE(sb.balance_kg, 0) <= st.critical_threshold_kg
             THEN 'critical'
           WHEN st.warning_threshold_kg IS NOT NULL
                AND COALESCE(sb.balance_kg, 0) <= st.warning_threshold_kg
             THEN 'warning'
           ELSE 'ok'
         END AS threshold_status
       FROM stockpile s
       LEFT JOIN stockpile_balance sb ON sb.stockpile_id = s.id AND sb.tenant_id = s.tenant_id
       LEFT JOIN stockpile_threshold st ON st.stockpile_id = s.id AND st.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1 AND s.site_id = $2 AND s.is_active = true`,
      [tenantId, siteId],
    )) as Array<{
      stockpile_id: string;
      label: string;
      balance_kg: string;
      threshold_status: 'ok' | 'warning' | 'critical';
    }>;

    return rows.map((r) => ({
      stockpile_id: r.stockpile_id,
      label: r.label,
      balance_kg: BigInt(r.balance_kg),
      threshold_status: r.threshold_status,
    }));
  }

  private async fetchEquipmentOutOfService(
    tenantId: string,
    siteId: string,
  ): Promise<EquipmentOutOfService[]> {
    const rows = (await this.ds.query(
      `SELECT id AS equipment_id, label, out_of_service_since_utc
       FROM production_equipment
       WHERE tenant_id = $1 AND site_id = $2 AND is_out_of_service = true
       ORDER BY out_of_service_since_utc ASC`,
      [tenantId, siteId],
    )) as Array<{
      equipment_id: string;
      label: string;
      out_of_service_since_utc: Date | null;
    }>;
    return rows;
  }

  // -------------------------------------------------------------------------
  // Private helpers — Quarry Chief
  // -------------------------------------------------------------------------

  private async fetchActiveDrillingPlans(
    tenantId: string,
    siteId: string,
  ): Promise<ActiveDrillingPlan[]> {
    const rows = (await this.ds.query(
      `SELECT
         dp.id,
         dp.label,
         dp.planned_holes AS planned,
         COUNT(dh.id)::int AS drilled,
         CASE WHEN dp.planned_holes > 0
              THEN ROUND((COUNT(dh.id)::numeric / dp.planned_holes) * 100, 1)::float
              ELSE 0 END AS progress_pct
       FROM drilling_plan dp
       LEFT JOIN drilled_hole dh ON dh.plan_id = dp.id
         AND dh.tenant_id = dp.tenant_id
         AND dh.corrects_hole_id IS NULL
       WHERE dp.tenant_id = $1 AND dp.site_id = $2
         AND dp.status IN ('active', 'in_progress')
       GROUP BY dp.id, dp.label, dp.planned_holes
       ORDER BY dp.created_at_utc DESC`,
      [tenantId, siteId],
    )) as Array<{
      id: string;
      label: string;
      planned: number;
      drilled: number;
      progress_pct: number;
    }>;
    return rows;
  }

  private async fetchCrewsAssigned(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<number> {
    const rows = (await this.ds.query(
      `SELECT COUNT(DISTINCT operator_id)::int AS crews
       FROM drilled_hole
       WHERE tenant_id = $1 AND site_id = $2
         AND operational_day_id = $3
         AND corrects_hole_id IS NULL`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ crews: number }>;
    return rows[0]?.crews ?? 0;
  }

  private async fetchToleranceViolations(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<number> {
    const rows = (await this.ds.query(
      `SELECT COUNT(*)::int AS violations
       FROM drilled_hole
       WHERE tenant_id = $1 AND site_id = $2
         AND operational_day_id = $3
         AND corrects_hole_id IS NULL
         AND (
           ABS(COALESCE(actual_depth_m, planned_depth_m) - planned_depth_m) > planned_depth_m * 0.1
           OR ABS(COALESCE(actual_inclination_deg, planned_inclination_deg) - planned_inclination_deg) > 5
         )`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ violations: number }>;
    return rows[0]?.violations ?? 0;
  }

  private async fetchRotations(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<TruckRotationCounts> {
    const rows = (await this.ds.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
         COUNT(*) FILTER (WHERE status = 'completed')::int   AS completed
       FROM truck_rotation
       WHERE tenant_id = $1 AND site_id = $2
         AND operational_day_id = $3`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total: number; in_progress: number; completed: number }>;

    const r = rows[0] ?? { total: 0, in_progress: 0, completed: 0 };
    return { total: r.total, in_progress: r.in_progress, completed: r.completed };
  }

  private async fetchWeighingQueue(
    tenantId: string,
    siteId: string,
  ): Promise<number> {
    const rows = (await this.ds.query(
      `SELECT COUNT(*)::int AS queue_size
       FROM weighing_ticket
       WHERE tenant_id = $1 AND site_id = $2
         AND rotation_id IS NULL
         AND created_at_utc > now() - INTERVAL '1 hour'`,
      [tenantId, siteId],
    )) as Array<{ queue_size: number }>;
    return rows[0]?.queue_size ?? 0;
  }
}
