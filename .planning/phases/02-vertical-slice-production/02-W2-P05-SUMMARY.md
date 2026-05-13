---
plan: 02-W2-P05
status: complete
completed_at: "2026-05-13"
requirements_covered: [STK-01, STK-02, STK-03]
---

# Summary: 02-W2-P05 — Stockpile Event-Sourced Vertical Slice

## What Was Built

**STK-01 — Event-sourced ledger with chain-of-hash:**
Append-only `stockpile_event` table (partitioned by month) where every row
includes a `chain_hash = sha256(prev_hash || event_payload)`. The
`StockpileEventService.append()` method computes the hash server-side within
the same transaction. A `GET /stockpile-events` returns the full audit trail.
`@All(':id')` on the controller returns 405 to enforce immutability.

**STK-02 — Threshold alerts:**
`StockpileThreshold` entity stores min/max per stockpile+calibre.
`StockpileBalanceService.applyEvent()` fires `production.stockpile.threshold_crossed`
after every balance update. `StockpileThresholdService` surfaces threshold CRUD.

**STK-03 — Weighted-average cost valuation (cost_model_version=1):**
`StockpileValuationService.computeWAC()` tracks running `total_cost_minor_units`
and `total_tonnage_kg` across INFLOW events, returning a provisional XOF/t cost
(never used for accounting — provisoire by design per D2-100).

**Outbox consumer:**
`RotationCompletedHandler` listens on the outbox topic `rotation.completed` from
W2-P04, creates a `STOCKPILE_INFLOW` event with idempotency key = `rotation_id`.

**Balance projection:**
`BalanceProjectionHandler` listens on `production.stockpile.event_appended` and
applies tonnage delta to the `stockpile_balance` materialized table. Nightly
`BalanceRecomputeJob` detects projection drift.

**Web UI (Angular 20 standalone):**
- `/stockpile` — master list
- `/stockpile/events` — chain-of-hash audit ledger
- `/stockpile/thresholds` — threshold config view
- `/stockpile/adjustment` — manual inventory correction form

## Key Files Created

- `apps/api/src/modules/stockpile/` — full module (entities, services, controller, handlers, jobs, tests, migrations, module)
- `apps/web/src/app/features/stockpile/` — 4 pages + service + routes + module
- `docs/adr/ADR-0006-stockpile-event-sourcing.md` — refined

## Deviations from Plan

- No mobile interface for stockpile (not in plan scope — W2-P05 is web+backend only).
- `cost_model_version` is stored but valuation is stub (provisional only per D2-100).

## Self-Check: PASSED

- [x] All 5 tasks executed
- [x] Each task committed individually
- [x] SUMMARY.md created
- [x] STATE.md and ROADMAP updated
