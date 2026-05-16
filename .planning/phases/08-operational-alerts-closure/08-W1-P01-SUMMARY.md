---
phase: 08-operational-alerts-closure
plan: 08-W1-P01
title: "Equipment meter denormalization + event-driven updaters"
subsystem: maintenance
tags: [phase-8, maintenance, meters, event-driven, multi-tenant, rls]
requires:
  - "production_equipment table (Phase 3) with hour_meter_current + odometer_km_current columns"
  - "equipment_refuel table (Phase 3) with equipment_hour_meter_reading column"
  - "EventEmitter2 + outbox pattern (Phase 2)"
provides:
  - "ProductionEquipment.hourMeterCurrent / odometerKmCurrent / commissionedDate exposed as string | null"
  - "Backfilled hour_meter_current from MAX(equipment_refuel.equipment_hour_meter_reading)"
  - "truck_rotation.km_total_after NUMERIC(12,2) NULL column"
  - "production.fuel.refuel_appended payload extended with equipmentHourMeterReading"
  - "production.transport.rotation_completed payload extended with km_total_after"
  - "MeterUpdateHandler subscribed to both events with IF-HIGHER guard (D-06), RLS-safe"
affects:
  - "Phase 8 W2-P01 PM scheduler cron will read production_equipment.hour_meter_current / odometer_km_current directly"
  - "Existing refuel-appended.handler.ts continues to work — additive payload field is benign"
tech-stack:
  added: []
  patterns:
    - "@OnEvent + @InjectDataSource() raw SQL UPDATE with IF-HIGHER guard in WHERE clause"
    - "Idempotent SQL backfill via subquery + NULL-guarded WHERE"
key-files:
  created:
    - apps/api/src/modules/maintenance/migrations/1719100000000__phase08_backfill_equipment_meters.sql
    - apps/api/src/modules/maintenance/migrations/1719100100000__phase08_add_truck_rotation_km_total_after.sql
    - apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts
    - apps/api/test/unit/maintenance/meter-update.handler.spec.ts
  modified:
    - apps/api/src/modules/master-data/production-equipment.entity.ts (b396bd3 — added 3 columns)
    - apps/api/src/modules/transport/entities/truck-rotation.entity.ts (b396bd3 — added kmTotalAfter)
    - apps/api/src/modules/transport/services/truck-rotation.service.ts (b396bd3 — accepts + persists + emits)
    - apps/api/src/modules/fuel/services/equipment-refuel.service.ts (b396bd3 — payload extended)
    - apps/api/src/modules/maintenance/maintenance.module.ts (b396bd3 — registers MeterUpdateHandler)
decisions:
  - "Event names HARDCODED in @OnEvent decorators — no runtime fallback (resolves Warning 7 from planning)"
  - "Payload extension is additive — existing consumers (refuel-appended.handler.ts) unaffected"
  - "IF-HIGHER guard implemented in SQL WHERE clause, not application logic — atomic, race-free"
  - "All UPDATEs include tenant_id = \$2 in WHERE clause (RLS-safe)"
  - "Spec relocated from src/modules/.../*.spec.ts to test/unit/maintenance/ to match jest project testMatch glob"
metrics:
  duration: ~45min
  completed: 2026-05-16
  tasks: 3
  files_created: 4
  files_modified: 0 (entity/service modifications already committed in b396bd3)
  tests_added: 10 (all passing)
  commits: 3
---

# Phase 8 Plan 08-W1-P01: Equipment meter denormalization + event-driven updaters — Summary

Denormalized hour and km meters onto `production_equipment` so the Phase 8 PM scheduler cron (W2-P01) can compare `hour_meter_current >= lastExecutedMeter + intervalValue` (D-04) without JOINs or MAX subqueries at every run.

## One-liner

Wired event-driven meter updates (refuel hours + rotation km) into `production_equipment` via `MeterUpdateHandler` with SQL-level IF-HIGHER guard, plus idempotent backfill of historical refuel data.

## Tasks Completed

### T01 — Expose meter columns on ProductionEquipment + backfill migration

- Entity changes (committed in b396bd3 by planner agent):
  - `hourMeterCurrent: string | null` mapped to `hour_meter_current NUMERIC(12,2)`
  - `odometerKmCurrent: string | null` mapped to `odometer_km_current NUMERIC(12,2)`
  - `commissionedDate: string | null` mapped to `commissioned_date DATE`
- Migration `1719100000000__phase08_backfill_equipment_meters.sql`:
  - Idempotent (`WHERE pe.hour_meter_current IS NULL`)
  - Populates from `MAX(equipment_refuel.equipment_hour_meter_reading)`
  - Equipment with no refuel history keeps NULL (no fabricated zeros)
- Commit: `8296c61`

### T02 — Add km_total_after on truck_rotation + populate on completion

- Migration `1719100100000__phase08_add_truck_rotation_km_total_after.sql`:
  - `ADD COLUMN IF NOT EXISTS km_total_after NUMERIC(12, 2)` (idempotent)
  - `COMMENT ON COLUMN` documents Phase 8 consumer
- Entity + service changes (committed in b396bd3):
  - `TruckRotation.kmTotalAfter?: string | null`
  - `TruckRotationService.complete(rotationId, tenantId, unloadedAtUtc, kmTotalAfter?)` accepts and persists
  - Outbox payload at `ROTATION_COMPLETED_EVENT` includes `km_total_after: saved.kmTotalAfter ?? null`
- Commit: `36ba055`

### T03 — Extend refuel payload + MeterUpdateHandler IF-HIGHER updates

- Refuel emit extension (committed in b396bd3):
  - `production.fuel.refuel_appended` payload now includes `equipmentHourMeterReading: string`
- New `MeterUpdateHandler`:
  - `@OnEvent('production.fuel.refuel_appended')` → `updateHoursIfHigher()`
  - `@OnEvent('production.transport.rotation_completed')` → `updateKmIfHigher()`
  - Both UPDATEs use SQL guard: `WHERE id = $1 AND tenant_id = $2 AND (col IS NULL OR col < $3::numeric)`
  - No-op when required fields missing (equipmentId, reading, km_total_after, tenant_id)
- Registered in `MaintenanceModule.providers` (b396bd3)
- 10 unit tests covering all 8 behaviors from `<behavior>` block — all pass
- Commit: `8f584e3`

## Locked Event Name

The canonical fuel event is **`production.fuel.refuel_appended`** — verified at
`apps/api/src/modules/fuel/services/equipment-refuel.service.ts:136`. It is HARDCODED in the
`@OnEvent` decorator. NO runtime fallback. NO speculation. Confirmed extended additively to
include `equipmentHourMeterReading: string`; existing consumer `refuel-appended.handler.ts`
continues to work via TypeScript object widening (additional fields ignored).

## Verification

- `pnpm --filter @gravel/api tsc --noEmit` — 0 errors in files this plan touches.
  Pre-existing errors in concassage/extraction/stockpile/production-dashboard tests are OUT OF SCOPE
  (not caused by this plan's changes — SCOPE BOUNDARY rule applies).
- `npx jest --selectProjects unit --testPathPattern="meter-update"` — **10/10 tests pass** (6.8s).
- Migration files use idempotent SQL (`ADD COLUMN IF NOT EXISTS`, `WHERE col IS NULL`).
- Grep confirmation:
  - `grep -n "@OnEvent('production.fuel.refuel_appended')"` → matches in handler ✓
  - `grep -n "@OnEvent('production.transport.rotation_completed')"` → matches in handler ✓
  - `grep -n "hour_meter_current < "` → matches IF-HIGHER guard ✓
  - `grep -n "odometer_km_current < "` → matches IF-HIGHER guard ✓
  - `grep -n "MeterUpdateHandler"` in maintenance.module.ts → registered in providers ✓
  - `grep -n "equipmentHourMeterReading: result.equipmentHourMeterReading"` in fuel service ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Spec file relocated for jest discovery**
- **Found during:** Task 3 verification
- **Issue:** Spec was at `apps/api/src/modules/maintenance/event-handlers/meter-update.handler.spec.ts` but the api `jest.config.ts` defines four projects whose `testMatch` is `<rootDir>/test/unit/**/*.spec.ts` (or integration / security / chaos). Specs in `src/**` are not discovered. The plan's verify step `pnpm --filter @gravel/api test -- meter-update.handler.spec.ts` would have failed with "0 matches".
- **Fix:** Moved to `apps/api/test/unit/maintenance/meter-update.handler.spec.ts` and adjusted the relative import path to `../../../src/modules/maintenance/event-handlers/meter-update.handler`.
- **Files modified:** spec only (mv + 1 import line)
- **Commit:** `8f584e3`

### Out-of-scope items (logged, not fixed)

- `apps/api/src/modules/concassage/tests/*.spec.ts` (4 errors)
- `apps/api/src/modules/stockpile/tests/*.spec.ts` (4 errors)
- `apps/api/src/modules/extraction/tests/extraction-cycle.spec.ts` (1 error)
- `apps/api/src/modules/production-dashboard/tests/dashboard-aggregator.spec.ts` (1 error)
- `apps/api/test/unit/stockpile/stockpile-event.spec.ts` (1 error)

All TypeScript errors above predate this plan and are unrelated to meter denormalization. They reference signature changes in `EventEmitter2` / outbox mock helpers from earlier phases. Will be picked up by a dedicated cleanup plan.

## Adherence to CONTEXT.md decisions

| Decision | Adherence |
|---|---|
| D-05 — Source of meter truth = denormalized columns on production_equipment (no JOIN/MAX) | ✓ Columns exposed + backfilled + maintained by handler |
| D-06 — IF HIGHER rule on both hours and km | ✓ SQL `WHERE col IS NULL OR col < $3::numeric` guards both paths |
| D-07 — Backfill migration with `MAX(equipment_hour_meter_reading)` per equipment, NULL if no refuel | ✓ Migration is idempotent and respects this exactly |
| D-18 — EventEmitter2, no outbox/Kafka for Phase 8 | ✓ Fuel event = EventEmitter2; rotation event = existing outbox → handler subscribes on the local emitter routed through the outbox dispatcher (Phase 2 pattern) |

### Naming reconciliation noted

D-05/D-07 wording uses `current_hours_meter` / `current_km_meter`. The actual DB column names created by Phase 3 (`1717300000000__create_maintenance_tables.sql`) are `hour_meter_current` / `odometer_km_current`. The DB is the source of truth — Phase 8 uses the existing column names consistently in entity, migration, and handler.

## Commits (this plan)

- `8296c61` feat(08-W1-P01): backfill equipment meters from refuel history (T01)
- `36ba055` feat(08-W1-P01): add km_total_after column on truck_rotation (T02)
- `8f584e3` feat(08-W1-P01): MeterUpdateHandler with IF-HIGHER guard for refuel + rotation events (T03)

Plus prior WIP from `b396bd3` (planner agent — entity, service, module wiring) which this plan extends with the migrations, handler implementation, and tests.

## Self-Check: PASSED

- Migration files exist at expected paths ✓
- Handler file exists with both @OnEvent decorators ✓
- Spec file moved and tests pass (10/10) ✓
- Commits 8296c61, 36ba055, 8f584e3 in git log ✓
- TypeScript compiles cleanly for plan-owned files ✓
