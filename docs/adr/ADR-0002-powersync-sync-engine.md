# ADR-0002 — PowerSync as the offline-first sync engine

Status: Accepted | Date: 2026-05-12 | Authors: Phase 1 planner

## Context

The field-entry mobile app must capture quarry-floor activity (loads,
deliveries, machine readings) on devices that spend hours in
no-coverage zones, then sync without loss or duplication when the
device reconnects (FND-10, FND-11). The web admin app, in contrast, is
strictly online.

Concrete repo touchpoints:

- Mobile client — `apps/mobile/lib/core/sync/` uses the
  `powersync: ^1.9.0` Dart SDK (`apps/mobile/pubspec.yaml`).
- Postgres publication — `apps/api/src/migrations/*-create-powersync-publication.ts`
  declares a logical replication slot consumed by the PowerSync server.
- API write-path — `apps/api/src/modules/sync/sync.controller.ts`
  validates and persists the mobile write-stream, then increments
  `sync_event_processed_total` (`apps/api/src/common/metrics.ts`).
- Conflict resolution — `apps/api/src/modules/sync/conflict.registry.ts`
  resolves per-entity conflicts (append-only for activity log,
  last-writer-wins for editable master data) under chaos tests in
  `apps/api/test/chaos/sync-chaos.spec.ts`.

Three observed risks shape the decision:

- Pitfall 3 — a single PowerSync replication slot can be exhausted by
  long-disconnected clients (we cap retention at 48 h and force a full
  re-bootstrap beyond that).
- Pitfall 5 — Drift schema drift between mobile and Postgres breaks
  sync silently; CI runs schema-diff to catch.
- Server lamport clock (D-12) — sync ordering must NOT use
  `DateTime.now().millisecondsSinceEpoch` on the device. Enforced by
  the `forbidden-imports` CI gate (see
  `.github/workflows/test.yml#forbidden-imports`).

## Decision

Adopt **PowerSync (commercial)** as the sync engine for Phase 1.
Implement a conflict-policy registry per entity type:

- `activity_log` → **append-only** (no conflicts possible).
- `site`, `zone`, `bank`, `permit` (master data, edited only by
  admins on the web) → **last-writer-wins on server lamport tick**.
- `equipment_reading` → **append-only + dedup on (device_id, seq)**.

Single PowerSync server replica in Phase 1 (D-10). HA is deferred.

## Consequences

Positive:

- Battle-tested logical-replication-based sync with iOS/Android SDKs;
  6+ months of engineering avoided versus a custom implementation.
- Per-entity conflict policy is declarative and testable in chaos
  harness `apps/api/test/chaos/sync-chaos.spec.ts` (BLOCKING CI gate).

Negative:

- Commercial dependency — Phase 6 should re-evaluate cost vs
  alternatives once tenant count grows.
- Single replica in Phase 1 means scheduled-maintenance windows are
  the failure mode; mobile clients buffer for the duration.

## Alternatives Considered

- **ElectricSQL** — rejected: write-path maturity insufficient for
  audit-grade activity log in 2026-Q2.
- **Custom sync (event-sourcing + REST batch)** — rejected: estimated
  6-month engineering tax to reach feature parity.
- **CRDTs everywhere** — rejected: append-only activity log doesn't
  need them; master-data conflicts are sufficiently rare and admin-
  driven that LWW + audit trail is acceptable.

## References

- D-10, D-11, D-12, D-13, D-14 —
  `.planning/phases/01-foundation/01-CONTEXT.md`
- PITFALLS Pitfall 3, 5, 9 —
  `.planning/phases/01-foundation/01-RESEARCH.md`
- ADR-0003 (OperationalDay) — sync events must carry the server-
  resolved operational day, NOT the device date.
- ADR-0004 (audit chain) — every sync write is auditable.
