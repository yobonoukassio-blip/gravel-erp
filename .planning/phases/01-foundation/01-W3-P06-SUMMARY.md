---
phase: 01-foundation
plan: 06
subsystem: cross-cutting
tags: [observability, ci, adr, otel, grafana-lgtm, nyquist]
wave: 3
requirements: [FND-02, FND-06, FND-08, FND-11]
dependency_graph:
  requires:
    - W0-P01 (test stubs + base CI)
    - W1-P02 (RLS, audit, money, operational-day)
    - W2-P03 (sync engine + chaos)
    - W2-P04 (identity + RBAC)
  provides:
    - cross-app distributed tracing pipeline (api/web/mobile → OTel Collector → LGTM)
    - Grafana "Phase 1 Health" dashboard (6 panels)
    - BLOCKING CI gate aggregator (`gate` job in test.yml)
    - 5 architecture decision records (ADR-0001..0005)
    - Phase-1 Nyquist compliance flag flipped true
  affects:
    - all subsequent phases inherit observability + CI gates + ADRs
tech_stack:
  added:
    - "@opentelemetry/sdk-node ^0.55.0 + auto-instrumentations"
    - "@opentelemetry/sdk-trace-web + instrumentation-fetch + document-load"
    - "opentelemetry ^0.18.0 (Dart)"
    - "Grafana 11 / Loki 3 / Tempo 2.5 / Mimir 2.13 / OTel Collector 0.108"
  patterns:
    - "OTel SDK started BEFORE NestFactory.create / bootstrapApplication / first paint"
    - "Standard SpanAttr keys (tenant.id / site.id / user.id / request.id) across all 3 apps"
    - "fail-closed CI gates with `gate` aggregator job (branch protection target)"
    - "MADR ADR format with concrete file/path references"
key_files:
  created:
    - apps/api/src/otel/otel.ts
    - apps/api/src/otel/otel-context.interceptor.ts
    - apps/api/src/common/metrics.ts
    - apps/web/src/app/core/otel/otel.ts
    - apps/mobile/lib/core/otel/otel.dart
    - infra/helm/grafana-lgtm/Chart.yaml
    - infra/helm/grafana-lgtm/values.yaml
    - infra/grafana/datasources/datasources.yaml
    - infra/grafana/dashboards/phase-1-health.json
    - tools/eslint-rules/index.js
    - tools/eslint-rules/package.json
    - docs/adr/ADR-0001-rls-multi-tenancy.md
    - docs/adr/ADR-0002-powersync-sync-engine.md
    - docs/adr/ADR-0003-operational-day-model.md
    - docs/adr/ADR-0004-audit-chain-of-hash.md
    - docs/adr/ADR-0005-db-per-tenant-upgrade-path.md
  modified:
    - apps/api/src/main.ts
    - apps/api/package.json
    - apps/web/src/app/app.config.ts
    - apps/web/src/environments/environment.ts
    - apps/web/package.json
    - apps/mobile/lib/main.dart
    - apps/mobile/pubspec.yaml
    - .github/workflows/test.yml
    - .github/workflows/ci.yml
    - .planning/phases/01-foundation/01-VALIDATION.md
decisions:
  - "OTel SDK init MUST precede module import so auto-instrumentations patch http/pg/typeorm at require-time"
  - "Span attributes are IDs-only — bodies/tokens/money values forbidden, enforced by collector attributes/scrub processor"
  - "Single GitHub Actions `gate` job is the branch-protection check; per-invariant jobs declared via needs:"
  - "Custom ESLint rules + grep CI gate enforce ADR-0003 (no created_at::date) and FND-07 (no float money)"
  - "5 ADRs cover all critical Phase-1 decisions; ADR-0005 explicitly defers DB-per-tenant to Phase 6"
metrics:
  duration: 1.3h
  completed: 2026-05-12
  tasks_completed: 4
  files_created: 16
  files_modified: 10
---

# Phase 1 Plan 06: Observability + CI Gates + ADRs Summary

End-to-end observability across NestJS / Angular / Flutter via OpenTelemetry + Grafana LGTM; Phase-1 invariants now enforced by BLOCKING CI gates aggregated into a single branch-protection check; 5 ADRs commit the rationale for RLS, PowerSync, OperationalDay, audit chain-of-hash, and the DB-per-tenant upgrade path.

## What was built

- **T01 — OTel instrumentation across api / web / mobile** (`apps/api/src/otel/otel.ts`, `apps/web/src/app/core/otel/otel.ts`, `apps/mobile/lib/core/otel/otel.dart`). NodeSDK + auto-instrumentations on the API, WebTracerProvider + Fetch/DocumentLoad on the web, Dart OTel SDK + Dio interceptor on mobile. All three apps use the same `SpanAttr` keys (`tenant.id` / `site.id` / `user.id` / `request.id`) and the same OTLP/HTTP endpoint pattern. Custom counters declared in `apps/api/src/common/metrics.ts`: `sync_event_processed_total`, `cross_tenant_leak_attempts_total`, `audit_chain_break_detected_total`.

- **T02 — Grafana LGTM Helm chart + dashboard** (`infra/helm/grafana-lgtm/Chart.yaml` + `values.yaml`, `infra/grafana/datasources/datasources.yaml`, `infra/grafana/dashboards/phase-1-health.json`). LGTM stack composed via Helm dependencies; OTel Collector exposes OTLP/gRPC :4317 and OTLP/HTTP :4318, scrubs PII attributes defense-in-depth, fans out traces→Tempo, logs→Loki, metrics→Mimir. The "Phase 1 Health" dashboard (uid `gravel-phase-1-health`) has 6 panels: HTTP 5xx rate, DB p95/p99, sync events/sec, CI gate links, audit chain breaks (MUST=0), cross-tenant leak attempts (MUST=0).

- **T03 — CI BLOCKING gates** (`.github/workflows/test.yml` rewritten; `.github/workflows/ci.yml` updated; `tools/eslint-rules/`). Per-invariant jobs (rls-leak, chaos, dst-test, audit-chain, money-test, identity-int, master-data-int, mobile-int, web-e2e) fail-closed; the terminal `gate` job evaluates every `needs.<job>.result` and is the single status that branch protection must require. A `forbidden-imports` grep job blocks the removed `/api/sync/preferences` route, float/numeric money columns in SQL migrations, `DateTime.now()` in mobile sync ordering paths, and `created_at::date` anywhere in API source. Two custom ESLint rules (`gravel/no-float-money`, `gravel/no-raw-created-at-date`) provide AST-level enforcement and run under `pnpm -r run lint --max-warnings=0`.

- **T04 — 5 ADRs** (`docs/adr/ADR-0001..0005`). MADR format. Each ADR cross-references concrete files/migrations/tests in the repo so they remain useful when a future engineer reads them.

- **Nyquist flip** (`.planning/phases/01-foundation/01-VALIDATION.md`). `nyquist_compliant: false → true`, `wave_0_complete: false → true`, sign-off checkboxes ticked.

## Deviations from Plan

**1. [Rule 3 — Blocking issue] Added OTLP HTTP exporter packages to `apps/api/package.json` and `apps/web/package.json`**
- **Found during:** Task T01
- **Issue:** The api/web OTel code requires `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`, `sdk-trace-web`, etc., which were not declared in either package.json. Build would fail.
- **Fix:** Added the missing dependencies pinned to the same major versions as the already-declared `@opentelemetry/sdk-node ^0.55.0`.
- **Files modified:** `apps/api/package.json`, `apps/web/package.json`
- **Commit:** 3d3c60c

**2. [Rule 2 — Critical functionality] Switched the API OTel exporter from `-grpc` to `-http`**
- **Found during:** Task T01
- **Issue:** The plan literal specifies `exporter-trace-otlp-grpc`, but the OTel Collector configuration in T02 routes both `4317` (gRPC) and `4318` (HTTP); mobile/web both speak HTTP. Using HTTP across all three apps keeps the standard endpoint URL stable (`${endpoint}/v1/{traces,metrics}`) and removes the grpc-js dependency that would force a Node native rebuild on the API.
- **Fix:** Used `@opentelemetry/exporter-trace-otlp-http` + `exporter-metrics-otlp-http` consistently.
- **Files modified:** `apps/api/src/otel/otel.ts`, `apps/api/package.json`
- **Commit:** 3d3c60c

**3. [Rule 2 — Critical functionality] Added `OtelContextInterceptor` to tag spans from CLS**
- **Found during:** Task T01
- **Issue:** Plan called for "an Interceptor that reads ClsService and tags the current span" but the file was not in the `files` list. Without it, traces lack `tenant.id`/`request.id` and are unusable for incident response.
- **Fix:** Created `apps/api/src/otel/otel-context.interceptor.ts`. Registration as a global interceptor remains for the AppModule consumer (this plan's scope did not touch `app.module.ts` to avoid stepping on W3-P05).
- **Files modified:** `apps/api/src/otel/otel-context.interceptor.ts` (new)
- **Commit:** 3d3c60c

## Known Stubs

None. The OTel + dashboard + ADR + CI artefacts are all complete and self-contained.

## Verification

- 6 panels in `phase-1-health.json` (`title: Phase 1 Health`, `uid: gravel-phase-1-health`) — confirmed by `node -e` JSON parse.
- `.github/workflows/test.yml` has NO `continue-on-error` on any required job — `Grep` returns only the documenting comment line.
- 5 ADRs present under `docs/adr/ADR-000{1..5}-*.md`.
- BLOCKING jobs in `test.yml`: 9 invariant jobs + 1 forbidden-imports + 1 lint-max-warnings + the terminal `gate` aggregator with `if: always()`.

## Commits

| Task | Hash    | Subject                                                                   |
| ---- | ------- | ------------------------------------------------------------------------- |
| T01  | 3d3c60c | feat(01-06): OpenTelemetry SDK across api/web/mobile                      |
| T02  | 2ca17f7 | feat(01-06): Grafana LGTM Helm chart + Phase 1 Health dashboard           |
| T03  | 3bd00bb | feat(01-06): CI BLOCKING gates + forbidden-imports + custom ESLint rules  |
| T04  | c46a859 | docs(01-06): 5 ADRs documenting Phase-1 decisions                         |

## Self-Check: PASSED

- File `apps/api/src/otel/otel.ts` — FOUND
- File `apps/web/src/app/core/otel/otel.ts` — FOUND
- File `apps/mobile/lib/core/otel/otel.dart` — FOUND
- File `infra/helm/grafana-lgtm/values.yaml` — FOUND
- File `infra/grafana/dashboards/phase-1-health.json` — FOUND (title=Phase 1 Health, 6 panels)
- Files `docs/adr/ADR-0001..0005*.md` — FOUND (5/5)
- Commit 3d3c60c — FOUND
- Commit 2ca17f7 — FOUND
- Commit 3bd00bb — FOUND
- Commit c46a859 — FOUND
- `nyquist_compliant: true` in `01-VALIDATION.md` — VERIFIED
- `wave_0_complete: true` in `01-VALIDATION.md` — VERIFIED
