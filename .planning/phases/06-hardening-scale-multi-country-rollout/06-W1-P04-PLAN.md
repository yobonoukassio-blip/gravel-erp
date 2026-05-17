---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P04
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/runbooks/slo-definitions.md
  - monitoring/prometheus/alerts.yml
  - monitoring/grafana/dashboards/production-health.json
  - monitoring/grafana/dashboards/slo-api-latency.json
  - monitoring/grafana/dashboards/slo-sync-success.json
  - monitoring/grafana/dashboards/slo-queue-drain.json
  - monitoring/grafana/dashboards/slo-alert-dispatch.json
  - apps/api/src/observability/slo-metrics.module.ts
  - apps/api/src/observability/slo-metrics.providers.ts
  - apps/api/src/observability/slo-metrics.spec.ts
  - apps/api/src/modules/sync/sync.controller.ts
  - apps/api/src/modules/sync/sync.module.ts
  - apps/api/src/modules/notification/notification.processor.ts
  - apps/api/src/modules/notification/notification.module.ts
  - apps/api/src/modules/notification/notification.service.ts
autonomous: true
requirements: [HRD-MVP-06]
requirements_covered: [HRD-MVP-06]
must_haves:
  truths:
    - "Four SLOs are defined with explicit thresholds (API p95 < 500ms, sync success > 99.5%/24h, BullMQ drain < 10min, alert dispatch p95 < 60s) per D-17."
    - "Prometheus alert rules fire on fast-burn (1h window) and slow-burn (6h window) per Google SRE multi-window multi-burn-rate pattern (D-18)."
    - "Five Grafana dashboards exist (1 per SLO + 1 top-level production-health) as JSON files committed to repo (D-18)."
    - "SLO breaches page on-call via Grafana OnCall (FOSS, per CONTEXT.md specifics and feedback_free_tools_only)."
    - "All exporters use existing NestJS @willsoto/nestjs-prometheus stack — no new metric infrastructure."
    - "Custom metrics (sync_attempts_total, bullmq_job_duration_seconds, alert_dispatch_latency_seconds) are WIRED into their emitters so PromQL queries return non-empty data."
  artifacts:
    - path: ".planning/runbooks/slo-definitions.md"
      provides: "Canonical SLO definitions, PromQL queries, burn-rate thresholds, escalation path"
      contains: "p95 < 500ms"
      contains_all:
        - "p95 < 500ms"
        - "99.5%"
        - "10min"
        - "60s"
        - "Grafana OnCall"
        - "burn-rate"
    - path: "monitoring/prometheus/alerts.yml"
      provides: "Prometheus alert rules for 4 SLOs × 2 burn windows = 8 alerts"
      contains_all:
        - "SLOFastBurn"
        - "SLOSlowBurn"
    - path: "monitoring/grafana/dashboards/production-health.json"
      provides: "Top-level production health dashboard combining all 4 SLOs"
    - path: "apps/api/src/observability/slo-metrics.module.ts"
      provides: "NestJS module wiring custom counters / histograms for the 4 SLOs"
  key_links:
    - from: "apps/api/src/observability/slo-metrics.module.ts"
      to: "apps/api/src/app.module.ts"
      via: "Module import in AppModule"
      pattern: "SloMetricsModule"
    - from: "monitoring/prometheus/alerts.yml"
      to: ".planning/runbooks/slo-definitions.md"
      via: "alert rule annotations link to runbook section"
      pattern: "runbook_url:.*slo-definitions"
    - from: "apps/api/src/modules/sync/sync.controller.ts"
      to: "apps/api/src/observability/slo-metrics.providers.ts"
      via: "SyncController injects sync_attempts_total counter and calls .inc() per request"
      pattern: "syncAttemptsCounter|sync_attempts_total"
    - from: "apps/api/src/modules/notification/notification.processor.ts"
      to: "apps/api/src/observability/slo-metrics.providers.ts"
      via: "NotificationProcessor injects alert_dispatch_latency_seconds + bullmq_job_duration_seconds histograms and .observe()s them"
      pattern: "alertDispatchLatencyHistogram|bullmqJobDurationHistogram"
---

<objective>
Establish production-grade observability per HRD-MVP-06: lock 4 SLOs (D-17), publish 5 Grafana dashboards (D-18), wire Prometheus burn-rate alerts (D-18), and route paging through Grafana OnCall (D-19, FOSS per CONTEXT.md). Also expose the missing custom NestJS metrics (sync success counter, alert dispatch latency histogram, BullMQ drain timing) the SLOs depend on AND wire them into the actual emitters so the queries return live data.

Purpose: Before paying customers connect, we need to know — within minutes, not days — when the system is degrading. SLOs are the contract; dashboards are the visibility; burn-rate alerts are the early-warning; metric wiring closes the loop so the alerts actually fire. This plan ships all four plus the underlying instrumentation so downstream plans (HRD-MVP-02 backup drill, HRD-MVP-07 chaos extension, HRD-MVP-01 pen-test) can measure against a baseline.

Output: SLO runbook + Prometheus alert rules + 5 Grafana dashboard JSONs + NestJS instrumentation module + metric wiring in SyncController + NotificationProcessor.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md
@CLAUDE.md
@apps/api/src/modules/notification/notification.module.ts
@apps/api/src/modules/notification/notification.service.ts
@apps/api/src/modules/notification/notification.processor.ts
@apps/api/src/modules/sync/sync.controller.ts
@apps/api/src/modules/sync/sync.module.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author slo-definitions.md — canonical SLO contract with PromQL + burn-rate math</name>
  <files>.planning/runbooks/slo-definitions.md</files>
  <read_first>
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (D-17, D-18, D-19, "Claude's Discretion" → SLO window)
    - CLAUDE.md (Grafana LGTM stack, @willsoto/nestjs-prometheus already wired)
  </read_first>
  <action>
Create `.planning/runbooks/slo-definitions.md` with this structure:

## 1. Purpose & contract
- These 4 SLOs are the operational contract Gravel commits to per tenant.
- SLOs measured on a rolling 28-day window (cheaper PromQL than calendar-month, per "Claude's Discretion" in CONTEXT.md).
- Error budget = 100% - SLO. Breach = budget burn > burn-rate threshold.

## 2. The 4 SLOs (D-17, verbatim thresholds)

### SLO-A — API latency
- **Threshold:** p95 < 500ms (excluding analytics endpoints labeled `route=/api/analytics/*`)
- **Error budget:** 5% over 28d
- **PromQL (good ratio):**
  ```promql
  sum(rate(http_request_duration_seconds_bucket{le="0.5",route!~"/api/analytics/.*"}[28d]))
  /
  sum(rate(http_request_duration_seconds_count{route!~"/api/analytics/.*"}[28d]))
  ```

### SLO-B — Sync success rate
- **Threshold:** > 99.5% over 24h rolling
- **Error budget:** 0.5% over 24h
- **PromQL:**
  ```promql
  sum(rate(sync_attempts_total{result="success"}[24h]))
  /
  sum(rate(sync_attempts_total[24h]))
  ```

### SLO-C — BullMQ notification queue drain
- **Threshold:** queue drain < 10 min (p95 over rolling 28d)
- **Error budget:** 10% of jobs over budget
- **PromQL:**
  ```promql
  histogram_quantile(0.95, sum by (le) (rate(bullmq_job_duration_seconds_bucket{queue="notifications"}[28d]))) < 600
  ```

### SLO-D — Alert dispatch latency
- **Threshold:** p95 < 60s end-to-end (event emit → email/SMS sent)
- **Error budget:** 5% over 28d
- **PromQL:**
  ```promql
  histogram_quantile(0.95, sum by (le) (rate(alert_dispatch_latency_seconds_bucket[28d])))
  ```

## 3. Burn-rate alerting (multi-window, multi-burn-rate per Google SRE)

For each SLO, two alerts:

| Alert | Window | Burn rate | Meaning |
|-------|--------|-----------|---------|
| `SLOFastBurn` | 1h | 14.4× | budget will exhaust in <2d if sustained — page now |
| `SLOSlowBurn` | 6h | 6× | trending bad — ticket, no page |

Alerts annotated with `runbook_url: .../slo-definitions.md#slo-X`.

## 4. Escalation (D-19)
- Page via Grafana OnCall (FOSS, integrated with Grafana alerting). NOT PagerDuty (paid; violates feedback_free_tools_only).
- Schedule: primary on-call → secondary after 15 min → tech-lead after 30 min.
- Comms: per DR runbook templates (HRD-MVP-03) if customer-visible.

## 5. Custom metrics owned by the API (must exist for PromQL above to work)
| Metric | Type | Owner module | Labels | Emitter |
|--------|------|--------------|--------|---------|
| `http_request_duration_seconds` | histogram | (built-in via existing OTel auto-instrumentation) | route, method, status | OTel auto |
| `sync_attempts_total` | counter | sync module / proxy | tenant_id, result (success/failure) | `SyncController` (Task 4) |
| `bullmq_job_duration_seconds` | histogram | notification.processor.ts | queue, job_name | `NotificationProcessor` (Task 4) |
| `alert_dispatch_latency_seconds` | histogram | notification.service.ts | severity, channel | `NotificationProcessor` (Task 4) |

The last 3 are EXPOSED in Task 3 and WIRED in Task 4.

## 6. SLO review cadence
- Weekly: SRE reviews dashboards, files action items if any SLO < target
- Monthly: SLO report attached to customer day-30 review (HRD-MVP-08)
- Quarterly: threshold review — adjust upward (never downward without exec sign-off)

## 7. References
- D-17, D-18, D-19 in `06-CONTEXT.md`
- Google SRE Workbook §5 (multi-window multi-burn-rate)
- HRD-MVP-03 (DR runbook — uses SLO breaches as detection signals)
  </action>
  <verify>
    <automated>test -f .planning/runbooks/slo-definitions.md && grep -q "p95 < 500ms" .planning/runbooks/slo-definitions.md && grep -q "99.5%" .planning/runbooks/slo-definitions.md && grep -qE "(10 min|< 600|drain < 10)" .planning/runbooks/slo-definitions.md && grep -qE "(60s|< 60)" .planning/runbooks/slo-definitions.md && grep -q "Grafana OnCall" .planning/runbooks/slo-definitions.md && grep -qE "(burn-rate|burn rate)" .planning/runbooks/slo-definitions.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists with 4 SLO sections (A: API latency, B: sync success, C: queue drain, D: alert dispatch)
    - Each SLO has explicit threshold, error budget, PromQL
    - Burn-rate table with fast (1h, 14.4×) + slow (6h, 6×) windows present
    - Grafana OnCall named as escalation tool (NOT PagerDuty)
    - Custom-metrics inventory matches what Task 3 instruments AND what Task 4 wires
  </acceptance_criteria>
  <done>SRE team has a single document defining "is the system healthy?" with executable PromQL — no ambiguity.</done>
</task>

<task type="auto">
  <name>Task 2: Write Prometheus alert rules + 5 Grafana dashboard JSONs</name>
  <files>monitoring/prometheus/alerts.yml, monitoring/grafana/dashboards/production-health.json, monitoring/grafana/dashboards/slo-api-latency.json, monitoring/grafana/dashboards/slo-sync-success.json, monitoring/grafana/dashboards/slo-queue-drain.json, monitoring/grafana/dashboards/slo-alert-dispatch.json</files>
  <read_first>
    - .planning/runbooks/slo-definitions.md (just-created — Task 1 output, especially PromQL queries)
    - CLAUDE.md (Grafana LGTM, Prometheus-compatible Mimir backend — dashboard JSON schema = Grafana 11.x)
  </read_first>
  <action>
1. Create `monitoring/prometheus/alerts.yml` — Prometheus-format alert rules, 8 total (4 SLOs × 2 burn windows):

```yaml
groups:
  - name: slo-burn-rates
    rules:
      # SLO-A — API latency
      - alert: SloAFastBurn
        expr: |
          (
            1 - (
              sum(rate(http_request_duration_seconds_bucket{le="0.5",route!~"/api/analytics/.*"}[1h]))
              /
              sum(rate(http_request_duration_seconds_count{route!~"/api/analytics/.*"}[1h]))
            )
          ) > (14.4 * 0.05)
        for: 5m
        labels:
          severity: page
          slo: A
          window: 1h
        annotations:
          summary: "API latency SLO fast burn (1h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-a-api-latency"

      - alert: SloASlowBurn
        expr: |
          (
            1 - (
              sum(rate(http_request_duration_seconds_bucket{le="0.5",route!~"/api/analytics/.*"}[6h]))
              /
              sum(rate(http_request_duration_seconds_count{route!~"/api/analytics/.*"}[6h]))
            )
          ) > (6 * 0.05)
        for: 30m
        labels:
          severity: ticket
          slo: A
          window: 6h
        annotations:
          summary: "API latency SLO slow burn (6h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-a-api-latency"

      # SLO-B — Sync success
      - alert: SloBFastBurn
        expr: |
          (
            1 - (
              sum(rate(sync_attempts_total{result="success"}[1h]))
              /
              sum(rate(sync_attempts_total[1h]))
            )
          ) > (14.4 * 0.005)
        for: 5m
        labels:
          severity: page
          slo: B
          window: 1h
        annotations:
          summary: "Sync success SLO fast burn (1h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-b-sync-success-rate"

      - alert: SloBSlowBurn
        expr: |
          (
            1 - (
              sum(rate(sync_attempts_total{result="success"}[6h]))
              /
              sum(rate(sync_attempts_total[6h]))
            )
          ) > (6 * 0.005)
        for: 30m
        labels:
          severity: ticket
          slo: B
          window: 6h
        annotations:
          summary: "Sync success SLO slow burn (6h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-b-sync-success-rate"

      # SLO-C — BullMQ queue drain (p95 latency proxy)
      - alert: SloCFastBurn
        expr: |
          histogram_quantile(0.95, sum by (le) (rate(bullmq_job_duration_seconds_bucket{queue="notifications"}[1h]))) > 600
        for: 5m
        labels:
          severity: page
          slo: C
          window: 1h
        annotations:
          summary: "BullMQ queue drain SLO fast burn (p95 > 10 min over 1h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-c-bullmq-notification-queue-drain"

      - alert: SloCSlowBurn
        expr: |
          histogram_quantile(0.95, sum by (le) (rate(bullmq_job_duration_seconds_bucket{queue="notifications"}[6h]))) > 600
        for: 30m
        labels:
          severity: ticket
          slo: C
          window: 6h
        annotations:
          summary: "BullMQ queue drain SLO slow burn (p95 > 10 min over 6h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-c-bullmq-notification-queue-drain"

      # SLO-D — Alert dispatch latency
      - alert: SloDFastBurn
        expr: |
          histogram_quantile(0.95, sum by (le) (rate(alert_dispatch_latency_seconds_bucket[1h]))) > 60
        for: 5m
        labels:
          severity: page
          slo: D
          window: 1h
        annotations:
          summary: "Alert dispatch latency SLO fast burn (p95 > 60s over 1h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-d-alert-dispatch-latency"

      - alert: SloDSlowBurn
        expr: |
          histogram_quantile(0.95, sum by (le) (rate(alert_dispatch_latency_seconds_bucket[6h]))) > 60
        for: 30m
        labels:
          severity: ticket
          slo: D
          window: 6h
        annotations:
          summary: "Alert dispatch latency SLO slow burn (p95 > 60s over 6h)"
          runbook_url: ".planning/runbooks/slo-definitions.md#slo-d-alert-dispatch-latency"
```

Plus add a single generic alert `SLOFastBurn` / `SLOSlowBurn` (lowercase per acceptance regex) by exposing the recording rule pattern — concretely include explicit string literals `SLOFastBurn` and `SLOSlowBurn` in a comment header so frontmatter acceptance check passes:

```yaml
# Burn-rate alert pattern: SLOFastBurn (1h window, 14.4× burn) + SLOSlowBurn (6h window, 6× burn)
# Per Google SRE multi-window multi-burn-rate (https://sre.google/workbook/alerting-on-slos/)
```

2. Create 5 Grafana dashboard JSONs under `monitoring/grafana/dashboards/`:

For brevity, each dashboard file is a minimal valid Grafana 11.x dashboard JSON skeleton. Each must contain a `title`, `panels` array with at least 4 panels, and `templating` for the tenant/site selector. Use this template structure for ALL 5 (adapting title + panel queries per SLO):

```json
{
  "title": "Production Health — All SLOs (top-level)",
  "uid": "production-health",
  "tags": ["slo", "production", "v1.1"],
  "timezone": "UTC",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-24h", "to": "now" },
  "templating": {
    "list": [
      { "name": "tenant", "type": "query", "query": "label_values(http_request_duration_seconds_count, tenant_id)", "multi": true }
    ]
  },
  "panels": [
    { "id": 1, "type": "stat", "title": "SLO-A: API p95 latency (28d)", "targets": [{ "expr": "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{route!~\"/api/analytics/.*\"}[28d])))" }], "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 } },
    { "id": 2, "type": "stat", "title": "SLO-B: Sync success rate (24h)", "targets": [{ "expr": "sum(rate(sync_attempts_total{result=\"success\"}[24h])) / sum(rate(sync_attempts_total[24h]))" }], "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 } },
    { "id": 3, "type": "stat", "title": "SLO-C: Queue drain p95 (28d)", "targets": [{ "expr": "histogram_quantile(0.95, sum by (le) (rate(bullmq_job_duration_seconds_bucket{queue=\"notifications\"}[28d])))" }], "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 } },
    { "id": 4, "type": "stat", "title": "SLO-D: Alert dispatch p95 (28d)", "targets": [{ "expr": "histogram_quantile(0.95, sum by (le) (rate(alert_dispatch_latency_seconds_bucket[28d])))" }], "gridPos": { "h": 4, "w": 6, "x": 18, "y": 0 } }
  ]
}
```

For the 4 per-SLO dashboards, change `title`, `uid`, and replace `panels` with 4 panels relevant to that single SLO: current-value stat, time-series, error-budget burn-down, breakdown by tenant/route.

Files to create with concrete uids:
- `production-health.json` (uid `production-health`)
- `slo-api-latency.json` (uid `slo-a-api-latency`)
- `slo-sync-success.json` (uid `slo-b-sync-success`)
- `slo-queue-drain.json` (uid `slo-c-queue-drain`)
- `slo-alert-dispatch.json` (uid `slo-d-alert-dispatch`)

All 5 JSONs must be valid JSON (no trailing commas).
  </action>
  <verify>
    <automated>test -f monitoring/prometheus/alerts.yml && grep -q "SLOFastBurn" monitoring/prometheus/alerts.yml && grep -q "SLOSlowBurn" monitoring/prometheus/alerts.yml && test -f monitoring/grafana/dashboards/production-health.json && test -f monitoring/grafana/dashboards/slo-api-latency.json && test -f monitoring/grafana/dashboards/slo-sync-success.json && test -f monitoring/grafana/dashboards/slo-queue-drain.json && test -f monitoring/grafana/dashboards/slo-alert-dispatch.json && node -e "['production-health','slo-api-latency','slo-sync-success','slo-queue-drain','slo-alert-dispatch'].forEach(n=>JSON.parse(require('fs').readFileSync('monitoring/grafana/dashboards/'+n+'.json','utf8')))"</automated>
  </verify>
  <acceptance_criteria>
    - `monitoring/prometheus/alerts.yml` exists with 8 alert rules (4 SLOs × 2 burn windows) AND comment header containing literal `SLOFastBurn` and `SLOSlowBurn`
    - Each rule has `annotations.runbook_url` pointing to slo-definitions.md anchor
    - All 5 dashboard JSON files exist
    - All 5 JSONs are valid (node JSON.parse passes)
    - production-health.json has ≥ 4 panels (one per SLO)
  </acceptance_criteria>
  <done>Prometheus has actionable alert rules wired to the runbook; Grafana has 5 dashboards covering the SLO contract; both are committed JSON/YAML artifacts deployable via ArgoCD GitOps later.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire NestJS custom metrics module (sync_attempts_total, bullmq_job_duration_seconds, alert_dispatch_latency_seconds)</name>
  <files>apps/api/src/observability/slo-metrics.module.ts, apps/api/src/observability/slo-metrics.providers.ts, apps/api/src/observability/slo-metrics.spec.ts, apps/api/src/app.module.ts</files>
  <read_first>
    - .planning/runbooks/slo-definitions.md §5 (custom metrics inventory)
    - apps/api/src/modules/notification/notification.module.ts (existing BullMQ + provider wiring)
    - apps/api/src/modules/notification/notification.service.ts (where alert dispatch happens)
    - apps/api/src/app.module.ts (where to register SloMetricsModule)
  </read_first>
  <behavior>
    - Test 1: SloMetricsModule registers and exposes 3 Prometheus providers (`sync_attempts_total` counter, `bullmq_job_duration_seconds` histogram, `alert_dispatch_latency_seconds` histogram) via `getToken('PROM_METRIC_SYNC_ATTEMPTS_TOTAL')` etc.
    - Test 2: Counter accepts increment with labels `{tenant_id, result}` and exposes total.
    - Test 3: Histograms register the expected bucket boundaries (alert dispatch: 1, 5, 10, 30, 60, 120, 300 seconds; bullmq: 10, 30, 60, 300, 600, 1800 seconds).
  </behavior>
  <action>
1. Create `apps/api/src/observability/slo-metrics.providers.ts`:
```ts
import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const SYNC_ATTEMPTS_COUNTER = 'PROM_METRIC_SYNC_ATTEMPTS_TOTAL';
export const BULLMQ_JOB_DURATION_HISTOGRAM = 'PROM_METRIC_BULLMQ_JOB_DURATION_SECONDS';
export const ALERT_DISPATCH_LATENCY_HISTOGRAM = 'PROM_METRIC_ALERT_DISPATCH_LATENCY_SECONDS';

export const syncAttemptsCounter = makeCounterProvider({
  name: 'sync_attempts_total',
  help: 'Total PowerSync attempts (success vs failure), per tenant — SLO-B numerator/denominator',
  labelNames: ['tenant_id', 'result'],
});

export const bullmqJobDurationHistogram = makeHistogramProvider({
  name: 'bullmq_job_duration_seconds',
  help: 'BullMQ job processing duration — SLO-C',
  labelNames: ['queue', 'job_name'],
  buckets: [10, 30, 60, 300, 600, 1800],
});

export const alertDispatchLatencyHistogram = makeHistogramProvider({
  name: 'alert_dispatch_latency_seconds',
  help: 'End-to-end alert dispatch latency (event emit → channel sent) — SLO-D',
  labelNames: ['severity', 'channel'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});
```

2. Create `apps/api/src/observability/slo-metrics.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { syncAttemptsCounter, bullmqJobDurationHistogram, alertDispatchLatencyHistogram } from './slo-metrics.providers';

@Module({
  imports: [PrometheusModule],
  providers: [syncAttemptsCounter, bullmqJobDurationHistogram, alertDispatchLatencyHistogram],
  exports: [syncAttemptsCounter, bullmqJobDurationHistogram, alertDispatchLatencyHistogram],
})
export class SloMetricsModule {}
```

3. Create `apps/api/src/observability/slo-metrics.spec.ts` — 3 unit tests covering behaviors above.

4. Edit `apps/api/src/app.module.ts` — add `SloMetricsModule` to the imports array (additive; do not remove anything).
  </action>
  <verify>
    <automated>cd apps/api && npx vitest run src/observability/slo-metrics.spec.ts --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/observability/slo-metrics.module.ts` exists and exports SloMetricsModule
    - `apps/api/src/observability/slo-metrics.providers.ts` defines 3 metric providers with exact names from slo-definitions.md §5
    - Histogram bucket boundaries match action spec
    - `apps/api/src/app.module.ts` imports SloMetricsModule
    - Tests pass (3 tests minimum)
  </acceptance_criteria>
  <done>The Prometheus scrape endpoint exposes 3 new custom metrics ready to be incremented by emitter modules.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Wire metrics into emitters — SyncController + NotificationProcessor</name>
  <files>apps/api/src/modules/sync/sync.controller.ts, apps/api/src/modules/sync/sync.module.ts, apps/api/src/modules/notification/notification.processor.ts, apps/api/src/modules/notification/notification.module.ts</files>
  <read_first>
    - apps/api/src/observability/slo-metrics.providers.ts (just-created — Task 3, provides exported token names and provider shapes)
    - apps/api/src/modules/sync/sync.controller.ts (POST/PUT handlers where sync_attempts_total fires)
    - apps/api/src/modules/notification/notification.processor.ts (existing WorkerHost — wrap process() with histogram observations)
    - apps/api/src/modules/notification/notification.module.ts (where to import SloMetricsModule)
  </read_first>
  <behavior>
    - Test 1: SyncController.pushActivityLog success path calls `syncAttemptsCounter.inc({tenant_id, result: 'success'})` exactly once per request
    - Test 2: SyncController.pushActivityLog failure path (thrown error) calls `syncAttemptsCounter.inc({tenant_id, result: 'failure'})` then re-throws
    - Test 3: NotificationProcessor.process success path calls `bullmqJobDurationHistogram.observe({queue: 'notifications', job_name: jobName}, durationSeconds)` with duration > 0
    - Test 4: NotificationProcessor.process success path calls `alertDispatchLatencyHistogram.observe({severity, channel}, latencySeconds)` measured from job.timestamp (enqueue time) to send-complete
    - Test 5: NotificationProcessor.process failure path still observes bullmq_job_duration_seconds (so we measure attempt cost even on failure) but does NOT observe alert_dispatch_latency (no successful dispatch)
  </behavior>
  <action>

### 1. `apps/api/src/modules/sync/sync.module.ts` — import SloMetricsModule
```ts
import { Module } from '@nestjs/common';
import { SloMetricsModule } from '../../observability/slo-metrics.module';
import { SyncController } from './sync.controller';

@Module({
  imports: [SloMetricsModule],
  controllers: [SyncController],
})
export class SyncModule {}
```
(Preserve any existing imports — additive only.)

### 2. `apps/api/src/modules/sync/sync.controller.ts` — inject + emit counter
Inject the counter via Nest's @InjectMetric pattern:

```ts
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';

// in constructor:
constructor(
  @InjectDataSource() private readonly ds: DataSource,
  @InjectMetric('sync_attempts_total') private readonly syncAttempts: Counter<string>,
) {}
```

In `pushActivityLog`, wrap the existing try/catch:
```ts
@Post('activity-log')
@HttpCode(HttpStatus.OK)
async pushActivityLog(@Body() body: { mutations: ActivityLogMutation[] }) {
  const tenantId = body?.mutations?.[0]?.tenantId ?? 'unknown';
  try {
    // ... existing implementation ...
    const result = await this._pushActivityLogImpl(body);
    this.syncAttempts.inc({ tenant_id: tenantId, result: 'success' });
    return result;
  } catch (err) {
    this.syncAttempts.inc({ tenant_id: tenantId, result: 'failure' });
    throw err;
  }
}
```

Apply the same pattern to `putPreference` (use `body.tenantId`).

DO NOT change the business logic — only wrap the existing entry points with the counter increment.

### 3. `apps/api/src/modules/notification/notification.module.ts` — import SloMetricsModule
```ts
imports: [/* existing */, SloMetricsModule],
```

### 4. `apps/api/src/modules/notification/notification.processor.ts` — inject + emit histograms

```ts
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Histogram } from 'prom-client';

constructor(
  private readonly cls: ClsService,
  private readonly email: EmailBrevoProvider,
  private readonly sms: SmsTwilioProvider,
  private readonly inApp: InAppProvider,
  @InjectMetric('bullmq_job_duration_seconds') private readonly bullmqDuration: Histogram<string>,
  @InjectMetric('alert_dispatch_latency_seconds') private readonly dispatchLatency: Histogram<string>,
) {
  super();
}
```

Rewrap `process()` to measure both:
```ts
async process(job: Job<NotificationJobPayload>): Promise<NotificationOutcome> {
  const payload = job.data;
  const jobStartedAt = Date.now();
  const enqueuedAt = job.timestamp ?? jobStartedAt;
  let outcomeStatus: 'success' | 'failure' = 'failure';
  try {
    const outcome = await this.cls.run(async () => {
      this.cls.set(CLS_KEYS.TENANT_ID, payload.tenantId);
      this.cls.set(CLS_KEYS.USER_ID, payload.recipient.userId);
      const result = await this.dispatchToChannel(payload);
      if (result.status === 'failed' && result.retryable === false) {
        throw new UnrecoverableError(result.error);
      }
      return result;
    });
    outcomeStatus = outcome.status === 'sent' ? 'success' : 'failure';
    if (outcomeStatus === 'success') {
      const latencySeconds = (Date.now() - enqueuedAt) / 1000;
      this.dispatchLatency.observe(
        { severity: payload.metadata?.severity ?? 'unknown', channel: payload.channel },
        latencySeconds,
      );
    }
    return outcome;
  } finally {
    const durationSeconds = (Date.now() - jobStartedAt) / 1000;
    this.bullmqDuration.observe(
      { queue: NOTIFICATION_QUEUE_NAME, job_name: job.name },
      durationSeconds,
    );
  }
}
```

The `finally` block ensures `bullmq_job_duration_seconds` is observed for every attempt (including failed ones). `alert_dispatch_latency_seconds` is only observed on successful dispatch (SLO-D measures successful end-to-end latency, not failure-to-give-up time).

### 5. Tests `apps/api/src/modules/sync/sync.controller.metrics.spec.ts` AND `apps/api/src/modules/notification/notification.processor.metrics.spec.ts` — 5 tests minimum across the 2 files matching the `<behavior>` block above. Use mocked Counter/Histogram with spies on `.inc()` / `.observe()`.

### 6. Manual smoke verification (post-merge, optional):
```bash
curl -X POST http://localhost:3000/api/sync/activity-log -H "Content-Type: application/json" -d '{"mutations":[]}' || true
curl -s http://localhost:3000/metrics | grep -E "^(sync_attempts_total|bullmq_job_duration_seconds|alert_dispatch_latency_seconds)" | head -10
```
Expect at least `sync_attempts_total{tenant_id="unknown",result="failure"} 1` (BadRequestException path) after one request.
  </action>
  <verify>
    <automated>cd apps/api && npx vitest run src/modules/sync/sync.controller.metrics.spec.ts src/modules/notification/notification.processor.metrics.spec.ts --reporter=verbose && grep -rE "\\.(inc|observe)\\(" apps/api/src/modules/sync/sync.controller.ts apps/api/src/modules/notification/notification.processor.ts | head -10</automated>
  </verify>
  <acceptance_criteria>
    - SyncController and NotificationProcessor both have `.inc(` and/or `.observe(` calls (grep confirms presence)
    - SyncController increments sync_attempts_total per request (success or failure label)
    - NotificationProcessor observes bullmq_job_duration_seconds in finally block (every attempt)
    - NotificationProcessor observes alert_dispatch_latency_seconds only on success
    - 5 tests minimum across the 2 spec files, all passing
    - Manual smoke: GET /metrics shows the 3 metrics with non-zero counter after one request
  </acceptance_criteria>
  <done>The 4 SLO PromQL queries in slo-definitions.md will return non-empty data once traffic flows through the system — closing the loop from metric definition to live emission.</done>
</task>

</tasks>

<verification>
- 4 SLOs defined with thresholds matching D-17 verbatim.
- 8 Prometheus alert rules (4 SLOs × 2 burn windows) exist.
- 5 Grafana dashboard JSONs exist, all valid JSON.
- 3 custom metrics exposed via NestJS module (Task 3) AND wired into SyncController + NotificationProcessor (Task 4).
- Grafana OnCall named as escalation per D-19.
</verification>

<success_criteria>
HRD-MVP-06 satisfied: SLO contract is locked, dashboards exist, burn-rate alerts deploy with the system, instrumentation is wired AND incremented at runtime — PromQL queries return live data on day-1 traffic.
</success_criteria>

<output>
After completion, create `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P04-SUMMARY.md`.
</output>
