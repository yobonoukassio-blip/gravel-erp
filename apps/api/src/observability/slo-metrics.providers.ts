import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

/**
 * SLO metric provider tokens + factory definitions for HRD-MVP-06.
 *
 * These three metrics back the custom PromQL queries in
 * `.planning/runbooks/slo-definitions.md` §5 (SLO-B / SLO-C / SLO-D).
 *
 * Naming MUST match the metric names referenced in the runbook and the
 * Prometheus alert rules in `monitoring/prometheus/alerts.yml`, or the
 * dashboards and burn-rate alerts will silently report "no data".
 */

export const SYNC_ATTEMPTS_COUNTER = 'PROM_METRIC_SYNC_ATTEMPTS_TOTAL';
export const BULLMQ_JOB_DURATION_HISTOGRAM = 'PROM_METRIC_BULLMQ_JOB_DURATION_SECONDS';
export const ALERT_DISPATCH_LATENCY_HISTOGRAM = 'PROM_METRIC_ALERT_DISPATCH_LATENCY_SECONDS';

// SLO-B numerator/denominator. Emitted by SyncController.
export const syncAttemptsCounter = makeCounterProvider({
  name: 'sync_attempts_total',
  help: 'Total PowerSync write attempts (success vs failure), per tenant — SLO-B numerator/denominator.',
  labelNames: ['tenant_id', 'result'],
});

// SLO-C: BullMQ job processing duration. Emitted by NotificationProcessor (finally block).
// Buckets centered on the 600s (10 min) SLO threshold for sharp p95 resolution.
export const bullmqJobDurationHistogram = makeHistogramProvider({
  name: 'bullmq_job_duration_seconds',
  help: 'BullMQ job processing duration in seconds — SLO-C (notification queue drain).',
  labelNames: ['queue', 'job_name'],
  buckets: [10, 30, 60, 300, 600, 1800],
});

// SLO-D: end-to-end alert dispatch latency (job.timestamp -> send complete).
// Emitted by NotificationProcessor on the success path only.
// Buckets centered on the 60s SLO threshold.
export const alertDispatchLatencyHistogram = makeHistogramProvider({
  name: 'alert_dispatch_latency_seconds',
  help: 'End-to-end alert dispatch latency in seconds (event emit -> channel sent) — SLO-D.',
  labelNames: ['severity', 'channel'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});
