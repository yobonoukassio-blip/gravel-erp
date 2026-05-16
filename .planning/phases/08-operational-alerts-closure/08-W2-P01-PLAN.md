---
phase: 08-operational-alerts-closure
plan: 08-W2-P01
title: "PreventiveMaintenanceSchedulerJob @Cron — hourly tenant fan-out, idempotency via findOpen, alert_rule seed"
wave: 2
requirements_covered: [ALT-01]
depends_on: [08-W1-P01, 08-W1-P02]
autonomous: true
files_modified:
  - apps/api/src/modules/maintenance/services/work-order.service.ts
  - apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts
  - apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts
  - apps/api/src/modules/maintenance/maintenance.module.ts
  - apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql
tasks:
  - id: T01
    title: "WorkOrderService.findOpen() — idempotency primitive"
  - id: T02
    title: "PreventiveMaintenanceSchedulerJob — @Cron hourly, tenant fan-out, three interval-unit paths, severity per D-12"
  - id: T03
    title: "PM-opened → Alert bridge handler + seed alert_rule rows per D-15 (incl. UPDATE of Phase-7 spare-part rule)"
  - id: T04
    title: "Extend WorkOrderService.close() to advance PM plan state (D-04)"
must_haves:
  truths:
    - "An @Cron decorator with schedule '0 * * * *' exists on PreventiveMaintenanceSchedulerJob and runs hourly (D-01)"
    - "Before opening any preventive WorkOrder, the job calls WorkOrderService.findOpen({equipmentId, type:'preventive', pmPlanId}) and skips if a row with status in ('open','in_progress') already exists (D-02)"
    - "The job iterates DISTINCT tenant_id values from preventive_maintenance_plan WHERE is_active=true and sets app.current_tenant per tenant before any data query (D-03)"
    - "For interval_unit='days' the job uses next_due_at_utc <= now() AT TIME ZONE 'UTC' (D-04)"
    - "For interval_unit='hours' the job compares production_equipment.hour_meter_current >= COALESCE(plan.last_executed_meter, 0) + plan.interval_value at runtime (D-04, D-05)"
    - "For interval_unit='km' the job compares production_equipment.odometer_km_current >= COALESCE(plan.last_executed_meter, 0) + plan.interval_value at runtime"
    - "Severity defaults to 'warning' (mapped to Alert.severity='high') and escalates to 'critical' when the overdue is > 7 days OR > 25% past the meter threshold (D-12)"
    - "Opening a preventive WO emits 'maintenance.work_order.preventive_opened' with payload { tenant_id, site_id, equipment_id, pm_plan_id, work_order_id, severity, due_reason, overdue_by } (D-17)"
    - "The alert_rule seed migration inserts exactly 3 NEW rules per D-15 AND issues an UPDATE that aligns the Phase-7 spare-part NULL-severity rule's role_codes to D-15 verbatim"
    - "alert_rule row event=maintenance.spare_part.threshold_crossed severity=NULL has role_codes = ['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE'] verbatim per D-15 (the Phase 7 seed used different codes; Phase 8 migration aligns it)"
    - "Closing a preventive WO advances PM plan next_due_at_utc/last_executed_meter atomically with the WO close (D-04) — without this the cron would re-open the same plan on every hourly tick after first close"
    - "After WO close, last_executed_meter is the snapshot the cron uses; cron's `current_meter - last_executed_meter >= interval_value` test re-evaluates correctly on subsequent ticks"
    - "Severity mapping is the canonical convention defined in 08-W1-P02 (see § 'Severity Mapping (canonical for Phase 8)') — handlers map event payload 'warning' → Alert.severity 'high', 'critical' → Alert.severity 'critical'. alert_rule.severity_filter='critical' rules trigger SMS; severity_filter=NULL rules trigger in_app+email only."
  artifacts:
    - path: apps/api/src/modules/maintenance/services/work-order.service.ts
      provides: "findOpen({equipmentId, type, pmPlanId}) method returning the first matching WO with status in ('open','in_progress') or null; close() advances linked PM plan state (D-04)"
      contains: "findOpen"
    - path: apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts
      provides: "Hourly @Cron job with three interval-unit paths, tenant fan-out, idempotency check, severity escalation, event emission"
      contains: "@Cron('0 * * * *'"
    - path: apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts
      provides: "Translates maintenance.work_order.preventive_opened into an Alert row deduped on 'pm:<pm_plan_id>:overdue'"
      contains: "@OnEvent('maintenance.work_order.preventive_opened')"
    - path: apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql
      provides: "Idempotent INSERT of the 3 NEW PM alert_rule rows from D-15 + UPDATE aligning Phase-7 spare-part NULL-severity rule role_codes to D-15"
      contains: "maintenance.work_order.preventive_opened"
  key_links:
    - from: maintenance/jobs/preventive-maintenance-scheduler.job.ts
      to: maintenance/services/work-order.service.ts
      via: "Calls findOpen() before each open() to enforce D-02 idempotency"
      pattern: "findOpen\\("
    - from: maintenance/services/work-order.service.ts
      to: alerts/alerts.event-handlers.ts (via EventEmitter2)
      via: "EventEmitter2 'maintenance.work_order.preventive_opened' emitted from inside open() when type='preventive'"
      pattern: "maintenance\\.work_order\\.preventive_opened"
    - from: maintenance/services/work-order.service.ts (close)
      to: maintenance/entities/preventive-maintenance-plan.entity.ts (next_due_at_utc, last_executed_meter, last_executed_at_utc)
      via: "Same-transaction UPDATE on preventive_maintenance_plan when closing a preventive WO (D-04)"
      pattern: "next_due_at_utc"
    - from: maintenance/event-handlers/pm-opened-alert.handler.ts
      to: alerts/alerts.service.ts
      via: "AlertsService.createFromEvent with dedupeKey 'pm:<pm_plan_id>:overdue'"
      pattern: "pm:\\$\\{.*\\}:overdue"
---

<objective>
Land the PreventiveMaintenanceSchedulerJob (ALT-01). This is the work that closes the operational silence on preventive maintenance: an hourly cron iterates every active tenant, finds PM plans whose interval has been crossed (by date, hours, or km), and opens a WorkOrder — idempotently, exactly once per crossing — then emits a domain event that materializes an Alert row in the maintenance manager's inbox.

This plan implements:
1. `WorkOrderService.findOpen()` — the idempotency primitive (D-02).
2. The cron job itself with the three interval-unit paths (D-04), tenant fan-out under `app.current_tenant` (D-03), severity escalation (D-12), and event emission (D-17).
3. A small alert bridge handler `pm-opened-alert.handler.ts` that subscribes to the new event and creates an Alert row.
4. A seed migration that adds the 3 NEW alert_rule rows from D-15 AND aligns the existing Phase-7 spare-part NULL-severity rule's role_codes to D-15 verbatim (Phase 7 seeded different roles).
5. **Task 4 (NEW)**: Extends `WorkOrderService.close()` to advance the linked PM plan's `next_due_at_utc` / `last_executed_meter` / `last_executed_at_utc` atomically with the WO close. Without this, the cron re-opens the same plan on every hourly tick after first close — the entire loop fails.

**Severity mapping convention:** see `08-W1-P02-PLAN.md` § "Severity Mapping (canonical for Phase 8)" — this plan's handlers and seed apply that mapping (event payload 'warning' → Alert.severity 'high'; 'critical' → 'critical'; alert_rule.severity_filter='critical' adds SMS; severity_filter=NULL covers all severities via in_app+email).

**File-conflict dependency:** Both this plan and W1-P02 modify `maintenance.module.ts`. W1-P02 must land first; this plan's `depends_on` includes both `08-W1-P01` (entity + meter columns) and `08-W1-P02` (AlertsModule wired into MaintenanceModule).

Output: 1 service method + 1 service method extension (close), 1 new job file, 1 new event-handler file, 1 migration, 1 module wiring update.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-operational-alerts-closure/08-CONTEXT.md
@.planning/phases/08-operational-alerts-closure/08-W1-P01-PLAN.md
@.planning/phases/08-operational-alerts-closure/08-W1-P02-PLAN.md
@apps/api/src/modules/maintenance/services/work-order.service.ts
@apps/api/src/modules/maintenance/entities/preventive-maintenance-plan.entity.ts
@apps/api/src/modules/maintenance/entities/work-order.entity.ts
@apps/api/src/modules/master-data/production-equipment.entity.ts
@apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts
@apps/api/src/modules/analytics/migrations/1718100000000__seed_alert_rules.sql
@apps/api/src/modules/maintenance/maintenance.module.ts
@apps/api/src/modules/alerts/alerts.service.ts

<interfaces>
<!-- W1-P01 backfilled hour_meter_current and added km_total_after wiring.
     The meter columns on production_equipment are the authoritative read source (D-05).
     W1-P02 imported AlertsModule into MaintenanceModule — this plan's PmOpenedAlertHandler
     can therefore inject AlertsService from that import (no second AlertsModule import needed). -->

From apps/api/src/modules/maintenance/entities/preventive-maintenance-plan.entity.ts:
```typescript
@Entity({ name: 'preventive_maintenance_plan' })
export class PreventiveMaintenancePlan {
  id!: string;
  tenantId!: string;          // tenant_id
  equipmentId!: string;       // equipment_id (FK production_equipment.id)
  label!: string;
  intervalUnit!: 'hours' | 'km' | 'days';
  intervalValue!: number;     // interval_value (int)
  lastExecutedMeter!: string | null;     // numeric(12,2)
  lastExecutedAtUtc!: Date | null;
  nextDueAtUtc!: Date | null;
  isActive!: boolean;
}
```
NOTE: No `siteId` directly on this entity. The job must JOIN to `production_equipment` to obtain `site_id` for the WorkOrder.open() call and the event payload.

From apps/api/src/modules/maintenance/entities/work-order.entity.ts:
```typescript
export class WorkOrder {
  id!: string;
  tenantId!: string;
  siteId!: string;
  equipmentId!: string;
  type!: 'corrective' | 'preventive';
  status!: 'open' | 'in_progress' | 'closed' | 'cancelled';
  diagnosis!: string | null;
  resolution!: string | null;
  pmPlanId!: string | null;   // pm_plan_id (FK preventive_maintenance_plan.id)
  technicianId!: string | null;
  downtimeMinutes!: number;
  laborHours!: string;
  openedAtUtc!: Date;
  closedAtUtc!: Date | null;
}
```

From apps/api/src/modules/maintenance/services/work-order.service.ts (current — only has open() and close()):
```typescript
async open(dto: { tenantId, siteId, equipmentId, type, diagnosis?, pmPlanId?, technicianId? }): Promise<WorkOrder>
async close(dto: { tenantId, workOrderId, resolution, downtimeMinutes, laborHours }): Promise<WorkOrder>
```
The existing `open()` emits `maintenance.work_order.opened`. We add an additional emission inside open() when `type='preventive'` so manually-opened preventive WOs also trigger the alert flow.

From apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts (REFERENCE PATTERN for tenant fan-out + @Cron):
- Uses `@nestjs/schedule` `@Cron` decorator with `{ name, timeZone: 'UTC' }`.
- Uses `@InjectDataSource() ds: DataSource` and `ds.query(...)` for raw SQL.
- Iterates tenants from `tenants WHERE status='active' AND archived_at IS NULL`.
- Logs `success/failure` counts at the end, never crashes the whole run.
- Phase 8 follows the SAME pattern.

From apps/api/src/modules/analytics/migrations/1718100000000__seed_alert_rules.sql (verified at planning time):
- Seeds `maintenance.spare_part.threshold_crossed` with `severity_filter = NULL`, channels `['in_app','email']`, role_codes `['RESPONSABLE_MAINTENANCE','CHEF_CARRIERE']` for tenant `24cd97f8-0170-453e-89da-e9213dd710d7`.
- D-15 requires the row to use role_codes `['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']`. Phase 8 migration issues a tenant-scoped UPDATE to align — this is non-destructive (rule stays; only role_codes change).
- Phase 8 also adds 3 NEW rules (the 2 preventive_opened rules + the critical spare-part rule).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (T01): WorkOrderService.findOpen — idempotency primitive</name>
  <read_first>
    - apps/api/src/modules/maintenance/services/work-order.service.ts (current state — only open() and close() exist)
    - apps/api/src/modules/maintenance/entities/work-order.entity.ts (status enum includes 'open' and 'in_progress')
    - 08-CONTEXT.md § D-02 verbatim: "Idempotency = avant POST WorkOrder, le job execute `WorkOrderService.findOpen({ equipmentId, type: 'preventive', pmPlanId })` qui retourne le premier WO avec `status IN ('open','in_progress')`. Si trouve, le job log 'PM already open' et skip. Pas de duplication"
  </read_first>
  <behavior>
    - Test 1: `findOpen({ tenantId, equipmentId, type:'preventive', pmPlanId })` returns the most recently opened WO that matches all four criteria AND has status 'open' OR 'in_progress'.
    - Test 2: When the matching WO has status 'closed' or 'cancelled', `findOpen` returns null.
    - Test 3: When no WO exists for that (equipment, pmPlan), returns null.
    - Test 4: tenantId mismatch (asking for tenant A while only tenant B has a matching WO) returns null — RLS-safe filter on the query.
    - Test 5: When two open WOs exist (degenerate state from a prior bug), the method returns the most recently opened (`ORDER BY opened_at_utc DESC LIMIT 1`).
  </behavior>
  <action>
    Per D-02 verbatim: "Idempotency = avant POST WorkOrder, le job execute `WorkOrderService.findOpen({ equipmentId, type: 'preventive', pmPlanId })` qui retourne le premier WO avec `status IN ('open','in_progress')`. Si trouve, le job log 'PM already open' et skip. Pas de duplication, le WO ouvert reste pertinent jusqu'a sa fermeture."

    Step 1 — Edit `apps/api/src/modules/maintenance/services/work-order.service.ts`. Add this method between `open()` and `close()`:

    ```typescript
    /**
     * Idempotency primitive for the preventive-maintenance scheduler (D-02).
     * Returns the most recently opened WO for the given (equipment, pmPlan,
     * type) tuple with status in ('open','in_progress'), or null.
     */
    async findOpen(criteria: {
      tenantId: string;
      equipmentId: string;
      type: WorkOrderType;
      pmPlanId?: string | null;
    }): Promise<WorkOrder | null> {
      const qb = this.ds
        .createQueryBuilder(WorkOrder, 'wo')
        .where('wo.tenant_id = :tenantId', { tenantId: criteria.tenantId })
        .andWhere('wo.equipment_id = :equipmentId', { equipmentId: criteria.equipmentId })
        .andWhere('wo.type = :type', { type: criteria.type })
        .andWhere(`wo.status IN ('open','in_progress')`)
        .orderBy('wo.opened_at_utc', 'DESC')
        .limit(1);

      if (criteria.pmPlanId === null || criteria.pmPlanId === undefined) {
        qb.andWhere('wo.pm_plan_id IS NULL');
      } else {
        qb.andWhere('wo.pm_plan_id = :pmPlanId', { pmPlanId: criteria.pmPlanId });
      }

      const row = await qb.getOne();
      return row ?? null;
    }
    ```

    Also extend `open()` (existing method) so that when `dto.type === 'preventive'`, after the existing `maintenance.work_order.opened` emit, it ALSO emits `maintenance.work_order.preventive_opened`. To keep this task scoped, we ONLY add a thin extra param to `open()`:

    ```typescript
    interface OpenWorkOrderDto {
      tenantId: string;
      siteId: string;
      equipmentId: string;
      type: WorkOrderType;
      diagnosis?: string;
      pmPlanId?: string;
      technicianId?: string;
      // NEW — populated only by the PM scheduler (T02). Optional everywhere else.
      preventiveContext?: {
        severity: 'warning' | 'critical';
        dueReason: 'hours' | 'km' | 'days';
        overdueBy: number; // hours overdue OR meter-units overdue (caller decides)
      };
    }
    ```

    And inside `open()`, after the existing `this.events.emit('maintenance.work_order.opened', ...)`, add:

    ```typescript
    if (dto.type === 'preventive') {
      this.events.emit('maintenance.work_order.preventive_opened', {
        tenant_id: dto.tenantId,
        site_id: dto.siteId,
        equipment_id: dto.equipmentId,
        pm_plan_id: dto.pmPlanId ?? null,
        work_order_id: saved.id,
        severity: dto.preventiveContext?.severity ?? 'warning',
        due_reason: dto.preventiveContext?.dueReason ?? null,
        overdue_by: dto.preventiveContext?.overdueBy ?? null,
      });
    }
    ```

    Step 2 — Update / add unit test in `apps/api/src/modules/maintenance/services/work-order.service.spec.ts` covering Tests 1–5 from `<behavior>`. Use a real DataSource against an in-memory sqlite, OR a mocked QueryBuilder with `jest.fn()` returning the expected rows.
  </action>
  <verify>
    <automated>grep -q "async findOpen" apps/api/src/modules/maintenance/services/work-order.service.ts &amp;&amp; grep -q "status IN ('open','in_progress')" apps/api/src/modules/maintenance/services/work-order.service.ts &amp;&amp; grep -q "maintenance.work_order.preventive_opened" apps/api/src/modules/maintenance/services/work-order.service.ts &amp;&amp; grep -q "preventiveContext" apps/api/src/modules/maintenance/services/work-order.service.ts &amp;&amp; pnpm --filter @gravel/api test -- work-order.service.spec.ts &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    `findOpen()` exists and returns the latest open/in_progress WO matching the tuple. `open()` accepts an optional `preventiveContext` and emits `maintenance.work_order.preventive_opened` with the full D-17 payload whenever a preventive WO is opened. All 5 behavior tests pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (T02): PreventiveMaintenanceSchedulerJob — hourly @Cron, tenant fan-out, three interval paths, severity escalation</name>
  <read_first>
    - apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts (canonical pattern — copy structure)
    - apps/api/src/modules/maintenance/services/work-order.service.ts (after T01 — findOpen + open exist)
    - apps/api/src/modules/maintenance/entities/preventive-maintenance-plan.entity.ts (interval_unit, interval_value, last_executed_meter, next_due_at_utc)
    - apps/api/src/modules/master-data/production-equipment.entity.ts (after W1-P01 T01 — hour_meter_current, odometer_km_current exposed)
    - 08-CONTEXT.md § D-01 (cron schedule), D-02 (idempotency), D-03 (tenant fan-out), D-04 (next_due_at_utc calc), D-12 (severity escalation), D-17 (event payload)
    - apps/api/src/modules/maintenance/maintenance.module.ts (current — no ScheduleModule import yet)
  </read_first>
  <behavior>
    - Test 1: Job is decorated with `@Cron('0 * * * *', { name: 'pm-scheduler-hourly', timeZone: 'UTC' })`. Asserted via `Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', PreventiveMaintenanceSchedulerJob.prototype, 'handleCron')` returning an object whose `cronTime === '0 * * * *'` and `name === 'pm-scheduler-hourly'`.
    - Test 2: `runForNow(asOf: Date)` (the testable public method) iterates active tenants, sets `app.current_tenant`, queries active PM plans, and opens exactly one WO per due plan.
    - Test 3: When a plan with `interval_unit='days'`, `next_due_at_utc='2026-05-16T10:00:00Z'` is evaluated at `2026-05-16T11:00:00Z`, a preventive WO is opened with `dueReason: 'days'` and `overdueBy: 1` (hours overdue).
    - Test 4: When a plan with `interval_unit='hours', interval_value=250, last_executed_meter='1000'` and the equipment has `hour_meter_current='1251'`, a preventive WO is opened with `dueReason: 'hours'` and `overdueBy: 1` (meter units past the trigger).
    - Test 5: When a plan with `interval_unit='km', interval_value=10000, last_executed_meter='50000'` and equipment `odometer_km_current='61000'`, opens WO with `dueReason: 'km'`, `overdueBy: 1000`.
    - Test 6: When `findOpen` returns an existing WO, the job logs `decision: 'skipped_existing'` with `tenant_id` and `pm_plan_id` in the structured log, AND does NOT call `open()` (assert via spy that call count is 0 for that plan).
    - Test 7: Severity is `'critical'` when `now() - next_due_at_utc > 7 days` (days path) OR `overdueRatio > 0.25` (meter paths) per D-12. Otherwise `'warning'`.
    - Test 8: When the cron runs and one tenant's queries throw, the job still processes the remaining tenants (try/catch per tenant, logged failureCount in the summary line — same resilience pattern as CostPerTonAggregatorJob).
    - Test 9: For a plan whose equipment row has `hour_meter_current IS NULL`, the plan is SKIPPED (cannot evaluate) and logged with `decision: 'skipped_missing_meter'`. No exception thrown.
  </behavior>
  <action>
    Per D-01, D-03, D-04, D-12, D-17 (see read_first; verbatim quotes preserved in prior plan iterations).

    Step 1 — Create `apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts`:

    ```typescript
    import { Injectable, Logger } from '@nestjs/common';
    import { Cron } from '@nestjs/schedule';
    import { InjectDataSource } from '@nestjs/typeorm';
    import { DataSource } from 'typeorm';
    import { WorkOrderService } from '../services/work-order.service';

    interface TenantRow { id: string; }
    interface PmCheckRow {
      pm_plan_id: string;
      tenant_id: string;
      equipment_id: string;
      site_id: string;
      interval_unit: 'hours' | 'km' | 'days';
      interval_value: number;
      last_executed_meter: string | null;
      next_due_at_utc: Date | null;
      hour_meter_current: string | null;
      odometer_km_current: string | null;
    }

    type Decision = 'opened' | 'skipped_existing' | 'skipped_missing_meter' | 'not_due';

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
      private evaluateDue(
        plan: PmCheckRow,
        asOf: Date,
      ): null | { dueReason: 'hours' | 'km' | 'days'; overdueBy: number; severity: 'warning' | 'critical'; skip?: 'missing_meter' } {
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
    ```

    Step 2 — Edit `apps/api/src/modules/maintenance/maintenance.module.ts`:
    - Add `import { ScheduleModule } from '@nestjs/schedule';`
    - Add `import { PreventiveMaintenanceSchedulerJob } from './jobs/preventive-maintenance-scheduler.job';`
    - Add `ScheduleModule.forRoot()` to imports (idempotent — already in AppModule, but the local import in the maintenance feature module mirrors the pattern in `fuel.module.ts` and `stockpile.module.ts`).
    - Add `PreventiveMaintenanceSchedulerJob` to providers.

    Step 3 — Create `apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.spec.ts` covering Tests 1–9 from `<behavior>`. Mock `DataSource.query`, `DataSource.transaction`, and `WorkOrderService` (use `jest.Mocked<WorkOrderService>` with `findOpen.mockResolvedValue(null)` for the "open" case and `.mockResolvedValue(existingWo)` for the "skip_existing" case). Drive Test 1 ONLY by reading the `Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', PreventiveMaintenanceSchedulerJob.prototype, 'handleCron')` and asserting the returned object (cronTime '0 * * * *', name 'pm-scheduler-hourly'). Do NOT fall back to grep — the metadata assertion is the required signal.
  </action>
  <verify>
    <automated>grep -q "@Cron('0 \* \* \* \*'" apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts &amp;&amp; grep -q "findOpen" apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts &amp;&amp; grep -q "SET LOCAL app.current_tenant" apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts &amp;&amp; grep -q "skipped_existing" apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts &amp;&amp; grep -q "skipped_missing_meter" apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts &amp;&amp; grep -q "overdueRatio > 0.25" apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts &amp;&amp; grep -q "PreventiveMaintenanceSchedulerJob" apps/api/src/modules/maintenance/maintenance.module.ts &amp;&amp; pnpm --filter @gravel/api test -- preventive-maintenance-scheduler.job.spec.ts &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    Job exists with `@Cron('0 * * * *', ...)`. Tenant fan-out under `SET LOCAL app.current_tenant`. Three interval-unit paths implemented. Idempotency via `WorkOrderService.findOpen()` enforced. Severity escalation per D-12. Per-tenant try/catch resilience. Log lines include `tenant_id`, `pm_plan_id`, and `decision`. All 9 behavior tests pass — Test 1 specifically via `Reflect.getMetadata`, not grep.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3 (T03): PM-opened → Alert bridge handler + alert_rule seed (3 NEW rules + UPDATE of Phase-7 spare-part rule)</name>
  <read_first>
    - apps/api/src/modules/alerts/alerts.event-handlers.ts (pattern — already imported in AlertsModule providers; we add a NEW file co-located in maintenance/ to keep concerns close to source)
    - apps/api/src/modules/analytics/migrations/1718100000000__seed_alert_rules.sql (existing seeded rules — Phase 7 used role_codes ['RESPONSABLE_MAINTENANCE','CHEF_CARRIERE'] for the spare-part NULL rule; D-15 says ['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE'] — Phase 8 migration aligns via UPDATE)
    - apps/api/src/modules/alerts/alert.entity.ts (Alert.severity = 'low'|'medium'|'high'|'critical')
    - apps/api/src/modules/analytics/entities/alert-rule.entity.ts (severityFilter = 'info'|'warning'|'critical' — NULL means all severities)
    - 08-CONTEXT.md § D-15 verbatim (4 rules listed)
    - 08-CONTEXT.md § D-14: "Recipients = `alert_rule.role_codes` UNIQUEMENT, jamais `user_ids` individuels"
    - 08-W1-P02-PLAN.md § "Severity Mapping (canonical for Phase 8)" — the mapping handlers apply
  </read_first>
  <behavior>
    - Test 1: Emitting `maintenance.work_order.preventive_opened` with payload `{ tenant_id:T, site_id:S, equipment_id:E, pm_plan_id:P, work_order_id:WO, severity:'warning', due_reason:'hours', overdue_by:25 }` produces exactly one Alert row with `source_event_type='maintenance.work_order.preventive_opened', tenant_id=T, site_id=S, dedupe_key='pm:P:overdue', severity='high', status='open'`.
    - Test 2: When the payload `severity` is `'critical'`, the Alert row has `severity='critical'`.
    - Test 3: Emitting the same event twice while the first alert is OPEN does NOT create a second row.
    - Test 4: When `pm_plan_id` is null in the payload (manual preventive WO without plan), dedupeKey falls back to `pm:wo:<work_order_id>` to avoid colliding with other manual WOs.
    - Test 5: After running migration `1719100200000__phase08_seed_pm_alert_rules.sql`:
      - `SELECT count(*) FROM alert_rule WHERE event_type='maintenance.work_order.preventive_opened'` returns >= 2.
      - `SELECT count(*) FROM alert_rule WHERE event_type='maintenance.work_order.preventive_opened' AND severity_filter='critical'` returns >= 1.
      - `SELECT count(*) FROM alert_rule WHERE event_type='maintenance.spare_part.threshold_crossed' AND severity_filter='critical'` returns >= 1.
      - `SELECT role_codes FROM alert_rule WHERE event_type='maintenance.spare_part.threshold_crossed' AND severity_filter IS NULL` returns `{MAINTENANCE_MANAGER,GESTIONNAIRE_STOCK,DIRECTEUR_SITE}` exactly (post-UPDATE).
    - Test 6: Migration is idempotent (NOT EXISTS guards on INSERT; UPDATE is naturally idempotent for the role_codes alignment); running twice does not duplicate rows nor toggle role_codes back.
  </behavior>
  <action>
    Per D-14 verbatim: "Recipients = `alert_rule.role_codes` UNIQUEMENT, jamais `user_ids` individuels. Les `role_codes` survivent aux mouvements RH ; les `user_ids` deviennent obsoletes a chaque depart/embauche."

    Per D-15 verbatim, the 4 required rules:
    - `event_type = 'maintenance.work_order.preventive_opened'`, severity_filter = null, channels = ['in_app','email'], role_codes = ['MAINTENANCE_MANAGER','MECANICIEN_CHEF','DIRECTEUR_SITE']  ← NEW (this migration)
    - `event_type = 'maintenance.work_order.preventive_opened'`, severity_filter = 'critical', channels = ['in_app','email','sms'], role_codes = ['DIRECTEUR_SITE','DIRECTION_GROUPE']  ← NEW (this migration)
    - `event_type = 'maintenance.spare_part.threshold_crossed'`, severity_filter = null, channels = ['in_app','email'], role_codes = ['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']  ← EXISTS from Phase 7 with DIFFERENT role_codes; this migration ISSUES an UPDATE to align to D-15 verbatim.
    - `event_type = 'maintenance.spare_part.threshold_crossed'`, severity_filter = 'critical', channels = ['in_app','email','sms'], role_codes = ['DIRECTEUR_SITE']  ← NEW (this migration)

    SEVERITY MAPPING: see `08-W1-P02-PLAN.md` § "Severity Mapping (canonical for Phase 8)" — payload 'warning' → Alert.severity 'high'; 'critical' → 'critical'. Rules with `severity_filter='critical'` only match Alert.severity='critical' (the dispatcher convention adds SMS only on those). Rules with `severity_filter IS NULL` match BOTH high and critical Alerts (in_app + email).

    Step 1 — Create `apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts`:

    ```typescript
    import { Injectable } from '@nestjs/common';
    import { OnEvent } from '@nestjs/event-emitter';
    import { AlertsService } from '../../alerts/alerts.service';
    import type { AlertSeverity } from '../../alerts/alert.entity';

    interface PreventiveOpenedEvent {
      tenant_id: string;
      site_id: string;
      equipment_id: string;
      pm_plan_id: string | null;
      work_order_id: string;
      severity: 'warning' | 'critical';
      due_reason: 'hours' | 'km' | 'days' | null;
      overdue_by: number | null;
    }

    /**
     * Bridge handler (ALT-01, D-10 dedupe convention, D-17 event shape).
     * Lives in maintenance/ to keep concerns close to source. Translates the
     * preventive_opened domain event into an Alert row.
     *
     * Severity mapping per `08-W1-P02-PLAN.md` § "Severity Mapping (canonical
     * for Phase 8)": payload 'warning' → Alert 'high'; 'critical' → 'critical'.
     */
    @Injectable()
    export class PmOpenedAlertHandler {
      constructor(private readonly alerts: AlertsService) {}

      @OnEvent('maintenance.work_order.preventive_opened')
      async onPreventiveOpened(evt: PreventiveOpenedEvent): Promise<void> {
        const alertSeverity: AlertSeverity =
          evt.severity === 'critical' ? 'critical' : 'high';

        // Dedupe: 1 open alert per pm_plan overdue cycle. Falls back to
        // work_order_id when no plan (manual preventive WO).
        const dedupeKey = evt.pm_plan_id
          ? `pm:${evt.pm_plan_id}:overdue`
          : `pm:wo:${evt.work_order_id}`;

        await this.alerts.createFromEvent({
          tenantId: evt.tenant_id,
          siteId: evt.site_id,
          sourceEventType: 'maintenance.work_order.preventive_opened',
          sourceEventId: evt.work_order_id,
          dedupeKey,
          severity: alertSeverity,
          payload: {
            site_id: evt.site_id,
            equipment_id: evt.equipment_id,
            pm_plan_id: evt.pm_plan_id,
            work_order_id: evt.work_order_id,
            severity: evt.severity,
            due_reason: evt.due_reason,
            overdue_by: evt.overdue_by,
          },
        });
      }
    }
    ```

    Step 2 — Edit `apps/api/src/modules/maintenance/maintenance.module.ts`:
    - Import `PmOpenedAlertHandler` and add to `providers`.
    - `AlertsModule` is already imported by W1-P02 T02 (this plan's `depends_on` includes W1-P02 — file ordering on `maintenance.module.ts` is enforced via that dependency).

    Step 3 — Create `apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql`:

    ```sql
    -- Phase 08 W2-P01 T03 — Seed PM-opened alert_rule rows (D-14, D-15)
    -- AND align the Phase-7 spare-part NULL-severity rule's role_codes
    -- to the D-15 verbatim list (Phase 7 used a different set).
    --
    -- Three NEW rows inserted by Phase 8 (with NOT EXISTS guards):
    --   1. preventive_opened, severity_filter=NULL    -> in_app + email
    --   2. preventive_opened, severity_filter=critical -> in_app + email + sms
    --   3. spare_part.threshold_crossed, severity_filter=critical -> in_app + email + sms
    --
    -- One UPDATE issued by Phase 8 (idempotent — re-running produces the same role_codes):
    --   4. spare_part.threshold_crossed, severity_filter=NULL — role_codes aligned to D-15.
    --
    -- Idempotency: NOT EXISTS guard on (tenant_id, event_type, severity_filter)
    -- for the INSERT — same guard used by Phase 7's seed migration.

    -- Step A: Insert the 3 NEW rules.
    INSERT INTO alert_rule (
      id, tenant_id, event_type, severity_filter, channels, role_codes, user_ids, is_active
    )
    SELECT
      gen_random_uuid(),
      v.tenant_id::uuid,
      v.event_type,
      v.severity_filter,
      v.channels::varchar(20)[],
      v.role_codes::varchar(50)[],
      '{}'::uuid[],
      true
    FROM (VALUES
      -- 1. PM preventive opened — any severity
      (
        '24cd97f8-0170-453e-89da-e9213dd710d7',
        'maintenance.work_order.preventive_opened',
        NULL::varchar(20),
        ARRAY['in_app','email'],
        ARRAY['MAINTENANCE_MANAGER','MECANICIEN_CHEF','DIRECTEUR_SITE']
      ),
      -- 2. PM preventive opened — critical only, includes SMS
      (
        '24cd97f8-0170-453e-89da-e9213dd710d7',
        'maintenance.work_order.preventive_opened',
        'critical',
        ARRAY['in_app','email','sms'],
        ARRAY['DIRECTEUR_SITE','DIRECTION_GROUPE']
      ),
      -- 3. Spare part low — critical only, includes SMS
      (
        '24cd97f8-0170-453e-89da-e9213dd710d7',
        'maintenance.spare_part.threshold_crossed',
        'critical',
        ARRAY['in_app','email','sms'],
        ARRAY['DIRECTEUR_SITE']
      )
    ) AS v(tenant_id, event_type, severity_filter, channels, role_codes)
    WHERE NOT EXISTS (
      SELECT 1 FROM alert_rule ar
      WHERE ar.tenant_id = v.tenant_id::uuid
        AND ar.event_type = v.event_type
        AND COALESCE(ar.severity_filter, '__null__') = COALESCE(v.severity_filter, '__null__')
    );

    -- Step B: Align Phase-7 spare-part NULL-severity rule's role_codes to D-15 verbatim.
    -- Phase 7 seeded ['RESPONSABLE_MAINTENANCE','CHEF_CARRIERE'] which contradicts D-15.
    -- This UPDATE is idempotent: re-running produces the same role_codes.
    UPDATE alert_rule
    SET role_codes = ARRAY['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']::varchar(50)[]
    WHERE event_type = 'maintenance.spare_part.threshold_crossed'
      AND severity_filter IS NULL;
    ```

    NOTE on D-16: "SMS channel = present dans les regles `critical` mais le dispatcher reste stub (Phase 9 NTF-02 livre la vraie integration Twilio/Vonage)."

    Step 4 — Add unit test `apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.spec.ts` covering Tests 1–4 from `<behavior>`. Mock `AlertsService.createFromEvent` and assert it is called with the expected dedupeKey, severity, and payload.

    Step 5 — Add an integration test (or document a manual SQL smoke test) that runs the migration twice against a snapshot DB and asserts Tests 5–6:
    - count(preventive_opened) = 2
    - count(preventive_opened, critical) = 1
    - count(spare_part.threshold_crossed, critical) = 1
    - role_codes for the (spare_part.threshold_crossed, NULL) row equals `{MAINTENANCE_MANAGER,GESTIONNAIRE_STOCK,DIRECTEUR_SITE}`.
  </action>
  <verify>
    <automated>grep -q "@OnEvent('maintenance.work_order.preventive_opened')" apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts &amp;&amp; grep -q "pm:\${evt.pm_plan_id}:overdue" apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts &amp;&amp; grep -q "PmOpenedAlertHandler" apps/api/src/modules/maintenance/maintenance.module.ts &amp;&amp; grep -q "maintenance.work_order.preventive_opened" apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql &amp;&amp; grep -q "UPDATE alert_rule" apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql &amp;&amp; grep -q "MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE" apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql &amp;&amp; pnpm --filter @gravel/api test -- pm-opened-alert.handler.spec.ts &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    `PmOpenedAlertHandler` subscribes to `maintenance.work_order.preventive_opened` and creates one Alert per pm_plan overdue cycle. Module providers updated. Migration seeds the 3 new rules from D-15 idempotently AND aligns the Phase-7 spare-part NULL-severity rule's role_codes to D-15 verbatim. All 6 behavior tests pass.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4 (T04): Extend WorkOrderService.close() to advance PM plan state (D-04)</name>
  <read_first>
    - apps/api/src/modules/maintenance/services/work-order.service.ts (existing close() method)
    - apps/api/src/modules/maintenance/entities/preventive-maintenance-plan.entity.ts (fields to update: last_executed_at_utc, last_executed_meter, next_due_at_utc)
    - apps/api/src/modules/master-data/production-equipment.entity.ts (read current hour_meter_current / odometer_km_current)
    - 08-CONTEXT.md § D-04 verbatim policy
    - apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts (after T02 — understand the cron's read pattern so the close-side write aligns with the cron's expectations)
  </read_first>
  <behavior>
    - Test 1: Closing a preventive WO with `pmPlanId != null` and the linked plan having `intervalUnit='days', interval_value=30`, asserts after close: PM plan's `next_due_at_utc - now()` is between `interval '29 days 23 hours'` and `interval '30 days 1 hour'`, AND `last_executed_at_utc` is within 1 second of `now()`, AND `last_executed_meter` is NULL (days-based plan does not snapshot meter).
    - Test 2: Closing a preventive WO with `intervalUnit='hours', interval_value=250` where the linked equipment has `hour_meter_current='1500.00'`, asserts after close: PM plan's `last_executed_meter == '1500.00'`, `next_due_at_utc IS NULL`, `last_executed_at_utc` is set to ~now.
    - Test 3: Closing a preventive WO with `intervalUnit='km'` where equipment has `odometer_km_current='61500.00'`, asserts after close: PM plan's `last_executed_meter == '61500.00'`, `next_due_at_utc IS NULL`.
    - Test 4: Closing a CORRECTIVE WO (type='corrective', pm_plan_id=null) — PM plan table is NOT touched. No exception.
    - Test 5: Closing a preventive WO whose pm_plan_id no longer exists (orphan, deleted plan) — the close succeeds, no exception thrown, no UPDATE issued against preventive_maintenance_plan.
    - Test 6: End-to-end loop test: a preventive WO is opened by the T02 cron tick with `intervalUnit='hours', interval_value=250, last_executed_meter='1000', equipment.hour_meter_current='1260'`. Closing the WO with this task's extended close() sets `last_executed_meter='1260'`. Running the cron a second time (without raising the meter further) → NO new WO is opened (the trigger `1000+250 > 1260` is now `1260+250 > 1260` = false).
    - Test 7: All UPDATEs run inside the same EntityManager / transaction as the WO close — if the WO close UPDATE rolls back, the PM plan UPDATE rolls back too.
  </behavior>
  <action>
    Per D-04 verbatim: "Pour `intervalType='days'`, persiste `nextDueAtUtc = lastExecutedAtUtc + intervalValue days` apres chaque WorkOrder ferme. Pour `hours` ou `km`, le champ reste null ; le job compare directement `production_equipment.current_hours/km` >= `lastExecutedMeter + intervalValue` au runtime."

    Without this task, the cron's idempotency check (`findOpen` returns null after WO close) would succeed BUT the trigger condition for hours/km plans would never advance: `current_meter (1500) >= last_executed_meter (1000) + interval_value (250)` stays true. Result: every hourly cron tick would re-open the same PM (blocked by findOpen only while the WO is open, but immediately re-opened after close). The whole loop fails.

    Step 1 — Edit `apps/api/src/modules/maintenance/services/work-order.service.ts` to extend `close()`:

    ```typescript
    async close(dto: {
      tenantId: string;
      workOrderId: string;
      resolution: string;
      downtimeMinutes: number;
      laborHours: string;
    }): Promise<WorkOrder> {
      return this.ds.transaction(async (manager: EntityManager) => {
        // ... existing close logic: load WO, update status='closed', closed_at_utc=now, etc.
        const wo = await manager.findOne(WorkOrder, {
          where: { id: dto.workOrderId, tenantId: dto.tenantId },
        });
        if (!wo) throw new NotFoundException(`WorkOrder ${dto.workOrderId}`);

        // existing UPDATE of WO row …

        // NEW (D-04): if preventive WO with a plan, advance plan state.
        if (wo.type === 'preventive' && wo.pmPlanId) {
          await this.advancePmPlanState(manager, dto.tenantId, wo);
        }

        // existing emit of maintenance.work_order.closed …
        return reloadedWo;
      });
    }

    private async advancePmPlanState(
      manager: EntityManager,
      tenantId: string,
      wo: WorkOrder,
    ): Promise<void> {
      const plan = await manager.findOne(PreventiveMaintenancePlan, {
        where: { id: wo.pmPlanId!, tenantId },
      });
      if (!plan) {
        // Orphan WO — plan deleted. No-op, do not throw.
        this.logger.warn(
          `[WorkOrderService.close] preventive WO ${wo.id} references missing pm_plan ${wo.pmPlanId}; skipping plan-state advance.`,
        );
        return;
      }

      const equipment = await manager.findOne(ProductionEquipment, {
        where: { id: wo.equipmentId, tenantId },
      });

      const now = new Date();
      const updates: Partial<PreventiveMaintenancePlan> = {
        lastExecutedAtUtc: now,
      };

      if (plan.intervalUnit === 'days') {
        // D-04: persist next_due_at_utc = now + interval_value days.
        const next = new Date(now);
        next.setUTCDate(next.getUTCDate() + plan.intervalValue);
        updates.nextDueAtUtc = next;
        updates.lastExecutedMeter = null; // days-based plan does not snapshot meter
      } else if (plan.intervalUnit === 'hours') {
        updates.lastExecutedMeter = equipment?.hourMeterCurrent ?? plan.lastExecutedMeter;
        updates.nextDueAtUtc = null;
      } else {
        // 'km'
        updates.lastExecutedMeter = equipment?.odometerKmCurrent ?? plan.lastExecutedMeter;
        updates.nextDueAtUtc = null;
      }

      await manager.update(
        PreventiveMaintenancePlan,
        { id: plan.id, tenantId },
        updates,
      );
    }
    ```

    NOTE: ProductionEquipment must be imported. `PreventiveMaintenancePlan` is already imported. The exact placement of the new logic inside the existing transaction block depends on the current close() implementation — the executor reads `work-order.service.ts` line-by-line and inserts the call to `advancePmPlanState` AFTER the WO row UPDATE but BEFORE the closed event emit, all within the same `manager.transaction` callback.

    Step 2 — Update `apps/api/src/modules/maintenance/services/work-order.service.spec.ts` (or extend the T01 test file created earlier) to cover Tests 1–7 from `<behavior>`. Tests 1–3 and 5 are unit-level (mocked EntityManager with `findOne` returning fixtures, `update` recording the args). Test 6 is the end-to-end loop — preferably an integration test that:
      1. seeds a PM plan + equipment row in a test DB,
      2. invokes `PreventiveMaintenanceSchedulerJob.runForNow(now)` → opens WO,
      3. invokes `WorkOrderService.close({ workOrderId: opened.id, ... })`,
      4. invokes `runForNow(now)` again → expects `opened: 0`.
    Test 7 (transactionality) — use a forced throw inside the same tx and assert the PM plan row is NOT updated after rollback.
  </action>
  <verify>
    <automated>grep -q "last_executed_at_utc\|lastExecutedAtUtc" apps/api/src/modules/maintenance/services/work-order.service.ts &amp;&amp; grep -q "next_due_at_utc\|nextDueAtUtc" apps/api/src/modules/maintenance/services/work-order.service.ts &amp;&amp; grep -q "advancePmPlanState\|advancePmPlan" apps/api/src/modules/maintenance/services/work-order.service.ts &amp;&amp; pnpm --filter @gravel/api test -- work-order.service.spec.ts &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    Closing a preventive WO advances the linked PM plan's `last_executed_at_utc`, `last_executed_meter` (if applicable), and `next_due_at_utc` (if days-based). The cron from Task 2 no longer re-opens the same PM after its first close (verified end-to-end by Test 6: close the WO created in Task 2's integration test, then run the cron tick again, assert no new WO is created). All 7 behavior tests pass.
  </done>
</task>

</tasks>

<verification>
After all four tasks:
1. `pnpm --filter @gravel/api tsc --noEmit` exits 0.
2. `pnpm --filter @gravel/api test -- work-order.service.spec.ts preventive-maintenance-scheduler.job.spec.ts pm-opened-alert.handler.spec.ts` exits 0.
3. `grep -n "@Cron('0 \* \* \* \*'" apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts` returns 1 line.
4. End-to-end smoke (manual, documented): seed a PreventiveMaintenancePlan with `interval_unit='hours', interval_value=250, last_executed_meter='1000'`. Force `production_equipment.hour_meter_current='1260'` via SQL. Call the job's `runForNow(new Date())` from a one-off script. Verify a row appears in `work_order` with `type='preventive', pm_plan_id=<id>, status='open'` AND a row in `alert` with `dedupe_key='pm:<id>:overdue', status='open', severity='high'`. Close that WO via WorkOrderService.close() → verify the linked PM plan now has `last_executed_meter='1260.00'` AND `last_executed_at_utc IS NOT NULL`. Calling `runForNow` again does NOT create a second WO (idempotency D-02 — but more importantly the trigger condition has been advanced past `current_meter`).
5. Migration runs cleanly: `psql -c "SELECT count(*) FROM alert_rule WHERE event_type='maintenance.work_order.preventive_opened'"` returns 2; `SELECT role_codes FROM alert_rule WHERE event_type='maintenance.spare_part.threshold_crossed' AND severity_filter IS NULL` returns `{MAINTENANCE_MANAGER,GESTIONNAIRE_STOCK,DIRECTEUR_SITE}`.
</verification>

<success_criteria>
- The hourly cron exists and runs without crashing for 24 continuous hours (observable in logs).
- Quand l'intervalle PM d'un equipement est franchi (heures moteur, km, ou date calendaire), un WorkOrder apparait automatiquement dans l'inbox maintenance sans action humaine.
- Calling the job twice with no state change does NOT create a duplicate WO (idempotency via `findOpen()` per D-02).
- Closing a preventive WO atomically advances the linked PM plan's `last_executed_at_utc`, `last_executed_meter` (when applicable), and `next_due_at_utc` (days-based) per D-04 — the next cron tick correctly recognises the plan as no longer due.
- The job iterates tenants under `SET LOCAL app.current_tenant` (D-03) — proven by the test that asserts `manager.query` is called with that SQL before any plan query.
- Severity escalates from warning to critical correctly per D-12.
- The new `maintenance.work_order.preventive_opened` event is emitted with full D-17 payload and produces exactly one OPEN Alert row per pm_plan cycle (deduped on `pm:<pm_plan_id>:overdue`).
- After migration, `alert_rule` contains the 4 rows from D-15: 2 NEW preventive_opened rules, 1 NEW critical spare-part rule, and the Phase-7 spare-part NULL-severity rule with its role_codes ALIGNED to D-15 verbatim (`MAINTENANCE_MANAGER, GESTIONNAIRE_STOCK, DIRECTEUR_SITE`).
- No regression to existing work-order behavior: corrective close path untouched; orphan-plan close path is a no-op.
</success_criteria>

<output>
After completion, create `.planning/phases/08-operational-alerts-closure/08-W2-P01-SUMMARY.md` listing files modified, tests added, the verified end-to-end flow (cron → findOpen → open → preventive_opened event → Alert row → close → plan state advanced → cron does NOT re-open), the actual mapping used between payload severity (warning|critical) and Alert.severity enum (high|critical), and the role_codes alignment applied to the Phase-7 spare-part rule.
</output>
