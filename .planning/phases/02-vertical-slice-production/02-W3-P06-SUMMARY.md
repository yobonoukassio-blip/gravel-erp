---
plan: 02-W3-P06
status: complete
completed_at: "2026-05-13"
requirements_covered: [CAR-01, CAR-02, CAR-03, CAR-04]
---

# Summary: 02-W3-P06 — Carburant + Énergie Vertical Slice

## What Was Built

**CAR-01 — Event-sourced fuel tank ledger with chain-of-hash:**
`fuel_tank_event` table partitioned monthly (RANGE on `occurred_at_utc`), append-only with
SHA-256 chain-of-hash following the same canonical payload pattern as stockpile/HSE.
`FuelTankEventService.append()` computes hash within the same transaction.

**CAR-02 — Equipment refuel (mobile offline, atomic 3-insert):**
`EquipmentRefuelService.record()` performs a single DB transaction:
1. `FUEL_DISPENSE_OUT` on the source tank
2. Insert `equipment_refuel` row
3. Insert `equipment_fuel_consumption` row (litres/hour seed)
`RefuelAppendedHandler` emits telemetry event for anomaly pre-check.
`FuelCostAllocatorService` computes cost per litre from tank WAC for stockpile cost allocation.

**CAR-03 — L/h anomaly detection:**
`FuelAnomalyService.checkForAnomaly()` compares the new consumption record against the
equipment's rolling baseline (last 30 days p75). Thresholds: `> 1.5×` = anomaly, `< 0.4×` = leak suspect.
`FuelAnomalyDetectionJob` (@Cron 04:00 UTC) scans recent refuels.

**CAR-04 — Manual energy readings:**
`EnergyConsumptionService` + `energy_consumption_reading` table for kWh/diesel generator entries.

**Reconciliation:**
`FuelReconciliationService.reconcile()` detects physical-vs-ledger drift > 0.5%.
`FuelReconciliationJob` (@Cron 03:30 UTC).

**Web UI:** tank list, deliveries, refuel list, energy readings (Angular 20 standalone, AG-Grid).

**Mobile:** `EquipmentRefuelRepository` (Drift offline), `EquipmentRefuelForm` screen, integration test.

**ADR-0007:** Promoted to Accepted with Implementation Notes.

## Wiring Update (2026-05-13 — re-execution)

- `FuelCostAllocatorService` finalised and exported from `FuelModule`.
- `StockpileValuationService.computeInflowCost` now delegates to
  `FuelCostAllocatorService.allocateFuelCostForOperationalDay` (replaces
  the W2-P05 XOF/zero stub). `@Optional()` injection keeps the no-arg
  test constructor working.
- `StockpileModule` imports `FuelModule` so the allocator is in scope.
- `FuelModule` registered on `AppModule`.
- New spec: `apps/api/test/unit/fuel/fuel-cost-allocator.spec.ts` covers
  zero-consumption path, per-ton math, zero-tonnage edge case, and PG
  decimal-stripping.

## Files Touched in Re-execution

- apps/api/src/modules/fuel/services/fuel-cost-allocator.service.ts (new)
- apps/api/test/unit/fuel/fuel-cost-allocator.spec.ts (new)
- apps/api/src/modules/fuel/fuel.module.ts (export FuelCostAllocator)
- apps/api/src/modules/stockpile/services/stockpile-valuation.service.ts (delegate to allocator)
- apps/api/src/modules/stockpile/stockpile.module.ts (import FuelModule)
- apps/api/src/app.module.ts (import FuelModule)

## Self-Check: PASSED

- [x] All tasks executed and committed
- [x] SUMMARY.md created
- [x] STATE.md and ROADMAP updated
