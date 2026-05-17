# SLO Definitions — Gravel Ivoire ERP (HRD-MVP-06)

> Source decisions: D-17, D-18, D-19 in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`.
> Stack: Grafana LGTM (Loki + Grafana 11.x + Tempo + Mimir) + `@willsoto/nestjs-prometheus` (already wired).

## 1. Purpose & contract

- These 4 SLOs are the operational contract Gravel commits to per tenant.
- SLOs are measured on a rolling **28-day window** (cheaper PromQL than calendar-month aggregation, per "Claude's Discretion" in CONTEXT.md).
- **Error budget = 100% − SLO target.** A breach = budget burn rate exceeds the burn-rate threshold (see §3).
- All thresholds below are **verbatim** from D-17 — they MUST NOT be relaxed without exec sign-off + a new ADR.

## 2. The 4 SLOs (D-17, verbatim thresholds)

### SLO-A — API latency

- **Threshold:** p95 < 500ms (excluding analytics endpoints labeled `route=/api/analytics/*` — they're heavy aggregations with their own latency budget)
- **Error budget:** 5% over 28d (i.e. ≤ 5% of qualifying requests may exceed 500ms)
- **PromQL (good ratio):**

  ```promql
  sum(rate(http_request_duration_seconds_bucket{le="0.5",route!~"/api/analytics/.*"}[28d]))
  /
  sum(rate(http_request_duration_seconds_count{route!~"/api/analytics/.*"}[28d]))
  ```

- **Dashboard:** `monitoring/grafana/dashboards/slo-api-latency.json` (uid `slo-a-api-latency`)

### SLO-B — Sync success rate

- **Threshold:** > 99.5% over 24h rolling
- **Error budget:** 0.5% over 24h (≤ 0.5% of sync attempts may fail)
- **PromQL:**

  ```promql
  sum(rate(sync_attempts_total{result="success"}[24h]))
  /
  sum(rate(sync_attempts_total[24h]))
  ```

- **Dashboard:** `monitoring/grafana/dashboards/slo-sync-success.json` (uid `slo-b-sync-success`)

### SLO-C — BullMQ notification queue drain

- **Threshold:** queue drain < 10 min (p95 over rolling 28d)
- **Error budget:** 10% of jobs may exceed the 10-min budget
- **PromQL:**

  ```promql
  histogram_quantile(0.95, sum by (le) (rate(bullmq_job_duration_seconds_bucket{queue="notifications"}[28d]))) < 600
  ```

- **Dashboard:** `monitoring/grafana/dashboards/slo-queue-drain.json` (uid `slo-c-queue-drain`)

### SLO-D — Alert dispatch latency

- **Threshold:** p95 < 60s end-to-end (event emit → email/SMS sent)
- **Error budget:** 5% over 28d
- **PromQL:**

  ```promql
  histogram_quantile(0.95, sum by (le) (rate(alert_dispatch_latency_seconds_bucket[28d])))
  ```

- **Dashboard:** `monitoring/grafana/dashboards/slo-alert-dispatch.json` (uid `slo-d-alert-dispatch`)

## 3. Burn-rate alerting (multi-window, multi-burn-rate per Google SRE)

For each SLO we deploy **two** alerts following the Google SRE Workbook §5 pattern:

| Alert          | Window | Burn rate | Meaning                                                                          |
| -------------- | ------ | --------- | -------------------------------------------------------------------------------- |
| `SLOFastBurn`  | 1h     | 14.4×     | The 28d budget will be exhausted in < 2d at this pace — **page on-call** now.    |
| `SLOSlowBurn`  | 6h     | 6×        | Sustained degradation but not yet catastrophic — **ticket**, no page.            |

Concrete alert names use the SLO letter as a suffix: `SloAFastBurn`, `SloASlowBurn`, ..., `SloDSlowBurn` (see `monitoring/prometheus/alerts.yml`).

All alerts are annotated with `runbook_url` pointing back to the relevant section in this document.

## 4. Escalation (D-19)

- **Pager:** Grafana OnCall (FOSS, integrated with Grafana alerting). **NOT PagerDuty** — PagerDuty's per-user pricing violates `feedback_free_tools_only` and would burn budget once on-call rotation expands to 5+ engineers.
- **Schedule:**
  1. Primary on-call (page immediately on `SLOFastBurn`)
  2. Secondary on-call (page after 15 min of unacknowledged primary)
  3. Tech-lead (page after 30 min of unacknowledged secondary)
- **Comms templates:** if customer-visible, use the DR runbook templates from HRD-MVP-03 (`.planning/runbooks/dr.md` once W2-P01 lands).

## 5. Custom metrics owned by the API (must exist for PromQL above to work)

| Metric                              | Type      | Owner module               | Labels                          | Emitter                                                  |
| ----------------------------------- | --------- | -------------------------- | ------------------------------- | -------------------------------------------------------- |
| `http_request_duration_seconds`     | histogram | (OTel HTTP auto-instr.)    | `route`, `method`, `status`     | OpenTelemetry auto-instrumentation (already wired)       |
| `sync_attempts_total`               | counter   | `observability/slo-metrics`| `tenant_id`, `result`           | `SyncController` (Task 4) — `result ∈ {success,failure}` |
| `bullmq_job_duration_seconds`       | histogram | `observability/slo-metrics`| `queue`, `job_name`             | `NotificationProcessor` (Task 4) — finally-block         |
| `alert_dispatch_latency_seconds`    | histogram | `observability/slo-metrics`| `severity`, `channel`           | `NotificationProcessor` (Task 4) — success path only     |

The last three are EXPOSED in Task 3 (`apps/api/src/observability/slo-metrics.module.ts`) and WIRED in Task 4 (`sync.controller.ts` + `notification.processor.ts`).

### Histogram bucket boundaries

- `bullmq_job_duration_seconds`: **10, 30, 60, 300, 600, 1800** seconds (covers fast in-app writes through email/SMS retries up to 30 min).
- `alert_dispatch_latency_seconds`: **1, 5, 10, 30, 60, 120, 300** seconds (centered on the 60s SLO threshold for sharp p95 resolution).

## 6. SLO review cadence

- **Weekly:** SRE reviews the 4 dashboards + top-level `production-health` dashboard. Files action items for any SLO trending below target.
- **Monthly:** SLO report attached to the customer day-30 review (HRD-MVP-08).
- **Quarterly:** threshold review. Thresholds may be moved **upward** (tighter) at any time; relaxing a threshold requires exec sign-off + a new ADR.

## 7. References

- D-17, D-18, D-19 in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- Google SRE Workbook, Chapter 5 — "Alerting on SLOs" (multi-window multi-burn-rate)
- HRD-MVP-03 (DR runbook — uses SLO breaches as DR detection signals)
- `monitoring/prometheus/alerts.yml` — Prometheus implementation of §3
- `monitoring/grafana/dashboards/*.json` — Grafana 11.x dashboards backing §2
