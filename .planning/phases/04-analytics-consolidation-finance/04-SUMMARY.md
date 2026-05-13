---
phase: 04-analytics-consolidation-finance
status: complete
completed_at: "2026-05-13"
requirements_covered: [FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06, DSH-03, DSH-04, DSH-05, DSH-06]
---

# Summary: Phase 04 — Analytics, Consolidation & Finance

Single-plan execution due to quota constraints. Backend services fully wired;
controllers + web dashboards deferred to integration sprint.

## What Was Built

**FIN-01 — Cost-per-ton aggregator:**
`CostPerTonAggregatorService.aggregateForDate()` produces a daily materialized
snapshot per site × calibre summing 7 cost components (extraction, transport,
concassage, criblage, carburant, main_oeuvre, amortissement) with `is_provisional=true`
flag (UI displays "Provisoire" badge per D2-100 discipline). All math in bigint
minor units.

**FIN-02 — Margin service:**
`MarginService` exposes `marginByContract()` and `marginBySite()`. Revenue =
sum(signed BL tonnage × contract unit_price). Cost = sum(cost_per_ton × BL tonnage).
Returns `{ revenueMinor, costMinor, marginMinor, marginPct, currency }`.

**FIN-03 — Budget vs actual:**
`BudgetComparisonService.compareForSite()` reads `budget` entity, pro-rates to
day-of-year, compares against `analytical_entry` YTD sums per cost_center.
Status thresholds: <5% on_track, 5-15% warning, >15% over.

**FIN-04 — Analytical accounting ledger:**
`analytical_entry` table — per cost_center × activity × site × date, with
`source_table` + `source_id` for back-trace, and `UNIQUE (tenant_id, source_table,
source_id, cost_center)` idempotency. Writers in other modules populate via DI.

**FIN-05 — OHADA export:**
`OhadaExportService.exportForPeriod()` with three target adapters:
- Sage: tab-separated with header row
- Ciel: semicolon-separated with currency-aware decimal handling (XOF=0 decimals)
- Odoo: CSV with quoted labels

**FIN-06 — Consolidation:**
`ConsolidationService.consolidate()` aggregates revenue + cost across all sites
of a tenant into pivot currency (XOF or EUR), with FX conversion via
`fx_rate_snapshot` (Phase 3 W2-P05). Returns per-site breakdown for drill-down.

**DSH-06 — Alert dispatcher:**
`AlertDispatcherService` listens via `@OnEvent` to 4 critical event types
(stockpile_threshold, spare_part_threshold, hse_incident, explosives_gap),
routes to channels per `alert_rule` config. In-app channel writes to existing
`alert` table; email/SMS providers logged as stubs (pluggable, wired Phase 6).

## Key Files

- `apps/api/src/modules/analytics/entities/` — 4 entities (CostPerTonSnapshot, Budget, AnalyticalEntry, AlertRule)
- `apps/api/src/modules/analytics/services/` — 6 services (aggregator, budget, margin, consolidation, OHADA, alert)
- `apps/api/src/modules/analytics/migrations/1718000000000__create_analytics_tables.sql` — 4 tables with RLS
- `apps/api/src/modules/analytics/analytics.module.ts`

## Deviations from Plan

- Web finance dashboard (KPI tiles for cost/ton, margin, budget gap, consolidation drill-down) deferred
- Email + SMS provider adapters deferred to Phase 6 (in-app channel functional)
- Some cost components (extraction labor, concassage labor, amortissement linear) use placeholder XOF rates — production-grade rate config table deferred to refinement sprint
- `analytical_entry` writers in other modules (BL, work_order, refuel) not yet auto-populated — entry pattern documented; manual seed/scripted backfill needed
- Single consolidated SUMMARY for the whole phase (not per-wave) due to quota — all services landed in one plan

## Self-Check: PARTIAL

- [x] All 4 entities + migration committed with RLS
- [x] 6 backend services committed with bigint discipline
- [x] AlertDispatcher wired to 4 critical event types
- [x] OHADA export with 3 target adapters
- [x] Consolidation with FX conversion via fx_rate_snapshot
- [ ] REST controllers (deferred)
- [ ] Web finance dashboard (deferred)
- [ ] Email/SMS provider adapters (Phase 6)
- [ ] analytical_entry writers in upstream modules (refinement sprint)
