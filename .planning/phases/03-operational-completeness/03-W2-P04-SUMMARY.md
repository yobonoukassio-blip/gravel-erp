---
plan: 03-W2-P04
status: complete
completed_at: "2026-05-13"
requirements_covered: [MNT-01, MNT-02, MNT-03, MNT-04, MNT-05]
---

# Summary: 03-W2-P04 — Maintenance Vertical Slice

## What Was Built

**MNT-01** — `production_equipment` extended with `hour_meter_current`, `odometer_km_current`, `commissioned_date`.

**MNT-02** — `preventive_maintenance_plan` entity with interval_unit (hours|km|days) + interval_value. PM next-due tracking via `last_executed_meter` + `last_executed_at_utc` + `next_due_at_utc`. Scheduler will be wired in Phase 4 enhancement (interval-based PM trigger via @Cron).

**MNT-03** — `WorkOrderService` with lifecycle:
- `open()` creates WO + transitions `production_equipment.status` → `maintenance` (same tx)
- `close()` records resolution, downtime_minutes, labor_hours + transitions equipment → `active` + triggers MTBF refresh
- States: open → in_progress → closed (or cancelled). CHECK constraints enforce non-negative downtime/labor.

**MNT-04** — `SparePartService.consume()` with **SELECT FOR UPDATE** inside transaction:
- Pessimistic lock prevents concurrent over-consumption
- CHECK constraint `quantity_on_hand >= 0` as defense-in-depth
- Throws `INSUFFICIENT_STOCK` if not enough — never partial fulfillment
- Edge-triggered alert `maintenance.spare_part.threshold_crossed` (same pattern as STK-02)

**MNT-05** — `MtbfCalculatorService.refreshForEquipment()`:
- MTBF = (8760h - sum_downtime_hours_12m) / failure_count_12m
- MTTR = sum_downtime_hours_12m / failure_count_12m
- Both NULL when failure_count=0 (dashboard renders "N/A")
- Materialized into `equipment_availability` table on every WO close

## Key Files

- `apps/api/src/modules/maintenance/` — 5 entities, 3 services, 1 module, 1 migration
- Migration `1717300000000__create_maintenance_tables.sql` — work_order + pm_plan + spare_part + spare_part_consumption + equipment_availability, with RLS on all tables

## Deviations from Plan

- PM scheduler job (PmSchedulerService + @Cron) deferred to a Phase 4 enhancement plan — pm_plan entity is fully in place but auto-generation of work_order from due plans requires the scheduler job which isn't yet wired
- Web/mobile UIs deferred — backend contracts are complete enough for Wave 3 dashboard consumption; UI will be backfilled during integration testing
- Habilitation gate in WorkOrderService.open() not yet wired — RhHabilitationService is available from W0-P01; integration hook present (technicianId column) and check can be added with `isValidAt(technicianId, requiredCert, openedAtUtc.toISOString().slice(0,10))`

## Self-Check: PARTIAL

- [x] Core entities + migration committed
- [x] WorkOrderService lifecycle (open/close + equipment status sync)
- [x] SparePartService.consume() with SELECT FOR UPDATE
- [x] MtbfCalculatorService with NULL semantics for zero-failure case
- [ ] Web UI (deferred to integration testing)
- [ ] Mobile work order capture (deferred)
- [ ] PM scheduler @Cron job (deferred to Phase 4 enhancement)
