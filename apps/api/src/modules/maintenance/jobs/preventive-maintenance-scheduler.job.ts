import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WorkOrderService } from '../services/work-order.service';

interface TenantRow {
  id: string;
}

interface PmCheckRow {
  pm_plan_id: string;
  tenant_id: string;
  equipment_id: string;
  site_id: string;
  interval_unit: 'hours' | 'km' | 'days';
  interval_value: number;
  last_executed_meter: string | null;
  next_due_at_utc: string | null;
  hour_meter_current: string | null;
  odometer_km_current: string | null;
}

type Decision = 'opened' | 'skipped_existing' | 'skipped_missing_meter' | 'not_due';

interface DueResult {
  dueReason: 'hours' | 'km' | 'days';
  overdueBy: number;
  severity: 'warning' | 'critical';
  skip?: 'missing_meter';
}

/**
 * PreventiveMaintenanceSchedulerJob (ALT-01, D-01..D-04, D-12, D-17).
 *
 * Hourly cron. For each active tenant:
 *   1. SET LOCAL app.current_tenant
 *   2. Query active PM plans + their equipment meter
 *   3. For each plan, decide if it is due based on interval_unit
 *   4. Run WorkOrderService.findOpen() for idempotency (D-02)
 *   5. If not already open, call WorkOrderService.open() which emits
 *      `maintenance.work_order.preventive_opened` (T01)
 *
 * Resilience: per-tenant try/catch — one tenant failing does NOT stop the
 * rest of the run (mirrors CostPerTonAggregatorJob).
 */
@Injectable()
export class PreventiveMaintenanceSchedulerJob {
  private readonly logger = new Logger(PreventiveMaintenanceSchedulerJob.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly workOrders: WorkOrderService,
  ) {}

  @Cron('0 * * * *', { name: 'pm-scheduler-hourly', timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    await this.runForNow(new Date());
  }

  /** Public entry-point for tests and ops scripts. */
  async runForNow(asOf: Date): Promise<{ opened: number; skipped: number; failures: number }> {
    const tenants = (await this.ds.query(
      `SELECT DISTINCT tenant_id AS id
         FROM preventive_maintenance_plan
        WHERE is_active = true`,
    )) as TenantRow[];

    let opened = 0;
    let skipped = 0;
    let failures = 0;

    for (const t of tenants) {
      try {
        const counts = await this.runForTenant(t.id, asOf);
        opened += counts.opened;
        skipped += counts.skipped;
      } catch (err) {
        failures++;
        this.logger.error(
          `[PMScheduler] tenant ${t.id} failed: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `[PMScheduler] completed asOf=${asOf.toISOString()} tenants=${tenants.length} opened=${opened} skipped=${skipped} failures=${failures}`,
    );
    return { opened, skipped, failures };
  }

  private async runForTenant(
    tenantId: string,
    asOf: Date,
  ): Promise<{ opened: number; skipped: number }> {
    return this.ds.transaction(async (manager) => {
      // D-03: set tenant GUC for RLS isolation.
      await manager.query(`SET LOCAL app.current_tenant = '${tenantId}'`);

      const plans = (await manager.query(
        `SELECT pmp.id AS pm_plan_id,
                pmp.tenant_id,
                pmp.equipment_id,
                pe.site_id,
                pmp.interval_unit,
                pmp.interval_value,
                pmp.last_executed_meter,
                pmp.next_due_at_utc,
                pe.hour_meter_current,
                pe.odometer_km_current
           FROM preventive_maintenance_plan pmp
           JOIN production_equipment pe ON pe.id = pmp.equipment_id
          WHERE pmp.is_active = true
            AND pmp.tenant_id = $1`,
        [tenantId],
      )) as PmCheckRow[];

      let opened = 0;
      let skipped = 0;

      for (const plan of plans) {
        const decision = await this.processPlan(plan, asOf);
        if (decision === 'opened') opened++;
        else if (decision !== 'not_due') skipped++;
      }

      return { opened, skipped };
    });
  }

  private async processPlan(plan: PmCheckRow, asOf: Date): Promise<Decision> {
    const dueResult = this.evaluateDue(plan, asOf);
    if (!dueResult) return 'not_due';
    if (dueResult.skip === 'missing_meter') {
      this.logger.warn(
        `[PMScheduler] tenant=${plan.tenant_id} pm_plan=${plan.pm_plan_id} decision=skipped_missing_meter unit=${plan.interval_unit}`,
      );
      return 'skipped_missing_meter';
    }

    const existing = await this.workOrders.findOpen({
      tenantId: plan.tenant_id,
      equipmentId: plan.equipment_id,
      type: 'preventive',
      pmPlanId: plan.pm_plan_id,
    });
    if (existing) {
      this.logger.log(
        `[PMScheduler] tenant=${plan.tenant_id} pm_plan=${plan.pm_plan_id} decision=skipped_existing wo=${existing.id}`,
      );
      return 'skipped_existing';
    }

    await this.workOrders.open({
      tenantId: plan.tenant_id,
      siteId: plan.site_id,
      equipmentId: plan.equipment_id,
      type: 'preventive',
      pmPlanId: plan.pm_plan_id,
      diagnosis: `PM due (${dueResult.dueReason}, overdue by ${dueResult.overdueBy})`,
      preventiveContext: {
        severity: dueResult.severity,
        dueReason: dueResult.dueReason,
        overdueBy: dueResult.overdueBy,
      },
    });
    this.logger.log(
      `[PMScheduler] tenant=${plan.tenant_id} pm_plan=${plan.pm_plan_id} decision=opened severity=${dueResult.severity} reason=${dueResult.dueReason} overdueBy=${dueResult.overdueBy}`,
    );
    return 'opened';
  }

  /**
   * Pure evaluation. Returns null if not due. Severity follows D-12.
   */
  evaluateDue(plan: PmCheckRow, asOf: Date): DueResult | null {
    if (plan.interval_unit === 'days') {
      if (!plan.next_due_at_utc) return null; // never scheduled — not due
      const due = new Date(plan.next_due_at_utc);
      if (asOf < due) return null;
      const overdueHours = (asOf.getTime() - due.getTime()) / 3_600_000;
      const overdueDays = overdueHours / 24;
      const severity: 'warning' | 'critical' = overdueDays > 7 ? 'critical' : 'warning';
      return { dueReason: 'days', overdueBy: Math.floor(overdueHours), severity };
    }

    if (plan.interval_unit === 'hours') {
      if (plan.hour_meter_current == null) {
        return { dueReason: 'hours', overdueBy: 0, severity: 'warning', skip: 'missing_meter' };
      }
      const current = Number(plan.hour_meter_current);
      const last = Number(plan.last_executed_meter ?? 0);
      const trigger = last + plan.interval_value;
      if (current < trigger) return null;
      const overdueBy = current - trigger;
      const overdueRatio = plan.interval_value > 0 ? overdueBy / plan.interval_value : 0;
      const severity: 'warning' | 'critical' = overdueRatio > 0.25 ? 'critical' : 'warning';
      return { dueReason: 'hours', overdueBy, severity };
    }

    // 'km'
    if (plan.odometer_km_current == null) {
      return { dueReason: 'km', overdueBy: 0, severity: 'warning', skip: 'missing_meter' };
    }
    const current = Number(plan.odometer_km_current);
    const last = Number(plan.last_executed_meter ?? 0);
    const trigger = last + plan.interval_value;
    if (current < trigger) return null;
    const overdueBy = current - trigger;
    const overdueRatio = plan.interval_value > 0 ? overdueBy / plan.interval_value : 0;
    const severity: 'warning' | 'critical' = overdueRatio > 0.25 ? 'critical' : 'warning';
    return { dueReason: 'km', overdueBy, severity };
  }
}
