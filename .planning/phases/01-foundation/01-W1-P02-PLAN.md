---
phase: 01-foundation
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - apps/api/src/migrations/1715500000000__create_extensions_and_roles.sql
  - apps/api/src/migrations/1715500100000__create_tenancy_schema.sql
  - apps/api/src/migrations/1715500200000__create_master_data_schema.sql
  - apps/api/src/migrations/1715500300000__create_operational_day.sql
  - apps/api/src/migrations/1715500400000__create_fx_rates.sql
  - apps/api/src/migrations/1715500500000__create_audit_log.sql
  - apps/api/src/migrations/1715500600000__apply_rls_policies.sql
  - apps/api/src/migrations/1715500700000__generate_audit_triggers.sql
  - apps/api/src/common/cls/tenant-context.ts
  - apps/api/src/common/typeorm/tenant-rls.subscriber.ts
  - apps/api/src/common/typeorm/tenant-aware.repository.ts
  - apps/api/src/common/money/dinero.helpers.ts
  - apps/api/src/modules/tenancy/tenancy.module.ts
  - apps/api/src/modules/tenancy/entities/tenant.entity.ts
  - apps/api/src/modules/tenancy/entities/country.entity.ts
  - apps/api/src/modules/master-data/master-data.module.ts
  - apps/api/src/modules/master-data/entities/site.entity.ts
  - apps/api/src/modules/master-data/entities/production-zone.entity.ts
  - apps/api/src/modules/master-data/entities/bench.entity.ts
  - apps/api/src/modules/master-data/entities/permit.entity.ts
  - apps/api/src/modules/master-data/entities/operational-day.entity.ts
  - apps/api/src/modules/master-data/entities/shift.entity.ts
  - apps/api/src/modules/master-data/entities/fx-rate.entity.ts
  - apps/api/src/modules/master-data/operational-day.service.ts
  - apps/api/src/modules/master-data/operational-day.service.spec.ts
  - apps/api/src/modules/audit/audit.module.ts
  - apps/api/src/modules/audit/audit-log.entity.ts
  - apps/api/src/modules/audit/audit-chain.verifier.ts
  - apps/api/scripts/generate-audit-triggers.ts
  - apps/api/scripts/generate-rls-tests.ts
  - apps/api/test/setup/testcontainers.ts
  - apps/api/test/setup/seed-two-tenants.ts
  - apps/api/test/security/rls-leak.generated.spec.ts
  - apps/api/test/integration/audit-chain.spec.ts
  - apps/api/test/integration/master-data.spec.ts
  - apps/api/test/unit/money.spec.ts
  - apps/api/test/unit/operational-day.spec.ts
autonomous: true
requirements: [FND-02, FND-06, FND-07, FND-08]
must_haves:
  truths:
    - "A `gravel_app`-role connection with `app.tenant_id=A` cannot SELECT any row WHERE tenant_id=B on ANY tenant-scoped table"
    - "Every INSERT/UPDATE/DELETE on tenant-scoped tables produces an `audit_log` row with valid chain-of-hash per (tenant_id, table_name)"
    - "Money helpers reject float arithmetic and store all amounts as bigint minor units with currency CHAR(3)"
    - "OperationalDayService resolves the correct business_date across DST boundary in Europe/Paris (2026-10-25 02:30)"
    - "Sentinel preflight in RLS-leak test passes: a leaked sentinel row would be detected (test infra is real, not lying green)"
  artifacts:
    - path: "apps/api/src/common/typeorm/tenant-rls.subscriber.ts"
      provides: "TypeORM subscriber emitting set_config('app.tenant_id', $1, true) on every beforeQuery"
      contains: "set_config"
    - path: "apps/api/src/migrations/1715500600000__apply_rls_policies.sql"
      provides: "ENABLE + FORCE ROW LEVEL SECURITY on every tenant-scoped table"
      contains: "FORCE ROW LEVEL SECURITY"
    - path: "apps/api/src/migrations/1715500700000__generate_audit_triggers.sql"
      provides: "Per-table audit triggers writing prev_hash + row_hash partitioned per (tenant_id, table_name)"
      contains: "sha256"
    - path: "apps/api/src/common/money/dinero.helpers.ts"
      provides: "dinero.js wrappers with CURRENCY_SCALE and bankers rounding"
    - path: "apps/api/src/modules/master-data/operational-day.service.ts"
      provides: "Pure resolver: (siteIanaTz, shiftStartLocal, eventUtc) → business_date"
  key_links:
    - from: "every tenant-scoped table"
      to: "audit_log"
      via: "generated PostgreSQL trigger"
      pattern: "CREATE TRIGGER audit_"
    - from: "JWT auth guard"
      to: "app.tenant_id GUC"
      via: "ClsService + TenantRlsSubscriber.beforeQuery"
      pattern: "set_config\\('app.tenant_id'"
    - from: "All financial columns"
      to: "fx_rates table"
      via: "FK amount_*_fx_rate_id"
      pattern: "fx_rate_id"
---

<objective>
Data platform foundation. Build the PostgreSQL 18 schema for tenancy + master-data + operational-day + fx-rates + audit-log; apply Row-Level Security policies on every tenant-scoped table (FORCE RLS); install the TypeORM TenantRlsSubscriber + TenantAwareRepository wrapper for defense-in-depth (D-07 layers 1 and 2 — layer 3 JWT injection lives in plan 04); generate audit triggers writing chain-of-hash per (tenant_id, table_name); ship dinero.js money helpers honoring CURRENCY_SCALE (XOF=0, EUR=2); ship OperationalDayService with DST-crossing unit test (D-21); auto-generate cross-tenant CI test from `information_schema` (D-08). Turn GREEN: FND-02 (rls-leak.generated), FND-06 (audit-chain), FND-07 (money), FND-08 (operational-day), and partially FND-05 (master-data schema — UI in plan 05).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/01-foundation/01-CONTEXT.md
@.planning/phases/01-foundation/01-RESEARCH.md
@.planning/phases/01-foundation/01-VALIDATION.md
@.planning/research/PITFALLS.md
@.planning/phases/01-foundation/01-W0-P01-PLAN.md

<interfaces>
From packages/shared-types/src/money.ts:
```ts
export interface MoneyAmount { amountMinor: bigint; currency: string; }
export interface TransactionAmounts { original: MoneyAmount; siteFunctional: MoneyAmount; group: MoneyAmount; fxRateId: string; }
export const CURRENCY_SCALE: Record<string, number> = { XOF: 0, XAF: 0, EUR: 2, USD: 2 };
```

From packages/shared-types/src/jwt-claims.ts:
```ts
export interface JwtClaims { userId: string; tenantId: string; siteIds: string[]; role: ...; groupScope: 'group'|null; preferredLocale: string; }
```

Postgres roles created in migration 1715500000000:
- `gravel_owner` (owns schema; runs migrations; BYPASSRLS-not-set; only used by migration job)
- `gravel_app` (app connects as this; RLS applies; NO BYPASSRLS)
- `gravel_service` (triggers, maintenance; can SET app.bypass_rls)
- `gravel_audit_writer` (INSERT on audit_log only)
</interfaces>
</context>

<tasks>

<task type="auto" id="W1-P02-T01" tdd="true">
  <name>Postgres extensions, roles, and tenancy/master-data/operational-day/fx_rates schema</name>
  <files>apps/api/src/migrations/1715500000000__create_extensions_and_roles.sql, apps/api/src/migrations/1715500100000__create_tenancy_schema.sql, apps/api/src/migrations/1715500200000__create_master_data_schema.sql, apps/api/src/migrations/1715500300000__create_operational_day.sql, apps/api/src/migrations/1715500400000__create_fx_rates.sql, apps/api/src/modules/tenancy/entities/tenant.entity.ts, apps/api/src/modules/tenancy/entities/country.entity.ts, apps/api/src/modules/master-data/entities/site.entity.ts, apps/api/src/modules/master-data/entities/production-zone.entity.ts, apps/api/src/modules/master-data/entities/bench.entity.ts, apps/api/src/modules/master-data/entities/permit.entity.ts, apps/api/src/modules/master-data/entities/operational-day.entity.ts, apps/api/src/modules/master-data/entities/shift.entity.ts, apps/api/src/modules/master-data/entities/fx-rate.entity.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-19, D-22, D-23, D-24, D-25, D-26, D-17)
    - .planning/phases/01-foundation/01-RESEARCH.md (Pattern 2, Pattern 5)
  </read_first>
  <behavior>
    - Test: extensions postgis, pgcrypto, timescaledb (LOAD only — used Phase 5) installed
    - Test: 4 roles exist with documented privileges; `gravel_app` does NOT have BYPASSRLS
    - Test: tenant unique by code; site unique by (tenant_id, code); permit unique by (site_id, reference)
    - Test: Site.functional_currency CHAR(3); Site.gps_point is PostGIS GEOMETRY(Point, 4326); Site.iana_timezone TEXT NOT NULL
    - Test: ProductionZone.geometry GEOMETRY(Polygon, 4326); Bench.geometry GEOMETRY(Polygon, 4326)
    - Test: Permit.valid_from, valid_to DATE; Permit.document_url TEXT (S3 SHA-256 key per D-29)
    - Test: OperationalDay UNIQUE(site_id, business_date)
    - Test: Soft-delete only — no DELETE allowed; archived_at TIMESTAMPTZ + status enum
  </behavior>
  <action>
    `1715500000000__create_extensions_and_roles.sql`:
      ```sql
      CREATE EXTENSION IF NOT EXISTS postgis;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      -- TimescaleDB loaded but unused until Phase 5 — check PG18 compat first
      CREATE EXTENSION IF NOT EXISTS timescaledb;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gravel_owner') THEN
          CREATE ROLE gravel_owner LOGIN PASSWORD 'change_me_dev';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gravel_app') THEN
          CREATE ROLE gravel_app LOGIN PASSWORD 'change_me_dev' NOBYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gravel_service') THEN
          CREATE ROLE gravel_service LOGIN PASSWORD 'change_me_dev';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gravel_audit_writer') THEN
          CREATE ROLE gravel_audit_writer LOGIN PASSWORD 'change_me_dev';
        END IF;
      END $$;
      ```
    `1715500100000__create_tenancy_schema.sql`:
      ```sql
      CREATE TABLE tenants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        default_locale TEXT NOT NULL DEFAULT 'fr-CI',
        group_pivot_currency CHAR(3) NOT NULL DEFAULT 'XOF',
        status TEXT NOT NULL DEFAULT 'active',
        archived_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE countries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        iso_alpha2 CHAR(2) NOT NULL,
        name TEXT NOT NULL,
        default_currency CHAR(3) NOT NULL,
        default_timezone TEXT NOT NULL,
        UNIQUE(tenant_id, iso_alpha2)
      );
      ```
    `1715500200000__create_master_data_schema.sql`: tables `sites`, `production_zones`, `benches`, `permits` per D-24/D-25. All carry `tenant_id UUID NOT NULL`. `sites.gps_point GEOMETRY(Point,4326)`, `production_zones.geometry GEOMETRY(Polygon,4326)`. `permits.type` CHECK IN ('exploration','exploitation','environnemental','explosifs').
    `1715500300000__create_operational_day.sql`: `operational_days` and `shifts` per D-19/D-22:
      ```sql
      CREATE TABLE operational_days (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL,
        site_id UUID NOT NULL REFERENCES sites(id),
        business_date DATE NOT NULL,
        shift_start_local TIME NOT NULL,
        iana_timezone TEXT NOT NULL,
        started_at_utc TIMESTAMPTZ NOT NULL,
        ended_at_utc TIMESTAMPTZ NOT NULL,
        UNIQUE(site_id, business_date),
        CHECK (ended_at_utc > started_at_utc)
      );
      CREATE TABLE shifts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL,
        operational_day_id UUID NOT NULL REFERENCES operational_days(id),
        kind TEXT NOT NULL,  -- 'day' | 'night' | 'overlap'
        started_at_utc TIMESTAMPTZ NOT NULL,
        ended_at_utc TIMESTAMPTZ NOT NULL
      );
      ```
    `1715500400000__create_fx_rates.sql`:
      ```sql
      CREATE TABLE fx_rates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL,
        from_currency CHAR(3) NOT NULL,
        to_currency CHAR(3) NOT NULL,
        rate_numerator BIGINT NOT NULL,
        rate_denominator BIGINT NOT NULL CHECK (rate_denominator > 0),
        valid_from TIMESTAMPTZ NOT NULL,
        valid_to TIMESTAMPTZ NULL,
        source TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(tenant_id, from_currency, to_currency, valid_from)
      );
      -- fx_rates rows are IMMUTABLE: no UPDATE allowed (enforced later by trigger)
      ```
    Create TypeORM entity classes mirroring schemas — all extend a `TenantScopedEntity` mixin exposing `tenantId: string` and using `@Index()` on `tenantId`. Site entity uses `@Column({type: 'geometry', spatialFeatureType: 'Point', srid: 4326}) gpsPoint: any;`.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api exec -- typeorm-ts-node-commonjs migration:run -d ormconfig.ts && psql $DATABASE_URL -c "\\dx" | grep -E "postgis|pgcrypto" && psql $DATABASE_URL -c "SELECT rolname,rolbypassrls FROM pg_roles WHERE rolname LIKE 'gravel_%'" | grep "gravel_app .* f"</automated>
  </verify>
  <acceptance_criteria>
    - Migration files numbered 1715500000000..1715500400000 exist
    - `psql -c "\dx"` lists postgis, pgcrypto
    - `gravel_app` role has `rolbypassrls = false`
    - `sites.gps_point` type is `geometry(Point,4326)` (verified via `\d sites`)
    - `operational_days` has UNIQUE(site_id, business_date)
    - All entities under `apps/api/src/modules/{tenancy,master-data}/entities/*.entity.ts` exist
  </acceptance_criteria>
  <done>Schema and roles created; entities map cleanly to tables.</done>
</task>

<task type="auto" id="W1-P02-T02" tdd="true">
  <name>RLS policies + TenantRlsSubscriber + TenantAwareRepository + auto-generated cross-tenant test</name>
  <files>apps/api/src/migrations/1715500600000__apply_rls_policies.sql, apps/api/src/common/cls/tenant-context.ts, apps/api/src/common/typeorm/tenant-rls.subscriber.ts, apps/api/src/common/typeorm/tenant-aware.repository.ts, apps/api/scripts/generate-rls-tests.ts, apps/api/test/setup/testcontainers.ts, apps/api/test/setup/seed-two-tenants.ts, apps/api/test/security/rls-leak.generated.spec.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md (Pattern 1, Pattern 2, Pattern 3, Pitfalls 1 & 8, lines 358-451 and 534-587)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-06, D-07, D-08)
    - .planning/research/PITFALLS.md (Pitfall #7)
  </read_first>
  <behavior>
    - Test (preflight): connect as gravel_owner (test infra), insert sentinel rows for tenantA and tenantB; switch to gravel_app + app.tenant_id=tenantA; SELECT must return only tenantA rows
    - Test (preflight self-check per Pitfall 8): when generator returns 0 tables, fail loudly — "RLS generator found 0 tables; test infrastructure broken"
    - Test (auto-generated): for EACH table where information_schema.columns has column_name='tenant_id', assert as gravel_app with context=tenantA: `SELECT id FROM <table> WHERE tenant_id='<tenantB>' LIMIT 1` returns 0 rows
    - Test: PgBouncer transaction-mode smoke test — open 2 sequential requests with different tenant ids, assert GUC doesn't leak between them
    - Test: TenantAwareRepository.save() injects tenant_id from CLS when entity lacks it
    - Test: createQueryBuilder throws if no tenant context
  </behavior>
  <action>
    `1715500600000__apply_rls_policies.sql`: for EACH tenant-scoped table (tenants, countries, sites, production_zones, benches, permits, operational_days, shifts, fx_rates):
      ```sql
      ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
      ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
      CREATE POLICY <t>_isolation ON <t>
        FOR ALL TO gravel_app
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
      CREATE POLICY <t>_service_bypass ON <t>
        FOR ALL TO gravel_service
        USING (current_setting('app.bypass_rls', true) = 'on')
        WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
      ```
    Note tenants table itself: tenant_id IS id; same policy applies.

    `apps/api/src/common/cls/tenant-context.ts`: export typed CLS keys `TENANT_ID`, `USER_ID`, `REQUEST_ID`, `SITE_IDS`, `ROLE`. Helper `getTenantContext()` reads from `ClsService`.

    `apps/api/src/common/typeorm/tenant-rls.subscriber.ts` — implement exactly per RESEARCH.md lines 366-391 using `set_config('key', val, true)` inside an active transaction. CRITICAL: use `set_config(..., true)` (is_local=true) NOT bare `SET`. Add explicit comment referencing Pitfall 1 (PgBouncer transaction mode).

    `apps/api/src/common/typeorm/tenant-aware.repository.ts` — implement per RESEARCH.md lines 427-451. Throw `BadRequestException('No tenant context')` if CLS missing. Inject `tenantId` on `save()` if entity lacks it.

    `apps/api/scripts/generate-rls-tests.ts` — runtime generator: at jest startup, query `information_schema.columns WHERE column_name='tenant_id' AND table_schema='public'`, return array. Used by `rls-leak.generated.spec.ts`.

    `apps/api/test/setup/testcontainers.ts` — implement Postgres 18 PostGIS container (`postgis/postgis:18-3.5`) + Keycloak 26 container. Export `getDataSourceAs(role: 'owner'|'app')` with separate connection strings.

    `apps/api/test/setup/seed-two-tenants.ts` — per Phase 1 directive: 2 tenants × 2 sites × 5 users each. Returns `{ tenantA, tenantB, siteA1, siteA2, siteB1, siteB2 }`.

    `apps/api/test/security/rls-leak.generated.spec.ts` — implement per RESEARCH.md lines 646-674. ADD per Pitfall 8: `beforeAll` connects as gravel_app + tenant=tenantA + queries a known tenantB sentinel row; if it returns the row, `throw new Error('Test infrastructure broken — gravel_app is bypassing RLS')`. If generator returns 0 tables, fail loudly.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api test:rls-leak 2>&1 | tee /tmp/rls.log && grep -E "PASS|✓" /tmp/rls.log | head -20 && grep -qE "RLS cross-tenant isolation.*\d+ passed" /tmp/rls.log</automated>
  </verify>
  <acceptance_criteria>
    - Every tenant-scoped table has BOTH `ENABLE` and `FORCE ROW LEVEL SECURITY` in migration
    - `tenant-rls.subscriber.ts` calls `set_config('app.tenant_id', $1, true)` (third arg true)
    - `tenant-aware.repository.ts` throws if CLS missing
    - `pnpm --filter @gravel/api test:rls-leak` passes with at least 1 test per tenant-scoped table (≥9 tests)
    - Preflight sentinel check is present and passes
    - PgBouncer transaction-mode smoke test passes
  </acceptance_criteria>
  <done>Cross-tenant isolation enforced at DB + ORM layers; FND-02 verification command in 01-VALIDATION.md flips green.</done>
</task>

<task type="auto" id="W1-P02-T03" tdd="true">
  <name>Audit log schema + generated triggers + chain-of-hash verifier (FND-06)</name>
  <files>apps/api/src/migrations/1715500500000__create_audit_log.sql, apps/api/src/migrations/1715500700000__generate_audit_triggers.sql, apps/api/scripts/generate-audit-triggers.ts, apps/api/src/modules/audit/audit.module.ts, apps/api/src/modules/audit/audit-log.entity.ts, apps/api/src/modules/audit/audit-chain.verifier.ts, apps/api/test/integration/audit-chain.spec.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-27, D-28)
    - .planning/phases/01-foundation/01-RESEARCH.md (Audit Trigger Generator SQL, lines 676-699; Pitfall 6 "chain-of-hash performance under load", lines 569-575)
    - .planning/research/PITFALLS.md (Pitfall #6)
  </read_first>
  <behavior>
    - Test: INSERT on `sites` produces 1 audit_log row with action='INSERT', after_jsonb=full new row, before_jsonb=NULL, actor=app.user_id, request_id=app.request_id, at_utc≈now()
    - Test: UPDATE produces row with before+after, DELETE produces row with before+after=NULL
    - Test: For (tenant_id=A, table='sites') chain: row N's prev_hash = row N-1's row_hash; row_hash = sha256(prev_hash || canonical_json(payload))
    - Test (per Pitfall 6): chain is per (tenant_id, table_name) — concurrent writes to tenant_id=A and tenant_id=B do NOT contend on a single hash counter
    - Test: tampering with an audit_log row (UPDATE before_jsonb) breaks the chain — verifier returns the first broken position
    - Test: audit_log is partitioned by month (RANGE on at_utc)
  </behavior>
  <action>
    `1715500500000__create_audit_log.sql`:
      ```sql
      CREATE TABLE audit_log (
        id BIGSERIAL,
        tenant_id UUID NOT NULL,
        table_name TEXT NOT NULL,
        row_pk TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
        before_jsonb JSONB,
        after_jsonb JSONB,
        actor_user_id UUID,
        request_id UUID,
        at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
        prev_hash BYTEA NOT NULL,
        row_hash BYTEA NOT NULL,
        PRIMARY KEY (id, at_utc)
      ) PARTITION BY RANGE (at_utc);

      CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
        FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
      -- monthly partitions created by maintenance job; bootstrap initial 12 months in migration

      CREATE TABLE audit_chain_state (
        tenant_id UUID NOT NULL,
        table_name TEXT NOT NULL,
        last_hash BYTEA NOT NULL DEFAULT '\\x00',
        PRIMARY KEY (tenant_id, table_name)
      );

      GRANT INSERT ON audit_log TO gravel_audit_writer, gravel_service;
      GRANT SELECT ON audit_log TO gravel_app;  -- read for own tenant via RLS
      ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
      CREATE POLICY audit_log_isolation ON audit_log FOR SELECT TO gravel_app
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
      ```
    `apps/api/scripts/generate-audit-triggers.ts`: TypeScript script invoked by `pnpm --filter @gravel/api migration:audit-gen` that reads `information_schema.columns WHERE column_name='tenant_id'` and emits one trigger function + trigger per table into `1715500700000__generate_audit_triggers.sql`. Each trigger function follows research lines 682-699 pattern, EXTENDED to read+update `audit_chain_state` per `(NEW.tenant_id, TG_TABLE_NAME)`:
      ```sql
      SELECT last_hash INTO v_prev_hash FROM audit_chain_state
        WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id) AND table_name = TG_TABLE_NAME FOR UPDATE;
      IF v_prev_hash IS NULL THEN
        v_prev_hash := '\\x00'::bytea;
        INSERT INTO audit_chain_state(tenant_id, table_name, last_hash) VALUES (..., '\\x00');
      END IF;
      v_row_hash := digest(v_prev_hash || convert_to(v_payload::text, 'UTF8'), 'sha256');
      INSERT INTO audit_log(...) VALUES (..., v_prev_hash, v_row_hash);
      UPDATE audit_chain_state SET last_hash = v_row_hash WHERE tenant_id = ... AND table_name = TG_TABLE_NAME;
      ```
    Run generator and produce `1715500700000__generate_audit_triggers.sql` as a checked-in artifact.

    `apps/api/src/modules/audit/audit-log.entity.ts`: TypeORM entity mapping `audit_log`.

    `apps/api/src/modules/audit/audit-chain.verifier.ts`: `verifyChain(tenantId, tableName): Promise<{ valid: boolean; brokenAt?: bigint }>`. Reads audit_log ORDER BY id, recomputes each row_hash, compares.

    `apps/api/test/integration/audit-chain.spec.ts` — replace stub: implement all behaviors above. Use seedTwoTenants. Tamper test: as gravel_owner directly UPDATE one before_jsonb, verifyChain returns valid=false with brokenAt=that row's id.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api test:int -- audit-chain.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - `1715500700000__generate_audit_triggers.sql` exists and contains `CREATE TRIGGER` for at least 7 tables
    - Trigger function uses `digest(v_prev_hash || ..., 'sha256')` (pgcrypto)
    - Chain state is partitioned per `(tenant_id, table_name)` — verified by behavior test
    - `audit_log` is RANGE-partitioned by `at_utc`
    - `audit-chain.spec.ts` exits 0 with all behavior tests green
    - Tamper detection works (verifier returns brokenAt)
  </acceptance_criteria>
  <done>Audit trail is tamper-evident, per-partition performant, and FND-06 verification command in 01-VALIDATION.md flips green.</done>
</task>

<task type="auto" id="W1-P02-T04" tdd="true">
  <name>Money helpers (dinero.js) + OperationalDayService + DST test</name>
  <files>apps/api/src/common/money/dinero.helpers.ts, apps/api/src/modules/master-data/operational-day.service.ts, apps/api/src/modules/master-data/operational-day.service.spec.ts, apps/api/test/unit/money.spec.ts, apps/api/test/unit/operational-day.spec.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-15, D-16, D-17, D-18, D-19, D-20, D-21)
    - .planning/phases/01-foundation/01-RESEARCH.md (Pattern 5 OperationalDay Resolver lines 474-496; Pitfall 7 lines 577-580)
    - .planning/research/PITFALLS.md (Pitfall #3, #9)
  </read_first>
  <behavior>
    Money:
    - Test: `toMinor(1000, 'XOF')` returns `1000n` (scale=0)
    - Test: `toMinor(12.34, 'EUR')` returns `1234n` (scale=2)
    - Test: `toMinor(0.1 + 0.2, 'EUR')` returns `30n` not `30n` (uses bankers rounding, not float)
    - Test: `add({amountMinor: 1000n, currency: 'XOF'}, {amountMinor: 500n, currency: 'XOF'})` returns `{amountMinor: 1500n, currency: 'XOF'}`
    - Test: `add` throws when currencies differ
    - Test: `convert(amount, fxRate)` produces new MoneyAmount with target currency, half-up bankers rounding; cumulative rounding forbidden (rounding applied once at final step)
    - Test: `toTransactionAmounts(original, siteCurrency, groupCurrency, fxRates)` returns 3 amounts with shared fx_rate_id

    OperationalDay:
    - Test: Africa/Abidjan (UTC), shift_start=06:00, eventUtc=2026-05-12T05:30Z → business_date=2026-05-11
    - Test: Africa/Abidjan, shift_start=06:00, eventUtc=2026-05-12T06:00Z → business_date=2026-05-12 (>= boundary per Pitfall 7)
    - Test (D-21 DST): Europe/Paris, shift_start=06:00, around 2026-10-25 02:30 local (fall-back duplicated hour): event 1 (first 02:30) and event 2 (second 02:30) BOTH resolve to business_date 2026-10-25; event at 2026-10-25T04:00Z resolves to 2026-10-24 (before shift start in local time)
    - Test: explicit boundary +1s and -1s assertions
  </behavior>
  <action>
    `apps/api/src/common/money/dinero.helpers.ts`:
      ```ts
      import { dinero, add as dAdd, multiply, toSnapshot, halfEven } from 'dinero.js';
      import { XOF, EUR, USD, XAF } from '@dinero.js/currencies';
      import { CURRENCY_SCALE, MoneyAmount } from '@gravel/shared-types';

      const CURRENCY_MAP: Record<string, any> = { XOF, EUR, USD, XAF };

      export function toMinor(majorAmount: number, currency: string): bigint {
        const scale = CURRENCY_SCALE[currency];
        if (scale === undefined) throw new Error(`Unsupported currency ${currency}`);
        // Use string→bigint to avoid float drift; reject pre-multiplied float
        const str = majorAmount.toFixed(scale);
        return BigInt(str.replace('.', ''));
      }

      export function add(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
        if (a.currency !== b.currency) throw new Error('Currency mismatch');
        return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
      }

      // FX conversion via rate_numerator/rate_denominator; bankers rounding (half-even)
      export function convert(amount: MoneyAmount, fx: { fromCurrency: string; toCurrency: string; rateNumerator: bigint; rateDenominator: bigint }): MoneyAmount {
        if (amount.currency !== fx.fromCurrency) throw new Error('FX currency mismatch');
        const targetScale = CURRENCY_SCALE[fx.toCurrency];
        const sourceScale = CURRENCY_SCALE[fx.fromCurrency];
        // Scale-aware bankers rounding at minor units
        const raw = amount.amountMinor * fx.rateNumerator * BigInt(10) ** BigInt(targetScale);
        const divisor = fx.rateDenominator * BigInt(10) ** BigInt(sourceScale);
        const { quotient, remainder } = { quotient: raw / divisor, remainder: raw % divisor };
        // half-even (bankers) at the half-mark
        const doubled = remainder * 2n;
        let rounded = quotient;
        if (doubled > divisor) rounded += 1n;
        else if (doubled === divisor && quotient % 2n !== 0n) rounded += 1n; // round to even
        return { amountMinor: rounded, currency: fx.toCurrency };
      }
      ```
    `apps/api/src/modules/master-data/operational-day.service.ts` — implement per RESEARCH.md lines 478-493, EXTENDED to use `>=` lower boundary and `<` upper boundary per Pitfall 7. Use `date-fns-tz`'s `utcToZonedTime`, `zonedTimeToUtc`. Function signature `resolveBusinessDate(siteIanaTz: string, shiftStartLocal: string, eventUtc: Date): string` returns `YYYY-MM-DD`.

    `apps/api/test/unit/money.spec.ts`: replace stub; cover all Money behaviors above.
    `apps/api/test/unit/operational-day.spec.ts`: replace stub; cover all OperationalDay behaviors above including the DST Europe/Paris case.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api test -- money.spec.ts operational-day.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - All Money behavior tests pass (8+ cases)
    - All OperationalDay behavior tests pass including DST Europe/Paris 2026-10-25
    - `dinero.helpers.ts` does NOT use JavaScript `number` for storage (only for input parsing) — all stored values are bigint
    - `operational-day.service.ts` uses `>=` for lower boundary, `<` for upper boundary
    - FND-07 and FND-08 verification commands in 01-VALIDATION.md flip green
  </acceptance_criteria>
  <done>Money model and OperationalDay resolver shipped; 4 REQs (FND-02, FND-06, FND-07, FND-08) covered by green tests.</done>
</task>

<task type="auto" id="W1-P02-T05" tdd="true">
  <name>Master-data schema integration test (FND-05 partial — UI in plan 05)</name>
  <files>apps/api/test/integration/master-data.spec.ts, apps/api/src/modules/master-data/master-data.module.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-23, D-24, D-25, D-26)
  </read_first>
  <behavior>
    - Test: insert tenant+country+site with valid PostGIS Point gps and IANA tz; SELECT returns geometry as WKT
    - Test: insert ProductionZone with Polygon geometry inside site bounds — succeeds; insert Bench with Polygon — succeeds
    - Test: insert Permit (type='exploitation', valid_from < valid_to); duplicate (site_id, reference) → unique violation
    - Test: archive site (status='archived', archived_at=now()) — soft-delete; row remains queryable
    - Test: hard DELETE on `sites` is rejected (RLS denies for gravel_app — no DELETE policy clause)
    - Test: insert audit_log entries triggered for each of the above ops
  </behavior>
  <action>
    `apps/api/src/modules/master-data/master-data.module.ts`: TypeOrmModule.forFeature with all master-data entities + OperationalDayService provider + exports.

    `apps/api/test/integration/master-data.spec.ts`: replace stub. Use testcontainers + seed-two-tenants. Cover all behaviors. Use `ST_GeomFromText('POINT(-4.024 5.345)', 4326)` for GPS, `ST_GeomFromText('POLYGON((...))', 4326)` for zones/benches.

    Note: CRUD endpoints + Angular UI are deferred to plan W2-P05. This task validates the schema-and-RLS-level guarantees only.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api test:int -- master-data.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - master-data.spec.ts passes with at least 6 behavior tests
    - PostGIS WKT round-trip works
    - Soft-delete works; hard delete is rejected
    - audit_log entries are produced for each mutation
  </acceptance_criteria>
  <done>Master-data schema verified; UI scaffolding remains for plan W2-P05.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gravel/api migration:run` completes with all migrations applied
- `pnpm --filter @gravel/api test:rls-leak` — auto-generated test passes for every tenant-scoped table (FND-02)
- `pnpm --filter @gravel/api test:int -- audit-chain.spec.ts` — chain-of-hash invariants green (FND-06)
- `pnpm --filter @gravel/api test -- money.spec.ts` — bigint minor units + 3 amounts + bankers rounding green (FND-07)
- `pnpm --filter @gravel/api test -- operational-day.spec.ts` — DST Europe/Paris 2026-10-25 green (FND-08)
- `pnpm --filter @gravel/api test:int -- master-data.spec.ts` — schema + RLS + soft-delete + audit triggers green
- Cross-tenant CI test is auto-generated from `information_schema` (NOT hand-maintained per table) per D-08
</verification>

<success_criteria>
- The 4 critical Phase-1 invariants are enforced AT THE DATABASE: tenant isolation (RLS+FORCE), audit chain integrity (triggers), money type discipline (bigint minor + currency), operational day correctness (DST)
- No application code can bypass these by raw SQL — all are enforced server-side
- Tests are auto-generated where possible (RLS leak) so adding a new tenant-scoped table in Phase 2 automatically extends coverage
</success_criteria>

<output>
After completion create `.planning/phases/01-foundation/01-W1-P02-SUMMARY.md` listing: tables created, RLS policies count, audit trigger count, test coverage for FND-02/06/07/08, performance numbers on chain-of-hash (TPS), and any ADR drafts produced.
</output>
