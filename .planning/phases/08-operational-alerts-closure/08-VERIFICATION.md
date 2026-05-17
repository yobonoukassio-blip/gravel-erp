---
phase: 08-operational-alerts-closure
verified: 2026-05-17T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: null
---

# Phase 08: Operational Alerts Closure — Verification Report

**Phase Goal:** Les alertes preventive-maintenance et spare-parts se declenchent automatiquement — fin du silence operationnel. Wiring closure seulement, les entites et services existent deja depuis Phase 3.
**Verified:** 2026-05-17
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to user prompt's 5 confirmation checks)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | No JOIN/MAX on every cron run for equipment meters (D-05 — meters live on production_equipment) | VERIFIED | `preventive-maintenance-scheduler.job.ts:100-115` selects `pe.hour_meter_current` and `pe.odometer_km_current` directly from the JOINed equipment row (no `MAX()` / no aggregate subquery). The MAX is only used inside the one-shot backfill migration `1719100000000__phase08_backfill_equipment_meters.sql:12` (NULL-guarded, idempotent). Steady-state meter writes go through `meter-update.handler.ts` event handlers. |
| 2 | PM scheduler is idempotent across runs (findOpen check before creating WorkOrder) | VERIFIED | `preventive-maintenance-scheduler.job.ts:141-152` calls `this.workOrders.findOpen({ tenantId, equipmentId, type: 'preventive', pmPlanId })` and `return 'skipped_existing'` when an open/in_progress WO already exists. `findOpen()` lives at `work-order.service.ts:58-81` with `status IN ('open','in_progress')` filter, ordered DESC, limit 1, with tenant-scoped WHERE. Additionally `WorkOrderService.close()` advances `last_executed_meter` / `next_due_at_utc` (T04 — `work-order.service.ts:214-260`) so subsequent ticks correctly recognise the plan as no-longer-due. |
| 3 | Spare-part threshold event payload includes siteId + severity | VERIFIED | `spare-part.service.ts:85-96` emits `maintenance.spare_part.threshold_crossed` with `{ tenantId, siteId: part.siteId, sparePartId, sku, quantityOnHand, thresholdMin, severity }`. Severity computed as `newQuantity <= 0 ? 'critical' : 'warning'` (covers negative-balance edge case per D-13). |
| 4 | Alert handlers subscribe to both events and write to alert table | VERIFIED | Two handlers: (a) `alerts.event-handlers.ts:181-209` `@OnEvent('maintenance.spare_part.threshold_crossed')` calls `alerts.createFromEvent` with `dedupeKey: 'spare_part:<id>:below_threshold'` and boundary mapping `warning→high`, `critical→critical`; recovery handler at line 215-224 calls `resolveByDedupeKey`. (b) `pm-opened-alert.handler.ts:39-69` `@OnEvent('maintenance.work_order.preventive_opened')` calls `alerts.createFromEvent` with `dedupeKey: 'pm:<pm_plan_id>:overdue'` (fallback `pm:wo:<work_order_id>`). Both handlers registered in `maintenance.module.ts:49-50` and AlertsModule imported at line 41. `AlertsService.resolveByDedupeKey()` exists at `alerts.service.ts:100-112` (silent, tenant-scoped). |
| 5 | alert_rule rows exist in seed migration so Phase 9 NotificationService has rules to match | VERIFIED | Migration `1719100200000__phase08_seed_pm_alert_rules.sql` inserts 3 new rules with `NOT EXISTS` idempotency guards: (1) `preventive_opened` severity NULL → in_app+email for `[MAINTENANCE_MANAGER, MECANICIEN_CHEF, DIRECTEUR_SITE]`, (2) `preventive_opened` severity 'critical' → +SMS for `[DIRECTEUR_SITE, DIRECTION_GROUPE]`, (3) `spare_part.threshold_crossed` severity 'critical' → +SMS for `[DIRECTEUR_SITE]`. Step B issues an idempotent UPDATE realigning the Phase-7 NULL-severity spare-part rule role_codes to D-15 verbatim `[MAINTENANCE_MANAGER, GESTIONNAIRE_STOCK, DIRECTEUR_SITE]`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `apps/api/src/modules/maintenance/services/work-order.service.ts` | PM plan state advance, idempotent findOpen | VERIFIED | 261 lines. `findOpen()` (lines 58-81), `open()` emits preventive_opened (lines 111-122), `close()` calls `advancePmPlanState()` (lines 175-177), private method handles days/hours/km units (lines 214-260) and orphan plans (lines 222-227). |
| `apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts` | hourly @Cron, ALT-01 | VERIFIED | 214 lines. `@Cron('0 * * * *', { name: 'pm-scheduler-hourly', timeZone: 'UTC' })` at line 56. Tenant fan-out (line 63-67), `SET LOCAL app.current_tenant` (line 98), three interval-unit paths (`evaluateDue`, lines 176-213), severity escalation `overdueRatio > 0.25` / `overdueDays > 7`, per-tenant try/catch resilience. |
| `apps/api/src/modules/maintenance/event-handlers/pm-opened-alert.handler.ts` | alert materialization | VERIFIED | 70 lines. `@OnEvent('maintenance.work_order.preventive_opened')` at line 39. Boundary severity mapping at line 41 (`'critical' → 'critical'`, else `'high'`). Dedupe key fallback at lines 45-47. Calls `alerts.createFromEvent` with full payload. |
| `apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts` | Wave 1 — equipment meter denorm | VERIFIED | 95 lines. Two `@OnEvent` decorators: `production.fuel.refuel_appended` (line 36) and `production.transport.rotation_completed` (line 46). SQL IF-HIGHER guard (`WHERE ... AND (col IS NULL OR col < $3::numeric)`) at lines 69 and 88. Tenant-scoped UPDATE. |
| `apps/api/src/modules/maintenance/services/spare-part.service.ts` | Wave 1 — ALT-02 threshold event with siteId+severity | VERIFIED | 151 lines. `consume()` emits enriched payload (lines 85-96) with `siteId: part.siteId` and `severity = newQuantity <= 0 ? 'critical' : 'warning'`. `restock()` (lines 107-150) emits `threshold_recovered` on wasBelow→!nowBelow edge. |
| `apps/api/src/modules/alerts/alerts.event-handlers.ts` | spare-part subscriber | VERIFIED | 226 lines. Lines 181-209: `onSparePartThresholdCrossed` (boundary mapping warning→high). Lines 215-224: `onSparePartThresholdRecovered` → `resolveByDedupeKey`. Dedupe key `spare_part:<id>:below_threshold` matches between both sides. |
| `apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql` | alert_rule seed | VERIFIED | 75 lines. Step A inserts 3 rules with `WHERE NOT EXISTS` idempotency guard on `(tenant_id, event_type, severity_filter)`. Step B updates Phase-7 NULL-severity spare-part rule role_codes. Tenant hardcoded `24cd97f8-0170-453e-89da-e9213dd710d7`. |
| `08-W1-P01-SUMMARY.md` | Wave 1 P01 summary | VERIFIED | Documents meter denorm, IF-HIGHER, locked event name `production.fuel.refuel_appended`. 10 unit tests passing. |
| `08-W1-P02-SUMMARY.md` | Wave 1 P02 summary | VERIFIED | Documents spare-part flow, severity boundary mapping at handler. 15 unit tests passing (9 service + 6 handler). |
| `08-W2-P01-SUMMARY.md` | Wave 2 P01 summary | VERIFIED | Documents PM scheduler, T04 close()-advance, role-code realignment. 31 unit tests passing (16 WO + 11 scheduler + 4 PM-opened handler). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `preventive-maintenance-scheduler.job.ts` | `work-order.service.ts` | `findOpen()` call before `open()` (D-02 idempotency) | WIRED | Line 141 calls `this.workOrders.findOpen(...)`; result drives `skipped_existing` branch at line 147. |
| `work-order.service.ts` (open) | `alerts/alerts.event-handlers.ts` (via EventEmitter2) | emit `maintenance.work_order.preventive_opened` | WIRED | Service emit at lines 112-121; handler `@OnEvent` subscriber at `pm-opened-alert.handler.ts:39`. |
| `work-order.service.ts` (close) | `preventive-maintenance-plan` entity | same-tx UPDATE of `next_due_at_utc` / `last_executed_meter` | WIRED | `advancePmPlanState()` invoked inside `ds.transaction` (line 176 inside close()'s tx callback); `manager.update(PreventiveMaintenancePlan, ...)` at line 255. |
| `pm-opened-alert.handler.ts` | `alerts.service.ts` | `createFromEvent` with `dedupeKey: 'pm:<pm_plan_id>:overdue'` | WIRED | Lines 49-64 — dedupe key matches the required pattern. |
| `spare-part.service.ts` | `alerts.event-handlers.ts` | emit `maintenance.spare_part.threshold_crossed` with `{ tenantId, siteId, sparePartId, sku, quantityOnHand, thresholdMin, severity }` | WIRED | Service emit at lines 87-95; handler `@OnEvent` at `alerts.event-handlers.ts:181`. |
| `alerts.event-handlers.ts` (recovery) | `alerts.service.ts` | `resolveByDedupeKey(tenantId, 'spare_part:<id>:below_threshold')` | WIRED | Handler call at lines 220-223; service method at `alerts.service.ts:100-112` (tenant-scoped, silent no-op on miss). |
| `fuel/services/equipment-refuel.service.ts` | `meter-update.handler.ts` | emit `production.fuel.refuel_appended` with `equipmentHourMeterReading` | WIRED | Service emit at line 155 includes `equipmentHourMeterReading: result.equipmentHourMeterReading`; handler `@OnEvent` at line 36. |
| `transport/services/truck-rotation.service.ts` | `meter-update.handler.ts` | emit `production.transport.rotation_completed` with `km_total_after` | WIRED (per SUMMARY+plan evidence) | Service emits via existing outbox/EventEmitter2; handler `@OnEvent` at line 46 reads `payload.km_total_after`. |
| `MaintenanceModule` | `AlertsModule` | `imports: [AlertsModule]` | WIRED | Line 41 of `maintenance.module.ts`. Required so subscribers are instantiated. |
| `MaintenanceModule` | `ScheduleModule` | `imports: [ScheduleModule.forRoot()]` | WIRED | Line 40 of `maintenance.module.ts`. Required for `@Cron` discovery. |
| `MaintenanceModule` | three Phase-8 providers | `providers: [..., MeterUpdateHandler, PmOpenedAlertHandler, PreventiveMaintenanceSchedulerJob]` | WIRED | Lines 49-51 of `maintenance.module.ts`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| PM scheduler cron | `tenants` (active tenant IDs) | `SELECT DISTINCT tenant_id FROM preventive_maintenance_plan WHERE is_active = true` (line 64-66) | Yes — real DB query | FLOWING |
| PM scheduler cron | `plans` (PM check rows) | JOIN `preventive_maintenance_plan` × `production_equipment` per tenant (lines 100-115) | Yes — reads denormalized `hour_meter_current` / `odometer_km_current` (no MAX subquery) | FLOWING |
| PM scheduler cron | `existing` (idempotency lookup) | `WorkOrderService.findOpen()` query (work-order.service.ts:58-81) | Yes — TypeORM querybuilder against `work_order` | FLOWING |
| PmOpenedAlertHandler | alert row | `AlertsService.createFromEvent` (deduped insert into `alert` table) | Yes — Phase-3 service backed by `alert` repo | FLOWING |
| Spare-part handler | alert row / resolve | `createFromEvent` + `resolveByDedupeKey` | Yes — DB-backed | FLOWING |
| MeterUpdateHandler | `production_equipment.hour_meter_current` / `odometer_km_current` | `UPDATE production_equipment SET col = $3 WHERE id=$1 AND tenant_id=$2 AND (col IS NULL OR col < $3)` | Yes — direct UPDATE on canonical columns | FLOWING |

### Behavioral Spot-Checks

Behavioral verification was performed via the SUMMARY-documented unit test suites (cannot run jest in this verification context against this Windows shell without project state). The plans' verify-greps and the SUMMARY test-counts attest to:

| Behavior | Evidence | Status |
| --- | --- | --- |
| `@Cron('0 * * * *', ...)` decorator present | grep `@Cron('0 * * * *'` at `preventive-maintenance-scheduler.job.ts:56` (1 match) | PASS |
| `findOpen` idempotency call before open | grep `findOpen` at `preventive-maintenance-scheduler.job.ts:141` (1 match) inside the processPlan branch | PASS |
| `SET LOCAL app.current_tenant` per tenant | grep at scheduler line 98 inside ds.transaction | PASS |
| Severity escalation `overdueRatio > 0.25` | grep at scheduler lines 197, 211 | PASS |
| `@OnEvent('maintenance.work_order.preventive_opened')` handler | grep at `pm-opened-alert.handler.ts:39` | PASS |
| `@OnEvent('maintenance.spare_part.threshold_crossed')` handler | grep at `alerts.event-handlers.ts:181` | PASS |
| `@OnEvent('maintenance.spare_part.threshold_recovered')` handler | grep at `alerts.event-handlers.ts:215` | PASS |
| `@OnEvent('production.fuel.refuel_appended')` handler | grep at `meter-update.handler.ts:36` | PASS |
| `@OnEvent('production.transport.rotation_completed')` handler | grep at `meter-update.handler.ts:46` | PASS |
| Stockout severity comparator `<= 0` | grep `newQuantity <= 0 ? 'critical'` at `spare-part.service.ts:86` | PASS |
| Dedupe key `spare_part:<id>:below_threshold` matches between emit/resolve | grep at `alerts.event-handlers.ts:199, 222` (identical) | PASS |
| Dedupe key `pm:<pm_plan_id>:overdue` (with WO fallback) | grep at `pm-opened-alert.handler.ts:46-47` | PASS |
| Migration inserts 3 rules + UPDATE | grep inside `1719100200000__phase08_seed_pm_alert_rules.sql` (lines 23-66 INSERT; lines 71-74 UPDATE) | PASS |
| `MaintenanceModule` imports `AlertsModule` + `ScheduleModule` | grep at `maintenance.module.ts:5, 41, 40` | PASS |
| Three Phase-8 providers registered | grep at `maintenance.module.ts:49-51` | PASS |
| Reported unit-test counts: W1-P01 10/10, W1-P02 15/15, W2-P01 31/31 | SUMMARY frontmatter `metrics.tests_added` | PASS (per SUMMARY evidence) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| **ALT-01** | 08-W1-P01 (requirements_covered), 08-W2-P01 (requirements_covered) | Un @Cron (`PreventiveMaintenanceSchedulerJob`) ouvre un WorkOrder automatiquement quand l'intervalle PM d'un equipement est franchi (heures, km, ou calendaire) | SATISFIED | Hourly @Cron exists; three interval-unit paths (`evaluateDue`); idempotent via `findOpen`; PM plan state advanced on close so loop converges. REQUIREMENTS.md line 39 already marks Complete. |
| **ALT-02** | 08-W1-P02 (requirements_covered) | Un handler `maintenance.spare_part.threshold_crossed` ecoute les evenements de stock pieces et cree une alerte quand le seuil min est atteint | SATISFIED | `onSparePartThresholdCrossed` handler creates Alert via `createFromEvent` deduped on `spare_part:<id>:below_threshold`; severity warning→high / critical→critical at boundary; recovery resolves via `resolveByDedupeKey`. REQUIREMENTS.md line 40 already marks Complete. |

No orphaned requirements detected: both ALT-01 and ALT-02 appear in plan frontmatter `requirements_covered`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none in Phase-8-authored files) | — | No TODO/FIXME/PLACEHOLDER markers in `maintenance/` module per Grep scan | — | Clean. |

Notes:
- The `SET LOCAL app.current_tenant = '${tenantId}'` line at `preventive-maintenance-scheduler.job.ts:98` interpolates the tenantId directly into SQL. The tenantId comes from a trusted DB query (the DISTINCT projection of `preventive_maintenance_plan.tenant_id`, a UUID-typed column), so SQL-injection risk is negligible. Out of paranoia a parameterized form would be preferable, but `SET LOCAL` does not accept bind parameters in Postgres — the current pattern matches `CostPerTonAggregatorJob`. **Info** only.
- `AlertDispatcherService.onSparePartLow hard-codes severity='warning'` was flagged in 08-W1-P02-SUMMARY as a deferred discovery routed to Phase 9 NTF-02. Phase 9 is already complete (per REQUIREMENTS.md NTF-01/02/03 = Complete and recent commits `72475ca`, `6319f8a`), so this should be re-validated downstream but is NOT a Phase-8 gap — the Alert row itself is created with correct severity inside `PmOpenedAlertHandler` / `onSparePartThresholdCrossed`. **Info** only.

### Human Verification Required

None blocking. The following are optional end-to-end smoke tests that would confirm runtime behavior beyond the unit-test coverage already documented:

1. **Hourly cron observed in production logs (24 h)**
   - **Test:** Tail API container logs for 24 h, grep for `[PMScheduler] completed asOf=`.
   - **Expected:** ~24 lines logged, no stack traces.
   - **Why human:** Requires deployed environment + time window.

2. **End-to-end loop (seed → cron → alert → close → cron → no-op)**
   - **Test:** Seed a `preventive_maintenance_plan` with `interval_unit='hours', interval_value=250, last_executed_meter='1000'`. Force `production_equipment.hour_meter_current='1260'`. Trigger `runForNow(new Date())` via ops script. Verify `work_order` row + `alert` row appear with expected dedupe key + severity. Close the WO via `WorkOrderService.close()`. Trigger `runForNow` again — assert no new WO.
   - **Expected:** Idempotency proven; plan state advanced.
   - **Why human:** Requires DB seeding + ops console; documented in 08-W2-P01-SUMMARY as the documented smoke.

3. **Alert visible in Chef Maintenance inbox UI**
   - **Test:** Login to web UI as `MAINTENANCE_MANAGER` after triggering the loop above; verify alert appears in inbox.
   - **Expected:** Alert visible with severity badge matching event severity.
   - **Why human:** UI rendering / role resolution.

### Gaps Summary

None. All five user-prompted confirmation checks pass, both requirement IDs are satisfied with traceable implementation, all key links are wired, and no blocker anti-patterns were detected. The phase achieves its stated goal: preventive-maintenance and spare-part alerts now fire automatically — the operational silence is closed.

The deferred discovery in 08-W1-P02-SUMMARY about `AlertDispatcherService.onSparePartLow` is out of scope for Phase 8 (dispatcher contract is owned by Phase 9 NTF-02, which is already marked Complete). It does not impair the Alert-row creation that Phase 8 contracts for.

---

_Verified: 2026-05-17_
_Verifier: Claude (gsd-verifier)_
