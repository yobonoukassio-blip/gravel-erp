# ADR-0005 — Database-per-tenant upgrade path

Status: Accepted — implementation deferred to Phase 6
Date: 2026-05-12
Authors: Phase 1 planner

## Context

Phase 1 co-locates all tenants in a single PostgreSQL 18 instance
isolated by RLS (ADR-0001). This is the correct trade-off while
tenant count is in single digits and per-tenant load is modest.
Two trigger conditions will warrant physical isolation for an
individual tenant:

- **Compliance**: a VIP customer whose contract or jurisdiction
  forbids co-locating their data with competitors.
- **Load**: a tenant whose write volume or analytics queries
  measurably degrades neighbouring tenants (visible as p95 spikes
  on the Phase-1 Health dashboard, panel #2 — `db_query_duration_seconds`).

The application MUST already be database-aware in a way that lets
this migration happen with **no application-code changes**.

## Decision

Application code MUST keep scoping every query by `tenant_id`, even
when that tenant is physically isolated. The data-source layer
(`apps/api/src/common/typeorm/`) is the only surface that knows which
physical database a tenant lives in; a future
`TenantDataSourceRouter` reads
`tenant_routing` (control-plane table) and dispatches connections
accordingly. RLS remains enabled in the per-tenant database as a
belt-and-braces measure.

The migration recipe (Phase-6 implementation):

1. Provision a new PostgreSQL 18 instance for the target tenant.
2. Replicate the relevant rows using **logical replication with a
   filtered publication**:
   `CREATE PUBLICATION p FOR ALL TABLES WHERE tenant_id = $X;`
3. When the replica is caught up, run `pg_basebackup` on the filtered
   slot OR replay the logical stream to the new instance.
4. **Cutover window**: switch the tenant's row in `tenant_routing`
   to point at the new DSN, drop the logical slot, stop replication.
5. **Rollback path**: keep the old rows in the source DB for 30 days
   (read-only via revoked grants). Reverting routing back to source
   is a single `tenant_routing` update.
6. Run the audit-chain verifier (ADR-0004) on the new instance
   before allowing writes — any chain break is a stop-ship.

## Consequences

Positive:

- Tenants needing physical isolation can be migrated with a defined,
  rehearsed procedure.
- Existing code does not change — `tenant_id` is the unit of
  scoping regardless of physical placement.

Negative:

- Per-tenant infrastructure cost grows linearly with the number of
  isolated tenants.
- Cross-tenant analytical queries (e.g., group-level dashboards) need
  a federation layer (deferred to Phase 6).

## Alternatives Considered

- **Schema-per-tenant** — rejected for the same reasons as in ADR-0001.
- **Shard by hash(tenant_id)** — rejected: gives no compliance
  guarantee and complicates routing without solving the "noisy
  neighbour" problem on a single shard.
- **Stay shared forever** — rejected: VIP contracts in late Phase 2
  already force the discussion.

## References

- D-09 — `.planning/phases/01-foundation/01-CONTEXT.md`
- PITFALLS Pitfall 7 — boundary discipline still applies inside the
  isolated DB.
- ADR-0001 — RLS strategy remains active inside the per-tenant DB.
- ADR-0004 — audit chain verifier MUST be re-run after migration.
