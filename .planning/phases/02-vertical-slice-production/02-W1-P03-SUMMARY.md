---
phase: 02-vertical-slice-production
plan: 02-W1-P03
subsystem: extraction
wave: 1
tags: [extraction, append-only, yield, offline, mobile, d2-20, d2-21, ext-01, ext-02]
requires:
  - apps/api/src/modules/master-data/production-equipment.service.ts (W0-P01 assertActive)
  - apps/api/src/modules/sync/registry.ts (W2-P03 ConflictRegistry)
  - apps/api/src/modules/master-data/entities/operational-day.entity.ts (FND-04)
  - apps/api/src/modules/master-data/entities/bench.entity.ts (FND-04)
  - apps/mobile/lib/core/sync/append_only_repository.dart (W0-P01)
  - apps/api/src/modules/i18n/locales/{fr,en,ar}/extraction.json (W0-P01)
provides:
  - apps/api/src/modules/extraction/* (ExtractionCycle entity + service + yield + controller + migration)
  - apps/web/src/app/features/extraction/* (Angular feature module + read-only AG Grid review + yield grid)
  - apps/mobile/lib/features/extraction/* (offline form + sqlite_async repository)
  - apps/mobile/integration_test/extraction_test.dart
affects:
  - W2-P04 (stockpile/transport weighing) — confirms that tonnage authority lives downstream (D2-21)
  - W2-P05 (fuel) — pattern reuse for offline append-only mobile capture
  - W3-P06 (dashboard) — yield_t_per_h KPI available per equipment/operator/day
tech-stack:
  added: []
  patterns:
    - 'Append-only entity with @SyncEntity({ strategy: "append_only_event" }) + DB trigger guard + controller-level 405 response'
    - 'Productive-hours yield calculation = sum(estimated_t) / ((cycle_time - downtime) / 60)'
    - 'Mobile sqlite_async-backed AppendOnlyRepository (no Drift codegen step required)'
    - 'Immutability confirmation modal before append-only submit'
key-files:
  created:
    - apps/api/src/modules/extraction/entities/extraction-cycle.entity.ts
    - apps/api/src/modules/extraction/services/extraction-cycle.service.ts
    - apps/api/src/modules/extraction/services/extraction-yield.service.ts
    - apps/api/src/modules/extraction/controllers/extraction-cycle.controller.ts
    - apps/api/src/modules/extraction/extraction.module.ts
    - apps/api/src/modules/extraction/migrations/1716100000000__create_extraction_cycle.sql
    - apps/api/src/modules/extraction/tests/extraction-cycle.spec.ts
    - apps/api/src/modules/extraction/tests/extraction-yield.spec.ts
    - apps/api/test/unit/extraction/extraction-cycle.spec.ts
    - apps/api/test/unit/extraction/extraction-yield.spec.ts
    - apps/web/src/app/features/extraction/extraction.module.ts
    - apps/web/src/app/features/extraction/extraction-routes.ts
    - apps/web/src/app/features/extraction/pages/extraction-cycle-list.component.ts
    - apps/web/src/app/features/extraction/pages/extraction-cycle-list.component.html
    - apps/mobile/lib/features/extraction/repositories/extraction_cycle_repository.dart
    - apps/mobile/lib/features/extraction/screens/extraction_cycle_form.dart
    - apps/mobile/integration_test/extraction_test.dart
  modified:
    - apps/api/src/app.module.ts (registered ExtractionModule)
    - apps/api/src/modules/sync/registry.ts (extraction_cycle entry, append_only_event strategy)
    - apps/web/src/app/app.routes.ts (lazy /extraction route — committed by parallel lint pass)
decisions:
  - 'ExtractionCycle is append-only at three layers: SyncEntity decorator, DB trigger blocking UPDATE/DELETE, controller-level 405 responses'
  - 'estimated_tonnage_t is operational only — UI carries an amber "Estimé — pesage transport faisant foi" badge on both web and mobile (D2-21)'
  - '6 downtime reason codes wired exactly per D2-20: meal_break, fuel, mechanical, weather, safety, other'
  - '3 material types wired exactly: granite_brut, tout_venant, sterile — criblage refinements deferred to Phase 3'
  - 'Mobile repository uses sqlite_async directly instead of Drift codegen — avoids a build_runner step on Windows hosts without the local toolchain'
  - 'Active-equipment guard reused from W0-P01 (ProductionEquipmentService.assertActive) instead of duplicating the check'
metrics:
  duration_seconds: 720
  completed_at: '2026-05-12T20:20:00Z'
  task_count: 2
  file_count: 17
  test_count_added: 17
---

# Phase 02 Plan 02-W1-P03: Extraction Vertical Slice Summary

Delivers the EXT-01 + EXT-02 vertical slice: append-only ExtractionCycle entity on the backend with productive-hours yield aggregation, AG Grid web review surface, and an offline-first Flutter form with an immutability-confirmation gate. Tonnage capture is explicitly labelled "Estimé" on every surface so directors never confuse the operational rendement with the authoritative weighing tonnage that lands in W2-P04 (D2-21).

## Tasks Executed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Backend extraction — ExtractionCycle entity + service + yield calc | 78378ab | done |
| 2 | Mobile extraction cycle form + offline repository | 4696f00 | done |
| —  | Web extraction module + AG Grid list (auto-bundled into parallel commit) | e8a5914 | done |

## Highlights

### Triple-layer append-only invariant (Task 1)
ExtractionCycle defends append-only at three independent layers so a bug in
one cannot leak mutations through:
1. `@SyncEntity({ strategy: 'append_only_event' })` on the entity — picked up
   by the sync registry to instruct PowerSync's conflict resolver.
2. Postgres trigger `extraction_cycle_no_update` raising on `BEFORE UPDATE
   OR DELETE` — defense-in-depth at the DB layer.
3. Controller PATCH/PUT/DELETE handlers throwing `MethodNotAllowedException`
   with `code: EXTRACTION_CYCLE_APPEND_ONLY`.

Corrections land as new rows whose `corrects_id` FK points at the original
(mirror of the DrilledHole pattern from W1-P02).

### Yield calculation (Task 1, EXT-02)
`ExtractionYieldService.aggregate()` is a pure function exposed alongside
`computeYield(tenantId, dayId)` so the math is unit-testable without a DB.
For each `(equipment_id, operator_id)` pair on a given operational day:

```
productive_minutes = Σ ((cycle_ended_at - cycle_started_at) - downtime_minutes)
productive_hours   = productive_minutes / 60
yield_t_per_h      = Σ estimated_tonnage_t / productive_hours
```

The plan reference scenario (5 cycles, 250 t, 10 h elapsed, 60 min downtime
→ 9 h productive → 27.78 t/h) is asserted explicitly in
`extraction-yield.spec.ts`.

### D2-21 disclaimer everywhere (Tasks 1 + 2)
The estimated-tonnage disclaimer surfaces in three places:
- Migration comment block.
- Web list header: amber badge with `extraction.estimated_disclaimer` i18n
  key (FR/EN/AR already populated in W0-P01).
- Mobile form: the very first widget rendered above all inputs is the
  amber "Estimé — tonnage faisant foi = pesage transport" banner.

### Mobile sqlite_async repository (Task 2)
Implemented directly on `sqlite_async` instead of Drift. Reasoning: adding
a new Drift table requires a `build_runner build` invocation, which depends
on the local Flutter toolchain — currently unavailable on the Windows host
per the persistent STATE.md blocker. The repository shares the underlying
sqlite file with the PowerSync-managed connection, so uploads pick up the
rows without additional wiring once the PowerSync rules are extended.

### Immutability confirmation modal (Task 2)
Before any submit, the form opens an `AlertDialog` with title "Confirmer
l'envoi" and content "Cycle non modifiable après envoi. Confirmer ?". The
confirm button carries the test key `extraction-confirm-immutable` so the
integration test (and any future E2E) can drive it deterministically.

## Test Coverage Added

| Suite | Tests | Project | Notes |
|-------|-------|---------|-------|
| extraction-cycle.spec | 10 | api/unit | EXT-01 — create, equipment-active guard, downtime invariants, append-only rejection, corrects_id |
| extraction-yield.spec | 5 | api/unit | EXT-02 — plan reference scenario (250t/9h/27.78t/h), multi-key aggregation, zero-productive-time, null-downtime, empty input |
| extraction_test.dart | 2 | mobile/integration | EXT-01 — offline submit → pending_sync row, validation guard |

Backend specs are mirrored into `apps/api/test/unit/extraction/*.spec.ts`
so Jest's `unit` project (`testMatch: <rootDir>/test/unit/**/*.spec.ts`)
picks them up; each wrapper is a one-line `import` of the colocated spec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Web feature files committed by parallel lint pass**
- **Found during:** Task 2 commit staging
- **Issue:** A parallel agent's `fix(api lint)` commit (`e8a5914`) auto-bundled my staged web extraction files into its own commit before my Task 2 commit ran. The route wiring in `app.routes.ts` was likewise picked up by `9341ac8`.
- **Fix:** No-op. The files landed in git with correct content under the parallel agent's commit. My Task 2 commit therefore contains only the mobile additions. All 4 web files (`extraction.module.ts`, `extraction-routes.ts`, `pages/extraction-cycle-list.component.{ts,html}`) plus the lazy route are present and verified with `git ls-files`.
- **Commit:** e8a5914 (web feature files) + 9341ac8 (route wiring)

### CLAUDE.md compliance

- OSS-only: AG Grid Community used (not Enterprise) — already enforced by W0-P01.
- i18n keys reference FR/EN/AR namespaces only — no Dioula/Baoulé/Wolof.
- No hardcoded secrets; no money math (this plan does no currency work).
- Append-only DB enforcement satisfies the security requirement that audit-relevant tables cannot be silently mutated.

## Known Stubs

- The web list reads from `/api/extraction/cycles` and `/api/extraction/cycles/yield`. These endpoints are real (controller in this plan). No data is stubbed.
- The mobile form receives `activeEquipmentIds` + `activeBenchIds` as props from the parent screen. The provider for those lists is expected from the W3 dashboard / shell wiring; this is documented inline. Not a stub — explicit composition boundary.
- `extractionCycleRepositoryProvider` throws `UnimplementedError` until overridden at composition root — the same pattern the activity-log repository uses (W2-P03).

## Blockers Surfaced

None new. The persistent Windows-host toolchain blocker (no local pnpm/flutter/docker) continues to mean CI is the source of truth for `pnpm --filter=@gravel/api test` and `flutter test integration_test/extraction_test.dart`. The specs are written to run under the `unit` Jest project (no DB) and `integration_test` (in-memory sqlite_async) so they will execute on the next CI run without environmental adjustments.

## Authentication Gates

None — the plan emits no calls to Keycloak, AWS, or any external service at build time.

## Self-Check: PASSED

- All 17 created files exist on disk and are tracked by git
- `apps/api/src/modules/extraction/migrations/1716100000000__create_extraction_cycle.sql` contains `CREATE TYPE material_type_enum AS ENUM ('granite_brut','tout_venant','sterile')`
- Same file contains `CREATE TYPE downtime_reason_enum AS ENUM ('meal_break','fuel','mechanical','weather','safety','other')`
- `apps/api/src/modules/extraction/entities/extraction-cycle.entity.ts` contains `@SyncEntity({ strategy: 'append_only_event' })`
- Same file contains `operational_day_id` mapping
- `extraction-yield.spec.ts` asserts the 250 t / 9 h / 27.78 t/h reference scenario
- `extraction_test.dart` asserts `pendingCount == 1` after offline submit
- Web list HTML contains `<ag-grid-angular`
- `extraction.module.ts` exports `class ExtractionModule`
- Mobile form source contains `granite_brut` and `meal_break` (raw enum strings + Semantics label)
- 78378ab + 4696f00 + bundled e8a5914/9341ac8 all present in `git log`
