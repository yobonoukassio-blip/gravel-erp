---
phase: 02-vertical-slice-production
plan: W2-P05
subsystem: stockpile
tags: [stockpile, event-sourcing, chain-of-hash, partitioning, outbox, valuation, threshold-alerts, angular, nestjs]

requires:
  - phase: 02-W0-P01
    provides: EventChainVerifier, OutboxService, generic chain-of-hash pattern, ADR-0006 draft
  - phase: 02-W2-P04
    provides: production.transport.rotation_completed outbox event, TruckRotation same-tx publish pattern

provides:
  - Stockpile master + stockpile_event monthly-partitioned append-only ledger with chain-of-hash
  - StockpileEventService (append, idempotent on source_reference.rotation_id)
  - StockpileBalance materialized projection (tenant, stockpile, calibre) → balance_kg + weighted_avg
  - StockpileThreshold + edge-triggered threshold_crossed event publication (low/critical_low/high)
  - StockpileValuationService weighted-average formula with cost_model_version=1 (XOF stub until W3-P06 fuel)
  - RotationCompletedHandler — outbox consumer creating STOCKPILE_INFLOW idempotently
  - BalanceRecomputeJob — nightly drift detector (@Cron 03:00 UTC) emitting balance_drift_detected
  - Web stockpile UI — list (with provisional cost label), events timeline, thresholds grid, adjustment form (photo SHA-256 + reason)
  - ADR-0006 promoted to Accepted + Implementation Notes section

affects: [02-W3-P06-fuel-cost-allocation, 03-sales-bl, 04-analytics-consolidation]

tech-stack:
  added: []
  patterns:
    - "Monthly RANGE partitioning on append-only event tables — composite PK (id, occurred_at_utc) required by Postgres"
    - "Defense-in-depth idempotency: service pre-check on source_reference->>'rotation_id' + DB unique partial index"
    - "Edge-triggered alert dedupe: emit only on first crossing in each direction; staying-below = no spam"
    - "Append-only enforcement via BEFORE UPDATE OR DELETE trigger raising restrict_violation"
    - "Projection commit-then-notify: threshold check after balance tx commits to avoid alert-failure rollback"
    - "cost_model_version field on every event — enables Phase 4 re-valorization without schema change"

key-files:
  created:
    - apps/api/src/modules/stockpile/stockpile.module.ts
    - apps/api/src/modules/stockpile/entities/stockpile.entity.ts
    - apps/api/src/modules/stockpile/entities/stockpile-event.entity.ts
    - apps/api/src/modules/stockpile/entities/stockpile-balance.entity.ts
    - apps/api/src/modules/stockpile/entities/stockpile-threshold.entity.ts
    - apps/api/src/modules/stockpile/services/stockpile-event.service.ts
    - apps/api/src/modules/stockpile/services/stockpile-balance.service.ts
    - apps/api/src/modules/stockpile/services/stockpile-valuation.service.ts
    - apps/api/src/modules/stockpile/services/stockpile-threshold.service.ts
    - apps/api/src/modules/stockpile/controllers/stockpile.controller.ts
    - apps/api/src/modules/stockpile/event-handlers/rotation-completed.handler.ts
    - apps/api/src/modules/stockpile/event-handlers/balance-projection.handler.ts
    - apps/api/src/modules/stockpile/jobs/balance-recompute.job.ts
    - apps/api/src/modules/stockpile/migrations/1716300000000__create_stockpile.sql
    - apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql
    - apps/api/src/modules/stockpile/migrations/1716300200000__create_stockpile_balance.sql
    - apps/api/src/modules/stockpile/migrations/1716300300000__create_stockpile_threshold.sql
    - apps/api/test/unit/stockpile/stockpile-event.spec.ts
    - apps/api/test/unit/stockpile/stockpile-event-chain-integrity.spec.ts
    - apps/api/test/unit/stockpile/outbox-stockpile-inflow.spec.ts
    - apps/api/test/unit/stockpile/stockpile-balance.spec.ts
    - apps/api/test/unit/stockpile/stockpile-valuation.spec.ts
    - apps/api/test/unit/stockpile/stockpile-threshold.spec.ts
    - apps/web/src/app/features/stockpile/stockpile.module.ts
    - apps/web/src/app/features/stockpile/stockpile-routes.ts
    - apps/web/src/app/features/stockpile/pages/stockpile-list.component.ts
    - apps/web/src/app/features/stockpile/pages/stockpile-events.component.ts
    - apps/web/src/app/features/stockpile/pages/stockpile-thresholds.component.ts
    - apps/web/src/app/features/stockpile/pages/stockpile-adjustment.component.ts
    - apps/web/src/app/features/stockpile/services/stockpile-api.service.ts
  modified:
    - docs/adr/ADR-0006-stockpile-event-sourcing.md (Draft → Accepted + Implementation Notes)
    - apps/api/src/app.module.ts (StockpileModule wiring)
    - apps/web/src/app/app.routes.ts (stockpile route entry)

key-decisions:
  - "stockpile_event partitioned BY RANGE (occurred_at_utc) monthly — composite PK (id, occurred_at_utc) required by Postgres; partitions pre-created for current + next 2 months with a quarterly run-book extending the list"
  - "Chain-of-hash payload is JSON.stringify of fixed key order {event_type, stockpile_id, tonnage_delta_kg, material_type, calibre_code, operational_day_id, source_reference, occurred_at_utc} — frozen because EventChainVerifier rebuilds via Postgres jsonb_build_object server-side and must byte-match"
  - "Idempotency uses double defense: service pre-check on source_reference->>'rotation_id' + DB unique partial index stockpile_event_rotation_uq — outbox replays are safe"
  - "cost_model_version=1 ships with a deterministic XOF zero-cost stub from StockpileValuationService.computeInflowCost — wired to real fuel cost in W3-P06 ADR-0007. Shape is final; resolver evolves"
  - "Threshold semantics are edge-triggered (old > thr && new <= thr) — staying-below does not re-emit, preventing alert spam"
  - "BalanceRecomputeJob runs @Cron(EVERY_DAY_AT_3AM) UTC for Phase 2; per-site TZ scheduling deferred to Phase 4 consolidation engine"
  - "STOCKPILE_ADJUSTMENT requires SITE_MANAGER + non-empty reason + photo_sha256 — enforced server-side (service-level invariants) and surfaced in UI as required form fields"

requirements-completed: [STK-01, STK-02, STK-03]

duration: 60min
completed: 2026-05-13
---

# Phase 02 Plan W2-P05: Stockpile Event-Sourced Summary

**Event-sourced inventory ledger with monthly RANGE partitioning, SHA-256 chain-of-hash, materialized balance projection with weighted-average cost-per-ton (cost_model_version=1), edge-triggered threshold alerts, and idempotent outbox materialization from `production.transport.rotation_completed`. Five backend services, six unit specs, four web components, one ADR promoted Accepted.**

## Performance

- **Duration:** ~60 min (most code landed in parallel with W2-P04 via P04 auto-staging; this plan ratified, hardened UI, refined ADR)
- **Completed:** 2026-05-13
- **Tasks:** 5/5
- **Files created:** 30
- **Files modified:** 3 (ADR-0006, app.module.ts, app.routes.ts)

## Accomplishments

- `stockpile_event` table with monthly RANGE partitions on `occurred_at_utc`, composite PK `(id, occurred_at_utc)`, 4-value enum, BEFORE UPDATE/DELETE trigger raising `restrict_violation`, unique partial index for rotation idempotency, RLS on parent (cascades to partitions)
- `StockpileEventService.append` computes SHA-256(prev_hash plus canonical_payload) inside the same transaction as the row INSERT; canonical payload is a deterministic JSON shape matching the W0 EventChainVerifier's `CANONICAL_PAYLOAD_SQL.stockpile_event`
- Chain integrity spec (100-event fixture + injected single-byte corruption) proves the generic verifier detects tampering — uses the same `buildCanonicalPayload` + `sha256` helpers as the writer
- `RotationCompletedHandler` consumes `production.transport.rotation_completed`, looks up stockpile by `unloaded_at_zone_id`, calls `StockpileValuationService.computeInflowCost` (XOF zero-cost stub for Phase 2), appends `STOCKPILE_INFLOW`. Replay-safe via double idempotency (service + DB index)
- `StockpileBalanceService.applyEvent` runs SELECT FOR UPDATE then balance update + weighted-avg recompute on INFLOW then UPSERT inside its own tx; the threshold check fires after commit so a notification failure cannot roll back inventory state
- `StockpileThresholdService.checkCrossing` emits `production.stockpile.threshold_crossed` with edge-triggered semantics (critical_low takes precedence over low; high upward symmetric); subsequent events that stay on the same side do not re-emit
- `StockpileValuationService.computeWeightedAverage` operates entirely in bigint minor units; canonical 2-inflow scenario (1000 kg @ 100 + 1000 kg @ 200 = 150) verified by unit spec
- `BalanceRecomputeJob` runs nightly (UTC 03:00) summing events per (tenant, stockpile, calibre); drift > 1 kg emits `production.stockpile.balance_drift_detected`
- Web UI: standalone Angular components for list (with `stockpile.cost_model_version_disclaimer` provisional label + weighted_avg_cost column), events timeline, thresholds grid, and adjustment form (Web Crypto API client-side SHA-256 photo digest, reason >= 3 chars required, SITE_MANAGER role hint)
- ADR-0006 promoted to **Accepted** with a comprehensive **Implementation Notes** section covering schema, partitioning, chain-of-hash, outbox materialization, valuation v1, projection, drift detection, and threshold dedupe semantics

## Task Commits

| Task | Name                                                                                | Commit               | Files                                                                          |
| ---- | ----------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| 1    | stockpile + stockpile_event monthly-partitioned + chain-of-hash + RLS               | (W2-P04 auto-staged commits; ratified here) | 4 migrations, 4 entities, controller, service, 2 specs                         |
| 2    | Outbox handler — TruckRotation.completed -> STOCKPILE_INFLOW (transactional)        | `78c4586`            | rotation-completed.handler.ts + outbox-stockpile-inflow.spec.ts                |
| 3    | stockpile_balance projection + threshold + valuation + nightly recompute            | `0448e07`            | balance-projection.handler.ts, jobs/balance-recompute.job.ts, balance + valuation + threshold specs, stockpile.module.ts |
| 4    | Web stockpile UI — list / events / thresholds / adjustment + provisional label + photo SHA-256 | `5585fff` + `ce801cc` | 4 page components, stockpile-routes.ts, stockpile.module.ts, stockpile-api.service.ts, app.routes.ts |
| 5    | Refine ADR-0006 -> Accepted + Implementation Notes                                  | `ce801cc`            | docs/adr/ADR-0006-stockpile-event-sourcing.md                                  |

## Decisions Made

- **Monthly RANGE partitioning over Timescale hypertable** — Plain partitioning is simpler and works fine at the ~500 rotations/day target; revisit Phase 5 when IoT pushes volumes 10x. Documented in ADR-0006 Alternatives.
- **Composite PK (id, occurred_at_utc)** — Postgres requires the partitioning column to participate in every unique constraint on a partitioned table. Tradeoff accepted: idempotency lookups go via the partial unique index on `(tenant_id, source_reference->>'rotation_id')` instead of a single-column PK.
- **Same JSON canonicalization helper on writer and verifier** — `buildCanonicalPayload` in the service produces UTF-8 bytes byte-identical to what the W0 verifier's `CANONICAL_PAYLOAD_SQL.stockpile_event` produces via `jsonb_build_object(...)::text`. Frozen field order documented in ADR-0006.
- **Notification fired AFTER projection commit** — `StockpileBalanceService.applyEvent` finishes its tx, then calls `StockpileThresholdService.checkCrossing`. A failed alert dispatch never rolls back inventory state. Tradeoff: at-most-once notification on the original event; nightly drift detector catches any missed alerts indirectly via balance audit.
- **XOF zero-cost stub for v1 valuation** — Keeps the `computeInflowCost` contract final while the fuel module is unwired. Real cost-per-liter wiring lands W3-P06 (ADR-0007). Test asserts the stub returns `{costPerTonMinorUnits: 0n, currency: 'XOF'}`.
- **STOCKPILE_ADJUSTMENT: SITE_MANAGER + reason + photo_sha256** — Three independent invariants enforced in the service (`assertAuthorization` + `assertInvariants`) and surfaced in the UI (form-level required + Web Crypto API client-side digest computation).

## Deviations from Plan

**1. [Rule 3 — Blocking] Test pointer files in `src/modules/stockpile/tests/`**

- **Found during:** Plan kickoff while ratifying P04 auto-staged code.
- **Issue:** Plan listed tests under `apps/api/src/modules/stockpile/tests/*.spec.ts`, but P04 had placed actual specs in `apps/api/test/unit/stockpile/` (the repo's monorepo test convention used by every other module) and left stub pointer files in `src/modules/stockpile/tests/`.
- **Fix:** Adopted the pointer-files-in-module + real-specs-in-test/unit convention as-is. Both locations now coexist; verify scripts (`pnpm --filter=@gravel/api test stockpile-*`) discover the real specs via Jest's `testMatch`.
- **Files affected:** `apps/api/src/modules/stockpile/tests/*.spec.ts` (pointer comments) + `apps/api/test/unit/stockpile/*.spec.ts` (real specs)
- **Commits:** part of `0448e07` and `78c4586`

**2. [Rule 2 — Missing critical functionality] Photo SHA-256 + provisional cost label in UI**

- **Found during:** Task 4 acceptance criteria check (`provisoire`/`stockpile.cost_provisional_label` and `requires reason and photo (sha256)`).
- **Issue:** Initial UI commit (`5585fff`) had adjustment form with reason only (no photo), and list component had no provisional cost label.
- **Fix:** Enhanced `stockpile-adjustment.component.ts` with `<input type=file>` + Web Crypto API `crypto.subtle.digest('SHA-256', ...)` producing 64-hex digest, `canSubmit()` guard requiring reason >= 3 chars and valid hex digest. Updated `stockpile-list.component.ts` to surface `stockpile.cost_model_version_disclaimer` + add `weighted_avg_cost` column. Updated `stockpile-api.service.ts` to thread `photo_sha256` into `source_reference`.
- **Commit:** `ce801cc`

**Total deviations:** 2 (1 x Rule 3 blocking, 1 x Rule 2 missing critical functionality). Both auto-fixed inline.

## Issues Encountered

- **Most code arrived via P04 auto-staging** — Several P05 files (`stockpile.module.ts`, `balance-projection.handler.ts`, `jobs/balance-recompute.job.ts`, `tests/*.spec.ts`, web stockpile dir) were created during the W2-P04 execution window and either committed alongside P04 (`78c4586`, `0448e07`, `5585fff`) or left untracked. This plan ratified them: read each file, verified against acceptance criteria, extended where needed (Rule 2 deviation above), and committed the ADR refinement + UI hardening as `ce801cc`. No rework or rewrites — all P04-leaked code was production-quality and matched the plan.
- **ADR-0006 was already half-promoted** — P04 had flipped the Status header to `Accepted` but had not yet added the `Implementation Notes` section the plan's verify script checks for. Added in `ce801cc`.

No blockers introduced.

## User Setup Required

None — no new external services. Stockpile module reuses Postgres + outbox + EventEmitter2 infrastructure from W0-P01.

## Next Phase Readiness

- **W2-P05 deliverables for downstream:**
  - `production.stockpile.event_appended` — projection handlers downstream may subscribe (currently only `BalanceProjectionHandler` does)
  - `production.stockpile.threshold_crossed` — Alert module (W0) consumes
  - `production.stockpile.balance_drift_detected` — Ops/observability consumer (Grafana alert wiring in W3-P08)
  - `StockpileEventService.append` API — reusable for sales BL outflow (Phase 3) and inter-pile TRANSFER

- **W3-P06 (Fuel + cost allocation):** Will replace the `StockpileValuationService.computeInflowCost` XOF zero stub with real fuel-cost attribution. The shape is final; only the resolver evolves. `cost_model_version=1` stays; Phase 4 introduces v2.

- **Phase 3 (Sales / BL):** Will use `STOCKPILE_OUTFLOW_SALE` event_type with the same `StockpileEventService.append` path. Idempotency key shifts from `rotation_id` to `bl_id`.

- **Phase 4 (Analytics / re-valorization):** The append-only ledger enables a Phase 4 re-valorization job that replays every event under `cost_model_version=2` (direct cost + amortization + labor) — possible precisely because no event is mutable.

No blockers.

## Self-Check: PASSED

Verified:

- All 30 created files exist on disk (backend module + tests + web feature dir)
- `docs/adr/ADR-0006-stockpile-event-sourcing.md` contains `Accepted`, `Implementation Notes`, `cost_model_version`, `PARTITION BY RANGE`
- Migration `1716300100000__create_stockpile_event_partitioned.sql` contains `PARTITION BY RANGE (occurred_at_utc)`, `prev_hash BYTEA NOT NULL`, `row_hash BYTEA NOT NULL`, `stockpile_event_2026_05 PARTITION OF stockpile_event`
- Migration `1716300300000__create_stockpile_threshold.sql` contains `CHECK (critical_low_kg < low_kg AND low_kg < high_kg)`
- `stockpile-event.service.ts` contains `sha256` import + chain computation
- `rotation-completed.handler.ts` contains `@OnEvent('production.transport.rotation_completed')` + `STOCKPILE_INFLOW`
- `balance-projection.handler.ts` contains `@OnEvent('production.stockpile.event_appended')` + writes to `stockpile_balance`
- `stockpile-threshold.service.ts` emits `production.stockpile.threshold_crossed`
- `balance-recompute.job.ts` contains `@Cron` decorator and `balance_drift_detected`
- `stockpile-list.component.ts` references `stockpile.cost_model_version_disclaimer` and includes `weighted_avg_cost` column
- `stockpile-thresholds.component.ts` displays threshold band columns
- `stockpile-adjustment.component.ts` requires `reason` (minlength 3) and `photo_sha256` (64-hex regex), computes digest client-side via Web Crypto API
- Task commits visible in git log: `78c4586`, `0448e07`, `5585fff`, `ce801cc`

---
*Phase: 02-vertical-slice-production*
*Completed: 2026-05-13*
