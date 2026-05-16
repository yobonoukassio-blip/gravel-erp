---
phase: 07-finance-real
plan: 01
subsystem: analytics
tags: [finance, cost-per-ton, analytical-entry, alert-rule, cron, fin-r01, fin-r02, fin-r06]
requires:
  - phase-04-analytics-tables  # cost_per_ton_snapshot, analytical_entry, alert_rule
  - phase-02-extraction        # extraction_cycle entity + event
  - phase-02-transport         # truck_rotation + outbox event
  - phase-03-concassage        # crusher_session, screening_session outbox events
provides:
  - analytical_entry writers for EXT/TRA/CON/CRI cost centers
  - CostPerTonAggregatorJob @Cron('0 4 * * *')
  - 5 default alert_rules seeded for demo tenant
  - production.fuel.anomaly_detected dispatcher handler
affects:
  - finance dashboards (real non-zero values for 4 previously-zero cost components)
  - alert routing (rules now exist so handlers can fire)
tech-stack:
  added: []
  patterns:
    - "@OnEvent handlers writing to analytical_entry ledger"
    - "@Cron job iterating tenants -> sites -> calibres"
    - "Migration with NOT EXISTS guard for idempotent seed"
    - "Unit tests via stubbed DataSource.query route matcher"
key-files:
  created:
    - apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts
    - apps/api/src/modules/analytics/migrations/1718100000000__seed_alert_rules.sql
    - apps/api/src/modules/analytics/tests/analytical-entry-writer.spec.ts
    - apps/api/test/unit/analytics/analytical-entry-writer.spec.ts
  modified:
    - apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts
    - apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts
    - apps/api/src/modules/analytics/services/alert-dispatcher.service.ts
    - apps/api/src/modules/analytics/analytics.module.ts
decisions:
  - "Use ledger-pull aggregation: writers populate analytical_entry, aggregator sums per cost_center. Single source of truth, idempotent via UNIQUE constraint."
  - "Extraction emits production.extraction.cycle_recorded (not cycle_created as the plan suggested) — kept the existing event name to avoid a breaking change."
  - "Amortissement stays 0n with TODO(FIN-07); production_equipment table lacks purchase_cost_minor + useful_life_years columns. Adding them is architectural (Rule 4) and outside this plan's scope."
  - "Placeholder unit costs (3500 XOF/h excavator, 5000 XOF/rotation, 120 XOF/kWh, 2000 XOF/h screen) live as constants in the handler. Replace via rate-config service in FIN-07 sprint."
metrics:
  duration_minutes: 35
  completed: 2026-05-16
  tasks_total: 4
  tasks_completed: 4
---

# Phase 07 Plan 01: Finance Real — Cost Writers + Cron + Alert Seed Summary

Wired the four missing cost-component writers (EXT, TRA, CON, CRI) into `analytical_entry` via @OnEvent handlers, switched `CostPerTonAggregatorService` to read those cost centers from the ledger instead of stubbed formulas, added a `@Cron('0 4 * * *')` daily aggregator job, and seeded 5 default `alert_rule` rows so the existing dispatcher actually has rules to evaluate.

## Tasks Executed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Add 4 cost-component writers to AnalyticalEntryWriterHandler | done | bed2baa |
| 2 | Replace stub formulas in CostPerTonAggregatorService with ledger reads | done | 6eb2da4 |
| 3 | Create CostPerTonAggregatorJob @Cron('0 4 * * *') | done | b1246b1 (parallel session) |
| 4 | Seed 5 alert_rules + fuel-anomaly dispatcher handler + writer tests | done | 3924856 |

## Requirements Delivered

| REQ | Evidence |
|-----|----------|
| **FIN-R01** | 4 new `@OnEvent` handlers in `analytical-entry-writer.handler.ts` write DEBIT entries to `analytical_entry` for extraction (EXT), transport (TRA), concassage (CON), criblage (CRI). Aggregator now sums these cost centers from the ledger. |
| **FIN-R02** | `CostPerTonAggregatorJob.handleCron()` with `@Cron('0 4 * * *', { timeZone: 'UTC' })` iterates all active tenants × sites × calibres calling `aggregateForDate` for D-1. |
| **FIN-R06** | Migration `1718100000000__seed_alert_rules.sql` inserts 5 default rules covering stockpile threshold, spare part low, HSE critical, explosives gap, fuel anomaly. Event types match `@OnEvent` decorators exactly. |

## Architecture

```
Domain event           AnalyticalEntryWriterHandler         analytical_entry
─────────────          ──────────────────────────           ────────────────
production.vte.bl_signed                  →     VTE  vente             →     CREDIT
maintenance.work_order.closed             →     MNT  maintenance       →     DEBIT
production.fuel.refuel_appended           →     CAR  carburant         →     DEBIT
production.extraction.cycle_recorded      →     EXT  extraction        →     DEBIT   [NEW]
production.transport.rotation_completed   →     TRA  transport         →     DEBIT   [NEW]
production.crusher.session_completed      →     CON  concassage        →     DEBIT   [NEW]
production.screening.session_completed    →     CRI  criblage          →     DEBIT   [NEW]
                                                              │
                                                              ▼
            CostPerTonAggregatorService.aggregateForDate()  ◀───────  CostPerTonAggregatorJob
                                                                       @Cron('0 4 * * *')
                                                              │
                                                              ▼
                                                     cost_per_ton_snapshot
                                                     (UPSERT, idempotent)
```

## Test Coverage

- New unit suite `analytical-entry-writer.spec.ts` — 5 tests, all pass:
  - EXT entry: 2h × 3500 XOF/h = 7000 XOF asserted (param[4] = '700000')
  - TRA entry: flat 5000 XOF per rotation asserted ('500000')
  - CON entry: 100 kWh × 120 XOF = 12000 XOF asserted ('1200000')
  - CRI entry: 3h × 2000 XOF = 6000 XOF asserted ('600000')
  - Defensive: missing `extraction_cycle` row skips insert (no exception)

Pre-existing test errors in other modules (`jest.fn<Function>()` typing
issues in concassage/stockpile/extraction tests) are unrelated and not
introduced by this plan.

## Deviations from Plan

### Auto-fixed / Adapted

**1. [Rule 1 — Bug] Use existing event name `production.extraction.cycle_recorded`**
- **Found during:** Task 1
- **Issue:** Plan specified emitting `production.extraction.cycle_created`, but `ExtractionCycleService` already emits `production.extraction.cycle_recorded` (FIN-04 wiring from Phase 4).
- **Fix:** Bound the handler to the existing event name. No business-module change needed.
- **Files modified:** `analytical-entry-writer.handler.ts`
- **Commit:** bed2baa

**2. [Rule 3 — Blocking] Aggregator already had tonnage-based stub formulas**
- **Found during:** Task 2
- **Issue:** A parallel session had already replaced the `= 0n` stubs with hardcoded XOF-per-tonne formulas (2500 XOF/t extraction, 1200 XOF/t concassage, etc.). The plan wanted `analytical_entry` reads to be the source of truth.
- **Fix:** Replaced the tonnage-multiplier formulas with a single grouped SUM query against `analytical_entry` for the four cost centers. Single round-trip vs 4 separate queries.
- **Files modified:** `cost-per-ton-aggregator.service.ts`
- **Commit:** 6eb2da4

**3. [Rule 4 -> deferred] Amortissement column missing**
- **Found during:** Task 2
- **Issue:** `production_equipment` table has no `purchase_cost_minor` or `useful_life_years` columns (schema 1715000200000). The plan listed adding these as out-of-scope.
- **Fix:** Kept `costAmortissementMinor = 0n` with `TODO(FIN-07)` comment.
- **Files modified:** `cost-per-ton-aggregator.service.ts`

**4. [Rule 3 — Blocking] Parallel session committed Task 3 work**
- **Found during:** Task 3 commit
- **Issue:** Commits `b1246b1` and `6194c12` from a parallel session had already created `cost-per-ton-aggregator.job.ts` and registered it in `analytics.module.ts`. My local writes were identical / additive (both ended up in tree clean state).
- **Fix:** Verified the file on disk has the correct `@Cron('0 4 * * *')` decorator, tenant iteration loop, and provider registration. No re-commit needed.
- **Commit:** b1246b1 (attribution credit; my session prepared identical code)

## Known Stubs

- `costAmortissementMinor` stays `0n` until `production_equipment` gets `purchase_cost_minor` + `useful_life_years`. Documented as `TODO(FIN-07)`.
- Per-unit cost constants (`EXTRACTION_HOURLY_RATE_MINOR`, etc.) are placeholders pending a rate-config service.

## TypeScript Status

`npx tsc --noEmit --pretty false` runs clean on all source files modified
by this plan. The only remaining compile errors are pre-existing test
files (`jest.fn<Function>()` constraint mismatches in
concassage/stockpile/extraction/dashboard tests) — these were flagged
in the plan brief as not-our-problem and are tracked separately.

## Next Steps

- Phase 07 Plan 02+: DSH-03/04/05 Angular tiles + group consolidation page (FIN-R03/R04/R05).
- Phase 08: PreventiveMaintenanceSchedulerJob + spare-part handler (depends on alert_rules seeded here).
- Phase 09: BullMQ email/SMS workers replace structured-log fallback in `EmailProvider` / `SmsProvider`.

## Self-Check: PASSED

- [x] `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts` — 7 @OnEvent decorators present
- [x] `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts` — no remaining `= 0n` stubs for extraction/transport/concassage/criblage
- [x] `apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts` — exists with `@Cron('0 4 * * *')`
- [x] `apps/api/src/modules/analytics/migrations/1718100000000__seed_alert_rules.sql` — exists with 5 INSERT VALUES
- [x] `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts` — 5 @OnEvent handlers including production.fuel.anomaly_detected
- [x] Unit tests pass: 5/5 in `analytical-entry-writer.spec.ts`
- [x] Commits exist: bed2baa, 6eb2da4, b1246b1, 3924856
