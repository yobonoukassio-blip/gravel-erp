/**
 * Custom OpenTelemetry metric instruments for the Gravel API.
 *
 * The three required Phase-1 metrics (D-38):
 *  - `http_request_duration_seconds` — auto-emitted by http instrumentation
 *  - `db_query_duration_seconds`     — auto-emitted by pg / typeorm instrumentation
 *  - `sync_event_processed_total`    — manual counter incremented in sync.controller.ts
 *
 * Plus 2 alarm-only metrics surfaced on the Phase-1 Health dashboard:
 *  - `cross_tenant_leak_attempts_total` — incremented when RLS guard rejects a
 *    cross-tenant access in `TenantGuard` (must remain at 0)
 *  - `audit_chain_break_detected_total` — incremented by audit-chain verifier
 *    when `sha256(prev_hash || row) !== current_hash`
 *
 * NEVER add money amounts or PII as label values — labels are low-cardinality
 * only. Tenant IDs are acceptable (bounded set per cluster).
 */
import { metrics, Counter } from '@opentelemetry/api';

const meter = metrics.getMeter('gravel-api', '0.1.0');

/**
 * Manual counter — incremented inside `SyncController.processBatch()` after
 * each accepted event. Auto-instrumentation cannot infer the boundary.
 *
 * Used by Grafana panel: `rate(sync_event_processed_total[5m])`.
 */
export const syncEventProcessedTotal: Counter = meter.createCounter(
  'sync_event_processed_total',
  {
    description:
      'Total sync events accepted and persisted by the API (after conflict resolution).',
  },
);

/**
 * Alarm counter — MUST remain at 0 in production. A non-zero value means a
 * cross-tenant access attempt was blocked by `TenantGuard` (defense layer 2).
 * The Phase-1 Health dashboard shows this as a stat panel; any non-zero
 * triggers a page.
 */
export const crossTenantLeakAttemptsTotal: Counter = meter.createCounter(
  'cross_tenant_leak_attempts_total',
  {
    description:
      'Cross-tenant access attempts rejected by the app-layer guard (defense-in-depth alarm).',
  },
);

/**
 * Alarm counter — MUST remain at 0. Incremented by the audit chain verifier
 * (ADR-0004) when a recomputed hash diverges from the stored hash for a row.
 */
export const auditChainBreakDetectedTotal: Counter = meter.createCounter(
  'audit_chain_break_detected_total',
  {
    description:
      'Audit chain-of-hash breaks detected by the verifier (sha256 mismatch).',
  },
);
