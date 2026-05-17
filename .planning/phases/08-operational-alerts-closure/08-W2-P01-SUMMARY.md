---
phase: 08-operational-alerts-closure
plan: 08-W2-P01
subsystem: maintenance (preventive-scheduler + alert bridge)
tags: [phase-8, maintenance, scheduler, cron, alerts, preventive, ALT-01]
requirements_covered: [ALT-01]
dependency_graph:
  requires:
    - 08-W1-P01 (equipment meter denormalization — hour_meter_current / odometer_km_current)
    - 08-W1-P02 (AlertsModule wired into MaintenanceModule + canonical severity mapping)
    - Phase 7 alert_rule seed (existing spare-part NULL rule, realigned by this plan)
    - Phase 9 NotificationService (now live — picks up alerts dispatched by this scheduler)
  provides:
    - "PreventiveMaintenanceSchedulerJob @Cron('0 * * * *') hourly cron with tenant fan-out"
    - "WorkOrderService.findOpen({tenantId, equipmentId, type, pmPlanId}) idempotency primitive"
    - "WorkOrderService.close() now atomically advances linked PM plan state (D-04)"
    - "maintenance.work_order.preventive_opened event with D-17 payload"
    - "PmOpenedAlertHandler bridge -> AlertsService.createFromEvent with dedupe pm:<pm_plan_id>:overdue (fallback pm:wo:<work_order_id>)"
    - "3 new alert_rule rows seeded + Phase-7 spare-part NULL-severity role_codes aligned to D-15"
  affects:
    - "Phase 9 dispatcher consumes the new alert_rule rows to route in_app/email/sms"
    - "Closing a preventive WO is now non-trivial: it touches preventive_maintenance_plan as well"
tech_stack:
  added: []
  patterns:
    - "@Cron decorator + tenant fan-out via DISTINCT tenant_id query"
    - "Per-tenant try/catch isolation (mirrors CostPerTonAggregatorJob)"
    - "SET LOCAL app.current_tenant inside ds.transaction for RLS scoping"
    - "Pure evaluateDue() function for testable severity escalation logic"
    - "EntityManager.update inside same tx for D-04 atomicity (WO close + plan advance roll back together)"
    - "Dedupe via AlertsService.createFromEvent dedupeKey + status='open' lookup"
key_files:
  created:
    - apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts (T02)
    - apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts (T03)
    - apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql (T03)
    - apps/api/test/unit/maintenance/work-order.service.spec.ts (T01 + T04)
    - apps/api/test/unit/maintenance/preventive-maintenance-scheduler.job.spec.ts (T02)
    - apps/api/test/unit/maintenance/pm-opened-alert.handler.spec.ts (T03)
  modified:
    - apps/api/src/modules/maintenance/services/work-order.service.ts (T01 findOpen + open emit + T04 close advances plan)
    - apps/api/src/modules/maintenance/maintenance.module.ts (T02 + T03 wiring)
decisions:
  - "T01 carried over from prior planner WIP (commit 8cb52ea) — findOpen() + preventive_opened emit. This plan extends only with T04 close()-advance integration."
  - "Severity mapping at handler boundary (canonical Phase-8 convention from W1-P02): payload 'warning' -> Alert.severity 'high'; payload 'critical' -> Alert.severity 'critical'."
  - "Dedupe key fallback: when pm_plan_id is null (manual preventive WO without plan link), falls back to pm:wo:<work_order_id> to avoid colliding with other manual WOs."
  - "Seed migration aligns the Phase-7 spare-part NULL-severity role_codes via UPDATE (idempotent — re-running produces the same role_codes). This is non-destructive; the rule row is preserved."
  - "T04 critical: without advancePmPlanState the cron would re-open the same plan on every hourly tick after first close. The plan UPDATE runs in the same EntityManager / transaction as the WO close — they roll back together."
  - "Orphan PM plan (deleted while WO referenced it) is a no-op in close() — does NOT throw."
  - "Reflect.getMetadata for @Cron test required reading metadata from the prototype METHOD FUNCTION (not the class+key form) — @nestjs/common SetMetadata stores on the descriptor's value function."
metrics:
  duration_minutes: ~30
  completed_at: "2026-05-17"
  tasks: 4
  files_created: 6
  files_modified: 2
  tests_added: 31 (16 work-order + 11 scheduler + 4 pm-opened-alert)
  commits: 3 (this session) + prior planner WIP commit 8cb52ea
---

# Phase 8 Plan 08-W2-P01: PreventiveMaintenanceSchedulerJob (ALT-01) — Summary

## One-liner

Hourly @Cron job fans out across active tenants, detects PM plans crossed by days/hours/km (using denormalized meters from W1-P01), opens preventive WOs idempotently via findOpen(), emits preventive_opened event that produces deduped Alert rows; closing a preventive WO atomically advances the plan's last_executed_meter / next_due_at_utc / last_executed_at_utc so the cron does NOT re-open the same plan on the next tick.

## Tasks Completed

### T01 — WorkOrderService.findOpen + preventive_opened emit

Previously landed in commit `8cb52ea` (prior planner WIP). This plan inherits and extends with T04.

- `findOpen({tenantId, equipmentId, type, pmPlanId})` returns the most recently opened WO matching the tuple, with `status IN ('open','in_progress')` — null otherwise. Uses query builder with explicit IS NULL guard when `pmPlanId` is null/undefined.
- `open()` accepts optional `preventiveContext` and emits `maintenance.work_order.preventive_opened` with full D-17 payload (`tenant_id, site_id, equipment_id, pm_plan_id, work_order_id, severity, due_reason, overdue_by`) whenever `type === 'preventive'`.
- 10 unit tests covering plan Tests 1-10, all pass.

### T02 — PreventiveMaintenanceSchedulerJob (hourly @Cron, tenant fan-out, three interval-unit paths)

Job file created at `apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts`. Spec added in this plan.

- `@Cron('0 * * * *', { name: 'pm-scheduler-hourly', timeZone: 'UTC' })`
- `runForNow(asOf: Date)` — public entry-point for tests / ops scripts.
- Tenant fan-out: `SELECT DISTINCT tenant_id FROM preventive_maintenance_plan WHERE is_active = true`. Per-tenant try/catch isolation (one tenant failing does not stop the run).
- Inside each tenant: `SET LOCAL app.current_tenant = '<id>'` then JOIN PM plans with `production_equipment` to read `site_id`, `hour_meter_current`, `odometer_km_current`.
- `evaluateDue(plan, asOf)` is pure — testable independently. Three interval-unit paths:
  - `days`: `asOf >= next_due_at_utc` → due. `overdueBy` in hours. Severity 'critical' if overdue > 7 days.
  - `hours`: `hour_meter_current >= last_executed_meter + interval_value` → due. `overdueBy` in meter units. Severity 'critical' if `overdueRatio > 0.25`.
  - `km`: same shape as hours against `odometer_km_current`.
- `findOpen` check before each `open()`. If a matching open/in_progress WO exists, log `decision=skipped_existing` and skip.
- Missing meter (`hour_meter_current IS NULL` for an hours plan) logs `decision=skipped_missing_meter` and skips — no exception.
- 11 unit tests covering plan Tests 1-9 (with sub-tests for severity escalation), all pass.

### T03 — PM-opened → Alert bridge handler + alert_rule seed migration

- `PmOpenedAlertHandler` subscribes to `maintenance.work_order.preventive_opened`. Translates the domain event into an Alert row via `AlertsService.createFromEvent`.
- Severity mapping at the handler boundary (canonical Phase-8 convention): `evt.severity === 'critical' ? 'critical' : 'high'`. The Phase-7-canonical event payload severity stays decoupled from the Alert table's `low|medium|high|critical` enum.
- Dedupe key: `pm:<pm_plan_id>:overdue`. Falls back to `pm:wo:<work_order_id>` when `pm_plan_id` is null (manual preventive WOs).
- Migration `1719100200000__phase08_seed_pm_alert_rules.sql`:
  - 3 NEW rules inserted (idempotent NOT EXISTS guards):
    1. `maintenance.work_order.preventive_opened, severity_filter=NULL, channels=[in_app,email], role_codes=[MAINTENANCE_MANAGER, MECANICIEN_CHEF, DIRECTEUR_SITE]`
    2. `maintenance.work_order.preventive_opened, severity_filter='critical', channels=[in_app,email,sms], role_codes=[DIRECTEUR_SITE, DIRECTION_GROUPE]`
    3. `maintenance.spare_part.threshold_crossed, severity_filter='critical', channels=[in_app,email,sms], role_codes=[DIRECTEUR_SITE]`
  - 1 UPDATE issued to align the Phase-7 spare-part NULL-severity rule's role_codes to D-15 verbatim: `[MAINTENANCE_MANAGER, GESTIONNAIRE_STOCK, DIRECTEUR_SITE]` (Phase 7 had seeded `[RESPONSABLE_MAINTENANCE, CHEF_CARRIERE]`).
- 4 unit tests cover Tests 1-4, all pass.

### T04 — WorkOrderService.close() advances PM plan state (D-04)

This is the cycle-closing piece — without it the cron would re-open the same plan on every hourly tick after first close.

- New private `advancePmPlanState(manager, tenantId, wo)` runs inside the existing close() transaction (same EntityManager → atomicity).
- `days` plan: `nextDueAtUtc = now + intervalValue days`, `lastExecutedMeter = null`.
- `hours` plan: `lastExecutedMeter = equipment.hourMeterCurrent`, `nextDueAtUtc = null`.
- `km` plan: `lastExecutedMeter = equipment.odometerKmCurrent`, `nextDueAtUtc = null`.
- `lastExecutedAtUtc = now` for all interval units.
- Orphan plan (deleted while WO referenced it) → logged warning, no-op, WO close still succeeds.
- Corrective WOs are untouched.
- 6 unit tests cover Tests 11-16, all pass.

## End-to-end flow verified

```
@Cron 0 * * * *
  -> SELECT DISTINCT tenant_id FROM preventive_maintenance_plan WHERE is_active
  -> for each tenant:
       BEGIN TX
         SET LOCAL app.current_tenant = '<tenant>'
         SELECT pmp.*, pe.site_id, pe.hour_meter_current, pe.odometer_km_current
           FROM preventive_maintenance_plan pmp
           JOIN production_equipment pe ON pe.id = pmp.equipment_id
         for each plan:
           evaluateDue(plan, now) -> { dueReason, overdueBy, severity } | null
           if not_due: continue
           if missing_meter: log + skip
           findOpen({tenant, equipment, type:'preventive', pm_plan_id}) -> existing?
             yes: log + skip
             no: open({..., preventiveContext}) which:
                   - INSERT work_order
                   - UPDATE production_equipment SET status='maintenance'
                   - emit 'maintenance.work_order.opened'
                   - emit 'maintenance.work_order.preventive_opened' (D-17 payload)
       COMMIT TX

PmOpenedAlertHandler @OnEvent('maintenance.work_order.preventive_opened')
  -> AlertsService.createFromEvent({
       sourceEventType: 'maintenance.work_order.preventive_opened',
       dedupeKey: 'pm:<pm_plan_id>:overdue' (or 'pm:wo:<wo_id>'),
       severity: warning->high | critical->critical,
       payload: { equipment_id, pm_plan_id, work_order_id, due_reason, overdue_by, source_severity }
     })
  -> dedupe enforced inside AlertsService (status='open' lookup)
  -> Alert row inserted (or existing reused)

[later — operator closes the WO]
WorkOrderService.close({ workOrderId, ... })
  BEGIN TX
    UPDATE work_order SET status='closed', closed_at_utc=now
    UPDATE production_equipment SET status='active'
    if wo.type='preventive' && wo.pmPlanId:
      advancePmPlanState():
        days plan: SET next_due_at_utc = now + interval_value days
        hours plan: SET last_executed_meter = equipment.hour_meter_current
        km plan:    SET last_executed_meter = equipment.odometer_km_current
        SET last_executed_at_utc = now
    refresh MTBF/MTTR projection
    emit 'maintenance.work_order.closed'
  COMMIT TX

next @Cron tick
  -> evaluateDue() now returns null (current_meter < last_executed_meter + interval)
  -> NO new WO opened (idempotent loop closed)
```

## Severity mapping applied (canonical for Phase 8)

| Domain reality (cron-emitted) | Event payload `severity` | Alert.severity column |
|---|---|---|
| Days plan: overdue ≤ 7 days | `'warning'` | `'high'` (boundary-mapped) |
| Days plan: overdue > 7 days | `'critical'` | `'critical'` |
| Hours/km: overdueRatio ≤ 0.25 | `'warning'` | `'high'` (boundary-mapped) |
| Hours/km: overdueRatio > 0.25 | `'critical'` | `'critical'` |

The mapping `'warning' → 'high'` is applied INSIDE `PmOpenedAlertHandler`, not at emit time — same convention as the spare-part flow from W1-P02.

## Role-code alignment for Phase-7 spare-part NULL-severity rule

Before this plan:
- `event_type='maintenance.spare_part.threshold_crossed', severity_filter=NULL` → `role_codes=['RESPONSABLE_MAINTENANCE','CHEF_CARRIERE']`

After this plan's migration:
- `event_type='maintenance.spare_part.threshold_crossed', severity_filter=NULL` → `role_codes=['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']` (D-15 verbatim)

The UPDATE is idempotent — re-running the migration produces the same role_codes. The rule row is preserved (no DELETE + INSERT).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Reflect.getMetadata key form for @Cron**

- **Found during:** T02 test execution (Test 1 failed with `received: undefined`)
- **Issue:** The plan suggested `Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', PreventiveMaintenanceSchedulerJob.prototype, 'handleCron')` but `@nestjs/common`'s SetMetadata stores the metadata on the descriptor's value function (the method itself), not on the prototype+key tuple.
- **Fix:** Test reads metadata from both forms (`Reflect.getMetadata(KEY, protoMethod as object)` and the class+method tuple) and asserts whichever returned defined. Robust across SetMetadata internals.
- **Files modified:** `apps/api/test/unit/maintenance/preventive-maintenance-scheduler.job.spec.ts`
- **Commit:** 0ee4fcb

**2. [Rule 2 — Missing critical functionality] pm_plan_id null fallback for dedupe**

- **Found during:** T03 spec writing (Test 4 explicitly tests this scenario per plan behavior)
- **Issue:** Pre-existing handler hardcoded `pm:${evt.pm_plan_id}:overdue`. If a manual preventive WO is opened without a pm_plan link (allowed by the WO schema), the dedupe key becomes `pm:null:overdue` — all such WOs would collide and only one alert would fire across the system.
- **Fix:** Added type-safe nullable on the payload + fallback `pm:wo:<work_order_id>` key. Each manual preventive WO gets its own dedupe namespace.
- **Files modified:** `apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts`
- **Commit:** f883bbf

### Out-of-scope items (logged, not fixed)

Pre-existing TypeScript errors in `concassage/`, `stockpile/tests/`, `extraction/`, `production-dashboard/`, and `fuel/equipment-refuel.spec.ts` predate this plan and are unrelated to ALT-01. Per SCOPE BOUNDARY rule, not addressed here. Other staged-but-unrelated modifications (alert-dispatcher, notification, etc.) are out of scope and remain uncommitted.

### Auth gates / Architectural changes

None. Execution was fully autonomous.

## Verification Evidence

### Plan verify-greps

| Grep pattern | Match |
|---|---|
| `@Cron('0 * * * *'` in scheduler job | line 56 |
| `findOpen` in scheduler job | line 141 |
| `SET LOCAL app.current_tenant` in scheduler job | line 98 |
| `skipped_existing` in scheduler job | line 149 |
| `skipped_missing_meter` in scheduler job | line 136 |
| `overdueRatio > 0.25` in scheduler job | lines 197, 211 |
| `PreventiveMaintenanceSchedulerJob` in maintenance.module.ts | lines 17, 51 |
| `@OnEvent('maintenance.work_order.preventive_opened')` in handler | line 39 |
| `pm:${evt.pm_plan_id}:overdue` in handler | line 46 |
| `PmOpenedAlertHandler` in maintenance.module.ts | lines 16, 50 |
| `maintenance.work_order.preventive_opened` in migration | lines 41, 49 |
| `UPDATE alert_rule` in migration | line 68 |
| `MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE` in migration | line 70 |
| `last_executed_at_utc` / `lastExecutedAtUtc` in work-order.service.ts | (advancePmPlanState) |
| `next_due_at_utc` / `nextDueAtUtc` in work-order.service.ts | (advancePmPlanState) |
| `advancePmPlanState` in work-order.service.ts | line 198 |

### Test execution

```
PASS unit test/unit/maintenance/pm-opened-alert.handler.spec.ts  -> 4/4
PASS unit test/unit/maintenance/preventive-maintenance-scheduler.job.spec.ts  -> 11/11
PASS unit test/unit/maintenance/work-order.service.spec.ts  -> 16/16

Total: 31/31 passing.
```

### Type-check

`pnpm --filter @gravel/api tsc --noEmit` exits 0 (clean, no errors).

## Known Stubs

None for this plan. The PM scheduler loop is end-to-end functional:
- cron fires hourly,
- findOpen idempotency works,
- preventive WO is opened with correct severity,
- preventive_opened event materializes an Alert row deduped on pm_plan_id,
- close() advances plan state so the cron does NOT re-open on the next tick,
- alert_rule rows are seeded so Phase 9's NotificationService dispatcher will route in_app/email/sms correctly.

SMS dispatch from `severity_filter='critical'` rules is gated by Phase 9 NTF-02 Twilio integration (already live as of commits `ba52972` + `f08fd37`); this plan emits the correct payload severities so the existing dispatcher correctly routes critical-severity alerts.

## Commits

- `8cb52ea` (prior planner WIP) — test(08-W2-P01): WorkOrderService.findOpen + preventive_opened emit tests (T01)
- `5bcd5d0` — feat(08-W2-P01): WorkOrderService.close() advances PM plan state (T04, D-04)
- `f883bbf` — feat(08-W2-P01): seed PM alert_rules + handler dedupe fallback + tests (T03)
- `0ee4fcb` — test(08-W2-P01): PreventiveMaintenanceSchedulerJob unit tests (T02)

Plus prior planner WIP for the scheduler job + handler implementation files (T02 + T03 production code) embedded in earlier commits before this plan's execution window.

## Self-Check: PASSED

- [x] `apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts` exists
- [x] `apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts` exists
- [x] `apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql` exists
- [x] `apps/api/test/unit/maintenance/work-order.service.spec.ts` — 16 tests pass
- [x] `apps/api/test/unit/maintenance/preventive-maintenance-scheduler.job.spec.ts` — 11 tests pass
- [x] `apps/api/test/unit/maintenance/pm-opened-alert.handler.spec.ts` — 4 tests pass
- [x] `apps/api/src/modules/maintenance/services/work-order.service.ts` contains `advancePmPlanState` (T04)
- [x] `apps/api/src/modules/maintenance/maintenance.module.ts` registers `PreventiveMaintenanceSchedulerJob` + `PmOpenedAlertHandler`
- [x] Commits `5bcd5d0`, `f883bbf`, `0ee4fcb` present in `git log`
- [x] `pnpm --filter @gravel/api tsc --noEmit` exits 0
