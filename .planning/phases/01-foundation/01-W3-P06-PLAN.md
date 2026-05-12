---
phase: 01-foundation
plan: 06
type: execute
wave: 3
depends_on: [01, 02, 03, 04]
files_modified:
  - apps/api/src/otel/otel.ts
  - apps/api/src/main.ts
  - apps/web/src/app/core/otel/otel.ts
  - apps/mobile/lib/core/otel/otel.dart
  - infra/helm/grafana-lgtm/Chart.yaml
  - infra/helm/grafana-lgtm/values.yaml
  - infra/grafana/dashboards/phase-1-health.json
  - infra/grafana/datasources/datasources.yaml
  - .github/workflows/test.yml
  - .github/workflows/ci.yml
  - docs/adr/ADR-0001-rls-multi-tenancy.md
  - docs/adr/ADR-0002-powersync-sync-engine.md
  - docs/adr/ADR-0003-operational-day-model.md
  - docs/adr/ADR-0004-audit-chain-of-hash.md
  - docs/adr/ADR-0005-db-per-tenant-upgrade-path.md
autonomous: true
requirements: [FND-02, FND-06, FND-08, FND-11]
must_haves:
  truths:
    - "Every HTTP request from web/mobile → API → DB produces a distributed trace visible in Tempo"
    - "Structured JSON logs from NestJS reach Loki; metrics http_request_duration_seconds and db_query_duration_seconds reach Mimir"
    - "A Grafana dashboard 'Phase 1 Health' renders RED/GREEN status for: HTTP 5xx rate, DB connection pool, sync events processed, audit chain integrity, cross-tenant test, chaos test"
    - "CI gates are BLOCKING for: cross-tenant rls-leak test (FND-02), chaos test (FND-11), DST operational-day test (FND-08), audit-chain test (FND-06), tofu validate"
    - "5 ADRs documented and committed at docs/adr/ADR-0001..0005"
  artifacts:
    - path: "infra/grafana/dashboards/phase-1-health.json"
      provides: "Single-pane dashboard for phase-1 health"
      contains: "rls-leak"
    - path: "docs/adr/ADR-0001-rls-multi-tenancy.md"
      provides: "Decision record for RLS strategy with DB-per-tenant upgrade path reference"
    - path: ".github/workflows/test.yml"
      provides: "CI gates with rls-leak, chaos, DST, audit-chain marked BLOCKING (no continue-on-error)"
  key_links:
    - from: "apps/api OTel SDK init"
      to: "OTLP collector (Grafana LGTM)"
      via: "OTEL_EXPORTER_OTLP_ENDPOINT env"
      pattern: "OTLP_ENDPOINT"
    - from: ".github/workflows/test.yml jobs.security/chaos"
      to: "merge gate"
      via: "branch protection rules"
      pattern: "needs:"
---

<objective>
Cross-cutting close-out: OpenTelemetry SDK instrumentation across NestJS + Angular + Flutter; Grafana LGTM stack deployed via Helm; "Phase 1 Health" dashboard wired (5 status tiles); CI gates explicitly marked BLOCKING for the 4 invariant tests (rls-leak, chaos, DST, audit-chain) plus tofu validate; 5 ADRs written and committed. Closes the Phase 1 quality loop — every other plan's deliverable is now observable, gated, and documented.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/01-foundation/01-CONTEXT.md
@.planning/phases/01-foundation/01-RESEARCH.md
@.planning/phases/01-foundation/01-VALIDATION.md
@.planning/phases/01-foundation/01-W0-P01-PLAN.md
@.planning/phases/01-foundation/01-W1-P02-PLAN.md
@.planning/phases/01-foundation/01-W1-P03-PLAN.md
@.planning/phases/01-foundation/01-W1-P04-PLAN.md

<interfaces>
Verification commands from 01-VALIDATION.md:
- FND-02: `pnpm --filter @gravel/api test:rls-leak`
- FND-06: `pnpm --filter @gravel/api test:int -- audit-chain.spec.ts`
- FND-08: `pnpm --filter @gravel/api test -- operational-day.spec.ts`
- FND-11: `pnpm --filter @gravel/api test:chaos`

Metric names from D-38: `http_request_duration_seconds`, `db_query_duration_seconds`, `sync_event_processed_total`.
</interfaces>
</context>

<tasks>

<task type="auto" id="W2-P06-T01">
  <name>OpenTelemetry instrumentation: NestJS + Angular + Flutter</name>
  <files>apps/api/src/otel/otel.ts, apps/api/src/main.ts, apps/web/src/app/core/otel/otel.ts, apps/mobile/lib/core/otel/otel.dart</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-37, D-38)
    - .planning/phases/01-foundation/01-RESEARCH.md (Standard Stack OTel section)
  </read_first>
  <action>
    `apps/api/src/otel/otel.ts`:
      ```ts
      import { NodeSDK } from '@opentelemetry/sdk-node';
      import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
      import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
      import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
      import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
      import { Resource } from '@opentelemetry/resources';
      import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

      export function startOtel() {
        const sdk = new NodeSDK({
          resource: new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: 'gravel-api',
            [SemanticResourceAttributes.SERVICE_VERSION]: process.env.GIT_SHA || 'dev',
            [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
          }),
          traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
          metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
            exportIntervalMillis: 10_000,
          }),
          instrumentations: [getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
          })],
        });
        sdk.start();
        return sdk;
      }
      ```
    Call `startOtel()` BEFORE `NestFactory.create()` in `apps/api/src/main.ts`. Add `tenant_id` and `request_id` as span attributes via an Interceptor that reads ClsService and tags the current span.

    Add custom metrics in `apps/api/src/common/metrics.ts`:
      - `http_request_duration_seconds` histogram (auto from http instrumentation)
      - `db_query_duration_seconds` histogram (auto from pg instrumentation)
      - `sync_event_processed_total` counter — incremented in sync.controller.ts

    `apps/web/src/app/core/otel/otel.ts`: web tracer using `@opentelemetry/sdk-trace-web` + `@opentelemetry/instrumentation-fetch` + `@opentelemetry/instrumentation-document-load` + OTLP HTTP exporter. Init in `app.config.ts`.

    `apps/mobile/lib/core/otel/otel.dart`: use package `opentelemetry: ^0.18.0` (Dart OTel SDK); init in `main.dart` AFTER `runApp`. Instrument Dio interceptor to propagate W3C traceparent header.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api build && pnpm --filter @gravel/web build && cd apps/mobile && flutter analyze</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/main.ts` calls `startOtel()` before NestFactory.create
    - Web app initializes OTel before bootstrap
    - Mobile app uses opentelemetry package and propagates traceparent in Dio
    - 3 metric names from D-38 exist in code (grep finds each)
  </acceptance_criteria>
  <done>Telemetry pipeline ready; data flows once Grafana LGTM is deployed (next task).</done>
</task>

<task type="auto" id="W2-P06-T02">
  <name>Grafana LGTM Helm deployment + Phase 1 Health dashboard</name>
  <files>infra/helm/grafana-lgtm/Chart.yaml, infra/helm/grafana-lgtm/values.yaml, infra/grafana/datasources/datasources.yaml, infra/grafana/dashboards/phase-1-health.json</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-37, D-38)
  </read_first>
  <action>
    `infra/helm/grafana-lgtm/Chart.yaml`: dependencies on `grafana/loki-stack` (loki+promtail), `grafana/grafana`, `grafana/tempo-distributed`, `grafana/mimir-distributed`, `open-telemetry/opentelemetry-collector` (otlp ingress).

    `values.yaml`: pin versions per D-37 (Grafana 11, Loki 3, Tempo 2.5, Mimir 2.13). Collector receives OTLP/gRPC + OTLP/HTTP, exports to loki/tempo/mimir respectively. Single-AZ Phase 1.

    `infra/grafana/datasources/datasources.yaml`: provisioned datasources for loki, tempo, mimir.

    `infra/grafana/dashboards/phase-1-health.json`: dashboard JSON with 6 panels:
      1. HTTP 5xx rate (Mimir/Prometheus): `sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])) by (service_name)`
      2. DB query p95 latency: `histogram_quantile(0.95, sum(rate(db_query_duration_seconds_bucket[5m])) by (le))`
      3. Sync events processed/sec: `rate(sync_event_processed_total[5m])`
      4. CI gate status (annotated panel pulling latest workflow runs via GitHub API datasource OR a static markdown panel pointing to: GitHub Actions, rls-leak, chaos, DST, audit-chain — links + last run)
      5. Audit chain integrity status: a stat panel queried via Loki `{job="gravel-api",audit_event="chain_break_detected"}` — should be 0
      6. Cross-tenant leak alarms: stat panel reading metric `cross_tenant_leak_attempts_total` — should be 0
    The dashboard uses Grafana 11 variables for `tenant_id` and `service_name`.
  </action>
  <verify>
    <automated>helm dependency update infra/helm/grafana-lgtm && helm template infra/helm/grafana-lgtm > /tmp/lgtm.yaml && grep -E "loki|tempo|mimir|grafana" /tmp/lgtm.yaml | head -10 && jq '.title,.panels|length' infra/grafana/dashboards/phase-1-health.json</automated>
  </verify>
  <acceptance_criteria>
    - `helm template` renders without error
    - dashboard JSON has 6 panels and title "Phase 1 Health"
    - datasources.yaml lists loki, tempo, mimir
    - OTel Collector configured for OTLP/gRPC + OTLP/HTTP
  </acceptance_criteria>
  <done>Observability stack deployable; dashboard provisioned.</done>
</task>

<task type="auto" id="W2-P06-T03">
  <name>CI gates hardening: mark blocking tests, enforce branch protection</name>
  <files>.github/workflows/test.yml, .github/workflows/ci.yml</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-08 cross-tenant CI BLOCKING, D-13 chaos CI BLOCKING, D-21 DST test, D-43 GitHub Actions)
    - .planning/phases/01-foundation/01-VALIDATION.md (Validation Sign-Off)
  </read_first>
  <action>
    Update `.github/workflows/test.yml` so the following jobs are explicitly NON-skipping and `needs` from a final `gate` job:
      - `rls-leak`: `pnpm --filter @gravel/api test:rls-leak` (no continue-on-error)
      - `chaos`: `pnpm --filter @gravel/api test:chaos`
      - `dst-test`: dedicated job runs `pnpm --filter @gravel/api test -- operational-day.spec.ts`
      - `audit-chain`: `pnpm --filter @gravel/api test:int -- audit-chain.spec.ts`
      - `identity-int`: `pnpm --filter @gravel/api test:int -- identity.spec.ts` (services postgres + keycloak)
      - `master-data-int`: `pnpm --filter @gravel/api test:int -- master-data.spec.ts`
      - `web-e2e`: `pnpm --filter @gravel/web e2e` (full stack via docker compose) — only on PR to main
      - `mobile-int`: `cd apps/mobile && flutter test integration_test/sync_offline_test.dart`
      - `tofu-validate`: triggered by `.github/workflows/tofu-validate.yml`
    Add a final `gate:` job: `needs: [lint, build, unit, rls-leak, chaos, dst-test, audit-chain, identity-int, master-data-int, mobile-int]` that simply echoes "all green"; this is the job that branch protection requires.

    Update `.github/workflows/ci.yml` to similarly use `needs:` chains.

    Add ESLint custom rule wiring (already declared in plan 01) and ensure CI runs `pnpm -r run lint` with `--max-warnings=0`. Add specific custom rules now (small TS plugin checked in under `tools/eslint-rules/`):
      - `no-float-money`: bans `number` type for fields ending in `_minor`, `Amount`, or properties of `MoneyAmount`
      - `no-raw-created-at-date`: forbids `created_at::date` substring in any file under `src/**/reports/`

    Document branch protection requirement in `docs/adr/ADR-0001` and in `README.md`.
  </action>
  <verify>
    <automated>grep -c "continue-on-error" .github/workflows/test.yml && yq '.jobs | keys' .github/workflows/test.yml && grep -E "rls-leak|chaos|dst-test|audit-chain" .github/workflows/test.yml | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `continue-on-error` does NOT appear on rls-leak / chaos / dst-test / audit-chain jobs
    - Final `gate` job lists all blocking jobs in `needs:`
    - Custom ESLint rules registered and CI runs lint with --max-warnings=0
    - Branch protection requirement documented
  </acceptance_criteria>
  <done>CI is now load-bearing: a green PR proves Phase 1 invariants hold.</done>
</task>

<task type="auto" id="W2-P06-T04">
  <name>Architecture Decision Records (5 ADRs)</name>
  <files>docs/adr/ADR-0001-rls-multi-tenancy.md, docs/adr/ADR-0002-powersync-sync-engine.md, docs/adr/ADR-0003-operational-day-model.md, docs/adr/ADR-0004-audit-chain-of-hash.md, docs/adr/ADR-0005-db-per-tenant-upgrade-path.md</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (all D-* decisions; "Aucun ADR ni spec interne préexistant" + Specific Idea "Documentation ADR encouragée … au minimum 4 ADRs")
    - .planning/phases/01-foundation/01-RESEARCH.md (Pitfall sections referenced per ADR)
  </read_first>
  <action>
    Each ADR follows the MADR template (Status / Context / Decision / Consequences / Alternatives Considered / References). Concrete content:

    `ADR-0001-rls-multi-tenancy.md`: documents D-06, D-07, D-08; references Pitfall 1 (PgBouncer transaction mode), Pitfall 7 (test that lies green), Pitfall 2 (TypeORM CLS); explains 3-layer defense; rejected: schema-per-tenant, app-only WHERE; consequences: cross-tenant CI gate is mandatory blocking.

    `ADR-0002-powersync-sync-engine.md`: documents D-10, D-11, D-12, D-13, D-14; references Pitfall 3 (logical slot exhaustion), Pitfall 5 (Drift schema drift); rejected: ElectricSQL (write-path maturity), custom sync (6+ month tax), CRDT-everywhere; consequences: PowerSync commercial dependency, single replica Phase 1.

    `ADR-0003-operational-day-model.md`: documents D-19, D-20, D-21, D-22; references Pitfall 9 (DST), Pitfall 7 (boundary convention `>=` start `<` end); rejected: `created_at::date` rollups; consequences: CI lint blocks `created_at::date` in reports/.

    `ADR-0004-audit-chain-of-hash.md`: documents D-27, D-28, D-29; references Pitfall 6 (perf — chain per (tenant_id, table_name) partition); explains content-addressed storage convention; consequences: chain verifier mandatory before regulator handover; partitioned audit_log.

    `ADR-0005-db-per-tenant-upgrade-path.md`: documents D-09; explicitly NO implementation in v1; documents the migration recipe (per-tenant logical replication slot → pg_basebackup → cutover); references PITFALLS.md #7; consequences: code must continue to honor `tenant_id` even after physical separation.

    Each ADR begins with: `Status: Accepted | Date: 2026-05-12 | Authors: Phase 1 planner`.
  </action>
  <verify>
    <automated>ls docs/adr/ADR-000*.md | wc -l && for f in docs/adr/ADR-000*.md; do head -1 "$f"; done</automated>
  </verify>
  <acceptance_criteria>
    - 5 ADRs exist with the prescribed numbering
    - Each ADR has Status / Context / Decision / Consequences sections
    - Each ADR references the decision IDs it documents
    - Cross-references between ADRs are intact (e.g., ADR-0001 mentions ADR-0005 upgrade path)
  </acceptance_criteria>
  <done>Phase 1 decisions are auditable and discoverable; future phases can update Status if a decision evolves.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gravel/api build` succeeds with OTel init
- `helm template infra/helm/grafana-lgtm` renders
- `.github/workflows/test.yml` has BLOCKING jobs for rls-leak, chaos, dst-test, audit-chain
- 5 ADRs committed under docs/adr/
- All FND-* verification commands in 01-VALIDATION.md can flip `nyquist_compliant: true`
</verification>

<success_criteria>
- Phase 1 is observable end-to-end (web→api→DB traces + structured logs + metrics)
- Phase 1 is gated by CI on every PR (no merge if invariant tests red)
- Phase 1 is documented (5 ADRs make decisions discoverable)
- The Phase 1 ROADMAP success criteria 1-5 are all backed by passing automated tests + the 5 ADRs explain the WHY
</success_criteria>

<output>
After completion create `.planning/phases/01-foundation/01-W3-P06-SUMMARY.md` and update `.planning/phases/01-foundation/01-VALIDATION.md` frontmatter: set `nyquist_compliant: true` and `wave_0_complete: true` (Wave 0 stubs all turned green by upstream plans).
</output>
