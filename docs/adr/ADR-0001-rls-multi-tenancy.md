# ADR-0001 — Row-Level Security as the primary tenant isolation boundary

Status: Accepted | Date: 2026-05-12 | Authors: Phase 1 planner

## Context

Gravel Ivoire is a multi-tenant ERP serving multiple cement/aggregate
groups, each with several country branches and dozens of quarry sites.
The Phase-1 deployment uses **a single PostgreSQL 18 database** with all
tenants co-located in the same tables (decision D-06: shared schema /
RLS isolation). Every business-domain table carries a `tenant_id uuid
NOT NULL` column.

Concrete enforcement surfaces in the repo:

- DB layer — every business table has an RLS policy that filters by
  `current_setting('app.tenant_id', true)::uuid` (see
  `apps/api/src/migrations/*-enable-rls-*.ts`).
- ORM layer — `TenantRlsSubscriber`
  (`apps/api/src/common/typeorm/tenant-rls.subscriber.ts`) calls
  `SET LOCAL app.tenant_id = ...` at the start of every TypeORM
  transaction, reading the tenant from CLS (`CLS_KEYS.TENANT_ID`,
  `apps/api/src/common/cls/tenant-context.ts`).
- App layer — `TenantGuard`
  (`apps/api/src/common/guards/tenant.guard.ts`) refuses any request
  whose body/params reference a tenant other than the JWT-issued one
  and increments `cross_tenant_leak_attempts_total`
  (`apps/api/src/common/metrics.ts`).

This defence-in-depth (D-07) is needed because of two known PgBouncer
hazards: **transaction-mode pooling can leak `SET` across sessions if
`SET LOCAL` is omitted** (Pitfall 1), and the audit-trigger writer may
inadvertently run as a superuser, bypassing RLS (Pitfall 2).

## Decision

We commit to **three layers of tenant isolation**:

1. PostgreSQL RLS (`USING tenant_id = current_setting(...)::uuid`)
2. ORM subscriber (`SET LOCAL app.tenant_id = $X` per transaction)
3. App guard (`TenantGuard` — explicit JWT-claim check + alarm metric)

The auto-generated cross-tenant leak suite
(`apps/api/test/security/rls-leak.generated.spec.ts`) introspects
`information_schema.tables`, emits one negative test per table per
operation (SELECT / INSERT / UPDATE / DELETE), and runs as a BLOCKING
CI job (see `.github/workflows/test.yml#rls-leak`,
required by branch protection through the terminal `gate` job).

**Banned patterns** (enforced by `TenantGuard` + code review):

- Hand-rolled `WHERE tenant_id = ?` filters in repositories — must
  rely on RLS so a forgotten clause cannot leak.
- Calls to `EntityManager.query(..., { bypassRls: true })` outside of
  the explicitly-audited admin paths.
- Connection pools that share sessions across tenants without
  `SET LOCAL` (use PgBouncer **session pooling** only for tenant-aware
  pools, or always pair transaction-mode with `SET LOCAL`).

## Consequences

Positive:

- A single forgotten filter does not leak data — at least two of the
  three layers must fail simultaneously.
- The auto-generated suite scales with the schema: any new table is
  automatically covered the moment its migration lands.
- The `cross_tenant_leak_attempts_total` metric provides a runtime
  alarm visible on the Phase-1 Health dashboard
  (`infra/grafana/dashboards/phase-1-health.json` panel #6).

Negative:

- All connections must be tenant-scoped — background jobs need an
  explicit `runWithTenantContext(tenantId, fn)` helper.
- `pg_dump` / replication tools see the full multi-tenant data; ops
  must be granted only via short-lived tenant-scoped roles.

When a tenant's compliance or load requires physical isolation, we
migrate them to a dedicated database following the procedure described
in **ADR-0005**. Application code continues to scope every query by
`tenant_id`, so the migration is transparent to the codebase.

## Alternatives Considered

- **Schema-per-tenant** — rejected: thousands of schemas degrade
  migration speed and PgBouncer connection re-use.
- **App-only `WHERE tenant_id = ?` filters** — rejected: a single
  forgotten predicate leaks all tenants (Pitfall 7).
- **Database-per-tenant from day 1** — rejected for Phase 1: too high
  an operational tax for early customers; revisited in ADR-0005.

## References

- D-06 / D-07 / D-08 — `.planning/phases/01-foundation/01-CONTEXT.md`
- PITFALLS Pitfall 1, 2, 7 — `.planning/phases/01-foundation/01-RESEARCH.md`
- ADR-0005 — db-per-tenant upgrade path
- Branch-protection requirement: the GitHub `gate` job must be a
  required status check on `main` (see
  `.github/workflows/test.yml#gate`).
