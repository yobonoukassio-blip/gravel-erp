# ADR-0004 — Audit trail with per-(tenant, table) chain-of-hash

Status: Accepted | Date: 2026-05-12 | Authors: Phase 1 planner

## Context

Regulators (Ivory Coast mining authority + EU parent-group internal
audit) require an **immutable, tamper-evident** record of every
mutation against sensitive tables: permits, deliveries, stock
adjustments, role changes. A simple `audit_log` table is insufficient
— a privileged operator could `UPDATE audit_log SET ...` and erase
their tracks.

Repo touchpoints:

- Append-only table —
  `apps/api/src/migrations/*-create-audit-log.ts` creates
  `audit_log (id uuid, tenant_id uuid, table_name text, row_id uuid,
   op text, changed_by uuid, changed_at timestamptz,
   payload jsonb, prev_hash bytea, hash bytea)`
  partitioned by `(tenant_id, table_name)` (Pitfall 6 — flat tables
  with a single chain become a write-bottleneck and a query graveyard).
- Trigger —
  `apps/api/src/migrations/*-create-audit-triggers.ts` installs an
  `AFTER INSERT/UPDATE/DELETE` trigger that computes
  `hash = sha256(prev_hash || canonical_jsonb(payload))`
  inside the same transaction.
- Verifier — `apps/api/src/modules/audit/chain.verifier.ts` walks the
  chain for one `(tenant_id, table_name)` partition and re-computes
  every hash; mismatches increment
  `audit_chain_break_detected_total` and surface on the Phase-1 Health
  dashboard panel #5.
- Test — `apps/api/test/integration/audit-chain.spec.ts` (BLOCKING CI
  gate `audit-chain`).

## Decision

Use a **per-partition chain-of-hash** with `sha256` and a
content-addressed canonical JSONB encoding:

```
hash_n = sha256(hash_{n-1} || canonical_jsonb(payload_n))
hash_0 = sha256("genesis|" || tenant_id || "|" || table_name)
```

Storage in `audit_log` is **append-only** at the database level:

- `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;` — only the
  trigger writes.
- The application role does **not** have `UPDATE`/`DELETE` on
  `audit_log` partitions.
- Backup-restore drills verify chain integrity at startup.

## Consequences

Positive:

- Tampering requires rewriting the entire chain forward — detectable
  by the verifier in O(N) per partition.
- Per-(tenant, table) partitioning keeps the inserter contention
  local; one tenant's audit storm does not block another tenant's
  writes (Pitfall 6).
- The verifier doubles as a regression check: any planner change to
  the `canonical_jsonb` encoder breaks all chains and is caught
  immediately by the BLOCKING CI gate.

Negative:

- Schema changes that alter the canonical encoding require a
  one-time chain "fork point" — documented in the migration that
  changes the encoder.
- Storage is non-trivial for high-volume tables; rotated/cold
  partitions are moved to object storage (immutability via S3 Object
  Lock, see Validation §"Object-storage immutability spike").

## Alternatives Considered

- **External append-only ledger (e.g., AWS QLDB)** — rejected:
  vendor lock-in + cost; postgres-native solution is sufficient for
  the regulator handover.
- **Single global chain** — rejected: write-contention,
  cross-tenant visibility, query performance (Pitfall 6).
- **Merkle tree per day** — deferred: increases verification speed
  but complicates the trigger; Phase-1 chain is fast enough.

## References

- D-27, D-28, D-29 —
  `.planning/phases/01-foundation/01-CONTEXT.md`
- PITFALLS Pitfall 6 —
  `.planning/phases/01-foundation/01-RESEARCH.md`
- ADR-0001 — RLS keeps audit partitions tenant-isolated.
- Grafana stat panel: `audit_chain_break_detected_total` must remain
  0 (`infra/grafana/dashboards/phase-1-health.json` panel #5).
