# Phase 1: Foundation — Research

**Researched:** 2026-05-12
**Domain:** Multi-tenant ERP foundation — identity, RLS isolation, offline sync, master data, money, time, audit, i18n, mobile shell, observability, infra
**Confidence:** HIGH (stack + patterns derived from project research artifacts; all decisions locked in CONTEXT.md)

## Summary

Phase 1 establishes load-bearing fundamentals for the Gravel Ivoire ERP: a pnpm monorepo carrying a NestJS 11 modular monolith with seven Phase-1 modules (identity, tenancy, master-data, sync, audit, i18n, health), an Angular 20 web admin shell, and a Flutter 3.35 Android-first mobile shell. The platform is multi-tenant via PostgreSQL 18 Row-Level Security with defense-in-depth (DB policies + TypeORM repository wrapper + JWT→GUC injection) and is verified by an auto-generated CI test that iterates every table in the catalog and proves no tenant-A user can read a tenant-B row. Offline-first sync is delivered by PowerSync + Drift, scaffolded with a per-entity conflict policy registry, and validated end-to-end by a single round-trip feature — the daily activity log — that exercises offline capture, Lamport-ordered sync, and read-only display on the web.

Money is `bigint` minor units + `currency CHAR(3)` + `fx_rate_id` referencing an immutable rate table, with three amounts per transaction (original / site-functional / group-pivot). Time is modeled as a first-class `OperationalDay` entity scoped to `site_id`, with a CI lint forbidding `created_at::date` in `reports/`. Audit trail is generated PostgreSQL triggers writing to a monthly-partitioned `audit_log` with chain-of-hash (`prev_hash` + SHA-256 `row_hash`). I18n is Transloco (web) + Flutter `intl` ARB (mobile) with a shared `packages/i18n` for business labels and a `preferred_locale` field on `User`. Observability is OpenTelemetry → Grafana LGTM on AWS EKS (PostgreSQL on RDS, S3 with object lock for content-addressed attachments), provisioned by OpenTofu and delivered by ArgoCD app-of-apps from GitHub Actions.

**Primary recommendation:** Sequence Phase 1 as 6 plans across 3 waves. Wave 0 = repo + infra skeleton + Keycloak. Wave 1 = parallel build of (a) RLS+TypeORM data-platform with money/time/audit, (b) sync framework + Drift schema, (c) i18n + web admin shell. Wave 2 = master-data CRUD on web + journal d'activité round-trip on mobile + cross-tenant CI gate + observability dashboards. Do NOT start business modules; this phase explicitly defers them.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Identity & SSO**
- D-01: Keycloak 26 self-hosted, OIDC
- D-02: Single realm + groups by country/site (NOT realm-per-country in v1)
- D-03: MFA TOTP optional per user; mandatory by role (Direction Groupe, Finance) via Keycloak policy; SMS deferred Phase 6
- D-04: JWT carries `tenant_id`, `site_ids[]`, `role`, `group_scope`. RBAC limited to (role, site_id) tuple in v1
- D-05: Refresh-token rotation, access 15min web / 60min mobile, `httpOnly + SameSite=Lax` cookies web, Android Keystore for mobile refresh

**Multi-Tenant Isolation**
- D-06: PostgreSQL RLS pooled, `current_setting('app.tenant_id')`. NOT schema-per-tenant, NOT DB-per-tenant in v1
- D-07: Three defense layers MANDATORY: (1) RLS Postgres, (2) ORM scoping wrapper, (3) Gateway JWT→GUC injection
- D-08: Cross-tenant CI test BLOCKING on every table — auto-generated from Postgres catalog
- D-09: ADR documents DB-per-tenant upgrade path for VIP clients (Phase 6); no implementation in v1

**Sync Offline-First**
- D-10: PowerSync (commercial) + Drift (SQLite local). NO custom sync. NO ElectricSQL in v1
- D-11: Per-entity conflict registry, 4 strategies: `append_only_event`, `event_sourced_ledger`, `pessimistic_lock`, `last_write_wins`
- D-12: Phase 1 scope = sync skeleton + conflict policy framework + ONE real entity (daily activity log, `append_only_event`)
- D-13: Chaos "split-brain" tests in CI obligatoires (2 offline clients editing same entity)
- D-14: NO `device.now()` ordering. Use Lamport clock or `server_received_at + sequence`

**Money Model**
- D-15: dinero.js v2 backend + frontend
- D-16: `bigint` minor units + `currency CHAR(3)` ISO 4217 + per-currency scale (XOF=0, EUR=2, USD=2). NEVER float/numeric
- D-17: Three amounts per transaction: `amount_original`, `amount_site_functional`, `amount_group`. Conversion via immutable `fx_rate_id`. Phase 1 ships `fx_rates` table + service
- D-18: Half-up banker's rounding at minor-unit level; cumulative rounding forbidden

**Time / Operational Day**
- D-19: `OperationalDay` first-class entity scoped `site_id`. Columns: `id`, `site_id`, `business_date` (DATE), `shift_start_local` (TIME), `iana_timezone` (TEXT), `started_at_utc`, `ended_at_utc`
- D-20: All reports query by `operational_day_id`, NEVER raw `created_at`. CI lint enforces
- D-21: Explicit DST-crossing test in CI (use `Europe/Paris` to exercise DST even though African sites don't have it)
- D-22: `Shift` model linked to `OperationalDay` (stub in Phase 1, full use Phase 3 RH)

**Master Data — Sites, Zones, Permits**
- D-23: Entities `Tenant`, `Country`, `Site`, `ProductionZone`, `Bench`, `Permit`. PostGIS geometries (GPS point site, polygons zones/bancs)
- D-24: Site fields locked (see CONTEXT.md — id, tenant_id, country_id, name, code, gps_point, iana_timezone, functional_currency, manager_user_id, capacity_t_per_day, status, metadata JSONB)
- D-25: Permit fields locked (id, site_id, type, authority, reference, valid_from, valid_to, document_url, status)
- D-26: NO hard-delete on master data — status + `archived_at` only. All business modules reject archived site references

**Audit Trail**
- D-27: Audit via generated PostgreSQL triggers → `audit_log` partitioned monthly. Capture `actor_user_id`, `tenant_id`, `table_name`, `row_pk`, `action`, `before_jsonb`, `after_jsonb`, `at_utc`, `request_id`
- D-28: Chain-of-hash: `prev_hash` + `row_hash = SHA-256(prev_hash || canonical_json(payload))`
- D-29: Convention Phase 1 — every future attachment references content-addressed object storage (key = SHA-256 of content)

**I18n**
- D-30: Transloco for Angular 20 (JSON FR/EN)
- D-31: Flutter `intl` + ARB files. Shared business labels with backend in `packages/i18n`
- D-32: `preferred_locale` field on `User` (default = tenant locale, default `fr-CI`). Switcher web header + mobile settings
- D-33: `Intl` (web) and `intl` (mobile) with user locale. Currency formatted with dinero.js

**Mobile Shell + First Round-Trip**
- D-34: Flutter 3.35+ with Riverpod + Drift + PowerSync. Android-first. iOS deferred Phase 6
- D-35: **Journal d'activité quotidien** = round-trip feature (date, site_id, shift_id, notes ≤500 chars, optional compressed photo). `append_only_event`. Web read-only filterable list. NOT a business module — debug-only tool
- D-36: OIDC native flow via `flutter_appauth` → Keycloak. Refresh token in Android Keystore via `flutter_secure_storage`

**Observability**
- D-37: OpenTelemetry SDK in NestJS + Angular + Flutter → Grafana LGTM auto-hosted
- D-38: Phase 1 minimum = HTTP traces gateway→service→DB, JSON structured logs, metrics `http_request_duration_seconds`, `db_query_duration_seconds`, `sync_event_processed_total`. Dashboard "Phase 1 health" minimal

**Infrastructure**
- D-39: AWS EKS managed Kubernetes. Region af-south-1 preferred, eu-west-3 Paris fallback for Phase 1
- D-40: PostgreSQL 18 on RDS Multi-AZ + PostGIS 3.5 + TimescaleDB (loaded but used only from Phase 5). PgBouncer sidecar
- D-41: AWS S3 with object lock for audit/incidents/permits. One bucket per tenant
- D-42: OpenTofu (NOT Terraform — BSL license). ArgoCD GitOps
- D-43: GitHub Actions CI/CD. npm/pnpm/maven cache

**Backend Codebase Shape**
- D-44: Monorepo pnpm workspaces: `apps/api`, `apps/web`, `apps/mobile` (Dart sub-repo), `packages/shared-types`, `packages/i18n`, `infra/`
- D-45: NestJS modules by bounded context: `identity`, `tenancy`, `master-data`, `sync`, `audit`, `i18n`, `health`
- D-46: TypeORM (NOT Prisma — RLS friction). Repository wrapper with mandatory tenant scoping

### Claude's Discretion

- Exact admin web screen layouts (Material + AG-Grid + Formly CRUD scaffold)
- Exact monorepo file structure (NestJS / Angular CLI conventions)
- Postgres migration naming (recommended `<timestamp>__<verb>_<entity>.sql`)
- Native TypeORM migrations vs sqitch/atlas-go (Claude recommendation: TypeORM CLI native sufficient for Phase 1)
- Health-check endpoint design (`/health/live`, `/health/ready`)
- Dev seed/fixtures pipeline

### Deferred Ideas (OUT OF SCOPE)

- MFA SMS multi-provider (Africa's Talking, Twilio) → Phase 6
- Per-country Keycloak realms → Phase 6
- Fine RBAC delegation + temporary access → Phase 6
- DB-per-tenant migration for VIP clients → Phase 6 (ADR only in Phase 1)
- OpenSearch / full-text search → Phase 1+2 use Postgres FTS
- Kafka/Redpanda event bus → Phase 5
- CDC Debezium + ClickHouse → Phase 4
- iOS native app → Phase 6
- Operator field co-design → kick-off Phase 2
- Sage/Ciel/Odoo OHADA export adapters → Phase 4
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | SSO Keycloak OIDC + MFA optional | Section: Keycloak Setup, Auth Flow, NestJS JWT validation |
| FND-02 | RLS strict isolation + cross-tenant CI test | Section: PostgreSQL RLS Pattern, Cross-Tenant CI Test Generator |
| FND-03 | User with role (Direction Groupe / Directeur Site / Chef Carrière / Maintenance / HSE / Finance / Opérateur Terrain) scoped to sites | Section: Identity & RBAC, JWT claims |
| FND-04 | Tenant admin manages site referential (country, timezone, currency, GPS, manager, status) | Section: Master Data CRUD, PostGIS handling |
| FND-05 | Site admin defines zones, benches, permits | Section: Master Data CRUD |
| FND-06 | Immutable audit trail (user, ts, action, before/after) | Section: Audit Triggers + Chain-of-Hash |
| FND-07 | Money in minor units + currency + three representations (origin/site/group) | Section: dinero.js + Postgres Money Columns |
| FND-08 | Operations attached to OperationalDay (shift_start_local + IANA) | Section: OperationalDay |
| FND-09 | FR/EN UI per-user | Section: I18n Pipeline |
| FND-10 | Mobile Android offline-first capture + sync without loss | Section: PowerSync Wiring, Mobile Shell + journal d'activité |
| FND-11 | Per-entity conflict policy (append-only / event-sourced / pessimistic / LWW) | Section: PowerSync Wiring — Conflict Policy Framework |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Multi-tenant backend architecture is required.
- Mobile must be offline-capable for field entry.
- PostgreSQL with replication + automated backups is mandated.
- Cloud hybrid; VPN inter-sites; multi-currency, multi-language, OHADA-aware.
- Audit trail and at-rest + in-transit encryption are mandatory.
- Mobile performance must remain fluid on low-end rugged Android.
- All file-changing work routed through GSD commands.
- 80% test coverage minimum (from rules/common/testing.md).
- Immutability + repository pattern + structured error handling (rules/common/coding-style.md).
- File size limit 800 lines (hook in rules/web/hooks.md).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11.x | Backend framework | Locked D-44/D-45; DI maps to bounded contexts |
| Node.js | 24 LTS | Runtime | Active LTS through 2028-04 |
| TypeScript | 5.5+ | Language | Required by NestJS 11 + Angular 20 |
| PostgreSQL | 18 | Primary OLTP | Locked D-40; new async I/O, mature RLS |
| PostGIS | 3.5 | Geospatial | Mandatory for site/zone/bench/permit geometries |
| TimescaleDB | 2.17+ | Time-series | Loaded but unused until Phase 5; verify PG18 compat at install |
| TypeORM | 0.3.x | ORM | Locked D-46 — Prisma friction with RLS GUC injection |
| pg (driver) | ^8.11 | Postgres driver | Required by TypeORM 0.3 + PG 18 |
| Keycloak | 26.x | Identity / OIDC | Locked D-01; JDK 21 sidecar |
| Angular | 20.x LTS | Web frontend | Locked; ERP-fit |
| Flutter | 3.35+ | Mobile | Locked D-34; Android-first, Impeller default |
| Dart | 3.7+ | Mobile language | Required by Flutter 3.35 |
| PowerSync | latest SDK (`@powersync/service` server, `powersync_flutter` client) | Sync engine | Locked D-10 |
| Drift | 2.18+ | Flutter ORM on SQLite | Locked; ships official PowerSync integration |
| dinero.js | 2.x + `@dinero.js/currencies` | Money math | Locked D-15 |
| OpenTofu | 1.8+ | IaC | Locked D-42 |
| ArgoCD | 2.12+ | GitOps delivery | Locked D-42 |
| OpenTelemetry SDK | `@opentelemetry/sdk-node` 0.50+ / `@opentelemetry/auto-instrumentations-node` | Tracing | Locked D-37 |
| Grafana LGTM | Grafana 11 / Loki 3 / Tempo 2.5 / Mimir 2.13 | Observability | Locked D-37 |
| AWS EKS | 1.30+ | Orchestration | Locked D-39 |
| AWS RDS | PG 18 Multi-AZ | DB hosting | Locked D-40 |
| AWS S3 | — | Object storage with object lock | Locked D-41 |
| PgBouncer | latest | Connection pooler | Locked D-40 |

### Supporting (Phase-1 specific)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nestjs-cls` | latest | AsyncLocalStorage tenant context | Every request → CLS → TypeORM subscriber → `SET LOCAL app.tenant_id` |
| `@nestjs/passport` + `passport-jwt` + `jwks-rsa` | latest | Validate Keycloak JWTs | Auth guard, fetches JWKS from Keycloak `/.well-known/jwks.json` |
| `class-validator` + `class-transformer` | latest | DTO validation | All inbound API DTOs |
| `nestjs-pino` | latest | Structured JSON logs | → OTel collector → Loki |
| `@willsoto/nestjs-prometheus` | latest | Metrics endpoint | `/metrics` for Mimir scrape |
| `date-fns-tz` | latest | Timezone math | OperationalDay resolution from `(site_id, ts)` |
| `casl` (`@casl/ability`) | latest | RBAC predicates | Defer to Claude's discretion; minimal use in Phase 1 — role+site check only |
| `pnpm` | 9.x | Monorepo manager | Locked D-44 |
| `husky` + `lint-staged` | latest | Git hooks | Pre-commit lint/format |
| `eslint` + `@typescript-eslint` | 8.x | Linting | Plus custom rules for money-float ban + `created_at::date` ban |
| `prettier` | 3.x | Formatter | Backend + web + shared packages |
| `transloco` (`@jsverse/transloco`) | latest | i18n web | Locked D-30 |
| `flutter_appauth` | latest | OIDC mobile auth | Locked D-36 |
| `flutter_secure_storage` | latest | Android Keystore wrap | Refresh tokens |
| `riverpod` (`flutter_riverpod`) | 2.5+ | Mobile state | Locked D-34 |
| `@angular/material` + CDK | 20.x | UI primitives | Admin shell |
| `ag-grid-enterprise` | 32.x | Data grid | Master-data CRUD tables |
| `@ngx-formly/angular` + `@ngx-formly/material` | 6.x | Schema-driven forms | CRUD forms reduce to JSON config |
| `@tanstack/angular-query-experimental` | latest | Server state | API data fetching |
| `@ngrx/signals` | 18.x | Local UI state | Avoid classic NgRx in Phase 1 |
| `@nestjs/typeorm` + `typeorm` | 11.x / 0.3.x | DB layer | Locked D-46 |
| `bullmq` + `@nestjs/bull` | latest | Background jobs (optional Phase 1 — pg-boss alternative) | Audit chain-hash worker if async, sync reconciliation |
| `leaflet` + `@asymmetrik/ngx-leaflet` | latest | Map site GPS picker | Master data form |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeORM | Prisma 5.x | Prisma's per-request `$queryRaw('SET LOCAL ...')` works but pool is per-process; TypeORM subscriber + CLS is cleaner with RLS — locked by D-46 |
| Transloco | `@angular/localize` | Built-in needs rebuild per locale; Transloco gives runtime switch — locked D-30 |
| PowerSync | ElectricSQL / WatermelonDB / custom sync | All explicitly rejected in CONTEXT.md and STACK.md |
| OpenTofu | Terraform | BSL license risk; locked D-42 |
| TypeORM CLI migrations | sqitch / atlas-go | Claude's discretion — TypeORM CLI sufficient for Phase 1 |
| BullMQ | pg-boss | pg-boss avoids second stateful service in Phase 1; either acceptable per CONTEXT.md discretion |

**Installation:**

```bash
# Root (pnpm workspaces)
pnpm init && pnpm add -w -D typescript@^5.5 eslint@^8 @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier husky lint-staged

# apps/api (NestJS 11)
pnpm --filter @gravel/api add @nestjs/core@^11 @nestjs/common@^11 @nestjs/platform-express@^11 \
  @nestjs/typeorm@^11 typeorm@^0.3 pg \
  @nestjs/passport passport passport-jwt jwks-rsa \
  @nestjs/cls nestjs-cls \
  class-validator class-transformer \
  nestjs-i18n nestjs-pino @willsoto/nestjs-prometheus \
  @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  dinero.js @dinero.js/currencies date-fns date-fns-tz \
  @casl/ability

# apps/web (Angular 20)
pnpm --filter @gravel/web add @angular/material @angular/cdk \
  @tanstack/angular-query-experimental \
  @ngrx/signals @ngx-formly/core @ngx-formly/material \
  ag-grid-angular ag-grid-enterprise \
  @jsverse/transloco leaflet @asymmetrik/ngx-leaflet

# apps/mobile (Flutter — pubspec.yaml; managed outside pnpm)
flutter pub add powersync drift drift_sqlite_async sqlite_async \
  flutter_riverpod dio flutter_secure_storage flutter_appauth \
  geolocator signature intl
```

**Version verification (run before pinning):**

```bash
npm view @nestjs/core version
npm view typeorm version
npm view @powersync/service version  # server
flutter pub deps  # after pub add — check actual resolved versions
```

Document versions actually resolved in `apps/api/package.json` + `apps/mobile/pubspec.lock`. The above were CURRENT as of CONTEXT.md research date (2026-05-12); re-confirm at first install.

## Architecture Patterns

### Recommended Project Structure

```
gravel-ivoire/
├── pnpm-workspace.yaml
├── package.json                       # root scripts, husky
├── tsconfig.base.json                 # shared TS config
├── .eslintrc.cjs                      # base rules + custom money/date lint
├── .prettierrc
├── CLAUDE.md
├── .planning/                         # existing GSD planning artifacts
├── docs/
│   └── adr/
│       ├── ADR-0001-rls-multi-tenancy.md
│       ├── ADR-0002-powersync-sync-engine.md
│       ├── ADR-0003-operational-day-model.md
│       ├── ADR-0004-audit-chain-of-hash.md
│       └── ADR-0005-db-per-tenant-upgrade-path.md
├── apps/
│   ├── api/                           # NestJS 11
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── cls/tenant-context.ts        # CLS keys
│   │   │   │   ├── guards/jwt-auth.guard.ts
│   │   │   │   ├── guards/tenant.guard.ts
│   │   │   │   ├── guards/site-scope.guard.ts
│   │   │   │   ├── interceptors/audit.interceptor.ts
│   │   │   │   ├── typeorm/tenant-rls.subscriber.ts
│   │   │   │   ├── typeorm/tenant-aware.repository.ts
│   │   │   │   └── money/dinero.helpers.ts
│   │   │   ├── modules/
│   │   │   │   ├── identity/                    # Users, roles, Keycloak sync
│   │   │   │   ├── tenancy/                     # Tenant, Country entities + admin
│   │   │   │   ├── master-data/                 # Site, ProductionZone, Bench, Permit, FxRate, OperationalDay, Shift
│   │   │   │   ├── sync/                        # PowerSync server bridge, conflict registry
│   │   │   │   ├── audit/                       # audit_log read API, hash verifier
│   │   │   │   ├── i18n/                        # locale resolver, label store
│   │   │   │   └── health/                      # /health/live, /health/ready
│   │   │   ├── migrations/                      # TypeORM CLI migrations
│   │   │   └── otel/                            # OTel SDK init
│   │   ├── test/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── rls-leak/                        # generated cross-tenant test
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── ormconfig.ts
│   ├── web/                           # Angular 20
│   │   ├── src/app/
│   │   │   ├── core/                            # auth, http interceptors, i18n bootstrap
│   │   │   ├── shared/                          # ui kit, formly types, ag-grid wrappers
│   │   │   ├── features/
│   │   │   │   ├── tenants/                     # super-admin view (rare)
│   │   │   │   ├── sites/                       # CRUD
│   │   │   │   ├── zones/
│   │   │   │   ├── benches/
│   │   │   │   ├── permits/
│   │   │   │   ├── users/
│   │   │   │   └── activity-log/                # read-only mobile→web view
│   │   │   ├── layout/                          # sidenav + header + locale switcher
│   │   │   └── app.routes.ts
│   │   ├── i18n/{fr.json, en.json}
│   │   └── angular.json
│   └── mobile/                        # Flutter (Dart sub-repo)
│       ├── lib/
│       │   ├── main.dart
│       │   ├── app/                             # MaterialApp, router, theme
│       │   ├── core/
│       │   │   ├── auth/                        # flutter_appauth + secure storage
│       │   │   ├── sync/                        # PowerSync init + connector
│       │   │   ├── db/                          # Drift schema
│       │   │   └── i18n/                        # generated from ARB
│       │   └── features/
│       │       ├── login/
│       │       ├── settings/                    # locale switcher
│       │       └── activity_log/                # journal d'activité — single round-trip
│       ├── android/                             # Android-first
│       ├── l10n/{intl_fr.arb, intl_en.arb}
│       └── pubspec.yaml
├── packages/
│   ├── shared-types/                  # TS types shared api↔web (e.g., dtos, enums, JWT claim shape)
│   │   └── src/
│   │       ├── jwt-claims.ts
│   │       ├── conflict-policy.ts     # 'append_only_event' | 'event_sourced_ledger' | 'pessimistic_lock' | 'last_write_wins'
│   │       └── money.ts
│   └── i18n/                          # business labels JSON, consumed by api + web + mobile (via codegen)
│       └── labels/{module}/{fr.json,en.json}
└── infra/
    ├── tofu/                          # OpenTofu modules
    │   ├── envs/{dev,staging,prod}/
    │   └── modules/{eks,rds,s3,vpc,keycloak,grafana-lgtm}/
    ├── argocd/
    │   └── app-of-apps/               # ApplicationSet manifests
    └── helm/
        ├── api/
        ├── web/
        ├── keycloak/
        └── grafana-lgtm/
```

### Pattern 1: Tenant Context Injection (Defense in Depth)

**What:** Each request → JWT validation → CLS stores `(tenant_id, user_id, site_ids[], request_id)` → TypeORM subscriber emits `SET LOCAL app.tenant_id = '<uuid>'; SET LOCAL app.user_id = '<uuid>'` on every connection acquired → RLS policies use `current_setting('app.tenant_id')::uuid` → application repository wrapper additionally appends `WHERE tenant_id = :tenant_id` as belt-and-suspenders.

**When to use:** Mandatory for every entity that has `tenant_id`. Three layers (D-07).

**Example (TypeORM subscriber):**

```typescript
// apps/api/src/common/typeorm/tenant-rls.subscriber.ts
// Source: AWS prescriptive guidance — https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html
import { EventSubscriber, EntitySubscriberInterface, InsertEvent, UpdateEvent, RemoveEvent, LoadEvent } from 'typeorm';
import { ClsService } from 'nestjs-cls';

@EventSubscriber()
export class TenantRlsSubscriber implements EntitySubscriberInterface {
  constructor(private readonly cls: ClsService) {}

  // Before any query, ensure GUC is set on the current connection
  async beforeQuery(event: { queryRunner }) {
    const tenantId = this.cls.get('tenantId');
    const userId = this.cls.get('userId');
    const requestId = this.cls.get('requestId');
    if (tenantId) {
      // SET LOCAL is transaction-scoped — survives PgBouncer transaction mode
      await event.queryRunner.query(
        `SELECT set_config('app.tenant_id', $1, true),
                set_config('app.user_id',  $2, true),
                set_config('app.request_id', $3, true)`,
        [tenantId, userId, requestId],
      );
    }
  }
}
```

**Critical:** PgBouncer in **transaction pooling mode** + `SET LOCAL` is the supported combo. **`SET` (without `LOCAL`) is unsafe in transaction pooling — it leaks across pooled clients.** Use `set_config(..., true)` (the `true` arg = `is_local`) inside an explicit transaction.

### Pattern 2: PostgreSQL RLS Policy Template

**What:** Every tenant-scoped table gets identical RLS policy structure.

```sql
-- Source: PostgreSQL 18 docs https://www.postgresql.org/docs/18/ddl-rowsecurity.html

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites FORCE ROW LEVEL SECURITY;  -- applies to table owner too; required for safety

CREATE POLICY sites_tenant_isolation ON sites
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Service role bypass (audit triggers, migrations)
CREATE POLICY sites_service_bypass ON sites
  TO gravel_service
  USING (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
```

**Important:** `FORCE ROW LEVEL SECURITY` is required — the table owner bypasses RLS otherwise. The app should connect as a non-owner role (`gravel_app`).

**Roles required:**
- `gravel_owner` — owns schema; runs migrations only
- `gravel_app` — connects from API; subject to RLS
- `gravel_service` — triggers + maintenance; can set `app.bypass_rls`
- `gravel_audit_writer` — only INSERT on `audit_log`

### Pattern 3: Tenant-Aware Repository Wrapper (Layer 2 of D-07)

```typescript
// apps/api/src/common/typeorm/tenant-aware.repository.ts
import { Repository, SelectQueryBuilder, ObjectLiteral, EntityTarget } from 'typeorm';
import { ClsService } from 'nestjs-cls';

export class TenantAwareRepository<E extends ObjectLiteral & { tenantId: string }> extends Repository<E> {
  constructor(target: EntityTarget<E>, manager: any, private cls: ClsService) {
    super(target, manager);
  }

  createQueryBuilder(alias?: string, queryRunner?: any): SelectQueryBuilder<E> {
    const qb = super.createQueryBuilder(alias, queryRunner);
    const tenantId = this.cls.get('tenantId');
    if (!tenantId) throw new Error('No tenant context');
    return qb.andWhere(`${alias}.tenantId = :__tenantId`, { __tenantId: tenantId });
  }

  // Override .save() to inject tenantId on inserts
  save<T extends Partial<E>>(entity: T | T[], options?): any {
    const tenantId = this.cls.get('tenantId');
    const inject = (e: T) => ({ ...e, tenantId: (e as any).tenantId ?? tenantId });
    const stamped = Array.isArray(entity) ? entity.map(inject) : inject(entity);
    return super.save(stamped as any, options);
  }
}
```

### Pattern 4: Per-Entity Sync Conflict Registry

```typescript
// packages/shared-types/src/conflict-policy.ts
export type ConflictPolicy =
  | { strategy: 'append_only_event' }
  | { strategy: 'event_sourced_ledger'; foldFn: string /* server function name */ }
  | { strategy: 'pessimistic_lock'; lockTtlSec: number }
  | { strategy: 'last_write_wins' };

// apps/api/src/modules/sync/registry.ts
export const ConflictRegistry: Record<string, ConflictPolicy> = {
  daily_activity_log: { strategy: 'append_only_event' },
  user_preferences:   { strategy: 'last_write_wins' },
  // future Phase 2+: stockpile_event, fuel_event, drill_plan, blast_plan ...
};
```

Decorator-based registration (`@SyncEntity({ strategy: 'append_only_event' })`) is canonical but can be deferred — a central registry map is sufficient for Phase 1.

### Pattern 5: OperationalDay Resolver

```typescript
// apps/api/src/modules/master-data/operational-day.service.ts
import { utcToZonedTime, zonedTimeToUtc, format } from 'date-fns-tz';

export class OperationalDayService {
  // Pure function: given site + UTC instant, returns the operational_day_id (business_date).
  resolveBusinessDate(siteIanaTz: string, shiftStartLocal: string /* "06:00" */, eventUtc: Date): string {
    const local = utcToZonedTime(eventUtc, siteIanaTz);
    const [sh, sm] = shiftStartLocal.split(':').map(Number);
    const shiftStartToday = new Date(local);
    shiftStartToday.setHours(sh, sm, 0, 0);
    // If event is before today's shift start, it belongs to yesterday's operational day
    const businessDate = eventUtc < zonedTimeToUtc(shiftStartToday, siteIanaTz)
      ? new Date(local.getTime() - 86400000)
      : local;
    return format(businessDate, 'yyyy-MM-dd', { timeZone: siteIanaTz });
  }
}
```

DST-crossing test: pick `Europe/Paris`, `business_date = 2026-10-25` (the European DST end), assert an event at `02:30 local on the duplicated hour` resolves consistently.

### Anti-Patterns to Avoid

- **`WHERE created_at::date = current_date` in reports** — banned by D-20 CI lint. Always use `operational_day_id`.
- **`number` / `float` / `numeric` for money** — banned by D-16; lint rule must enforce.
- **`SET app.tenant_id = ...` without `LOCAL`/`set_config(..., true)`** — leaks across pooled connections.
- **Manual `WHERE tenant_id = ...` in raw SQL only** — relying on application discipline alone defeats D-07.
- **Calling Postgres as the table OWNER role from the app** — `FORCE ROW LEVEL SECURITY` would still apply, but owner bypasses by default; connect as `gravel_app`.
- **Storing the device clock (`new Date()` from mobile) as the canonical ordering field** — D-14 forbids; use server-assigned Lamport / `(server_received_at, sequence)`.
- **Hard-delete on master data** — D-26 forbids; use `archived_at`.
- **Photos / documents stored mutably in S3** — use object lock + content-addressed key = SHA-256.
- **Realm-per-country in v1** — D-02 explicitly defers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-tenant isolation | Application-only `WHERE tenant_id = ?` | PostgreSQL RLS + GUC + TypeORM wrapper | One forgotten WHERE → cross-tenant leak (PITFALLS #5/#7). |
| Offline mobile sync | Custom queue + REST + LWW | PowerSync + Drift | 6+ engineer-months wasted; conflict resolution is brittle (STACK.md, SUMMARY.md). |
| OIDC token validation | Hand-parsed JWTs | `passport-jwt` + `jwks-rsa` against Keycloak `/.well-known/jwks.json` | Sig verification, JWKS rotation, exp/aud/iss checks are easy to get wrong. |
| Money math | Float arithmetic + manual rounding | dinero.js v2 + per-currency scale table | XOF=0 decimals; OHADA auditors reject off-by-cent (PITFALLS #3). |
| Timezone / DST math | Manual `Date` arithmetic | `date-fns-tz` + `OperationalDay` entity | DST-crossing bugs are silent; PITFALLS #9. |
| Audit logging | Application-level INSERTs after each operation | Generated PostgreSQL row triggers | Cannot be bypassed by raw SQL; consistent shape; PITFALLS #6. |
| Hash chain integrity | Hand-coded prev/row hashing in app | Trigger-side `sha256(prev_hash \|\| canonical_json(NEW))` using `pgcrypto` | Same-transaction guarantee; one writer. |
| Cross-tenant CI test | Per-table hand-written test | Auto-generator iterating `information_schema.tables WHERE has tenant_id column` | D-08 requires every table; manual = drift. |
| i18n loading | Custom JSON loader | Transloco (web), Flutter `intl` codegen (mobile) | Lazy loading, fallback chains. |
| Form CRUD scaffolds | Hand-written reactive forms × dozens | `@ngx-formly/material` JSON schema | Master-data has 6 entities; multiply by create/edit/list. |
| Data grids | Hand-built tables | AG-Grid Enterprise | Server-side rows, filters, pivots ready. |
| K8s manifests | Hand-rolled YAML | Helm charts + ArgoCD ApplicationSet | Drift, env divergence. |
| Token storage on mobile | SharedPreferences plaintext | `flutter_secure_storage` → Android Keystore | Device theft → token leak. |
| GPS picker on map | Custom canvas | Leaflet + ngx-leaflet | OSM tiles, polygons free. |
| Observability stack | Cloud APM SaaS or custom | Grafana LGTM via Helm | Locked D-37; IoT volume kills Datadog economics. |

**Key insight:** This phase is almost entirely "wire up best-in-class libraries with discipline" — there is very little novel code. The leverage is in the **integration patterns** (tenant context flow, conflict registry, audit triggers, OperationalDay resolver) and the **CI gates** (cross-tenant leak test, money lint, OperationalDay lint, sync chaos test).

## Common Pitfalls

### Pitfall 1: PgBouncer transaction mode + RLS `SET` foot-gun

**What goes wrong:** `SET app.tenant_id = '...'` persists on the underlying connection in transaction-pooling mode; the next pooled client sees the previous tenant's GUC. → cross-tenant leak that RLS will not catch.
**Why it happens:** PgBouncer reuses connections between transactions.
**How to avoid:** ALWAYS use `SET LOCAL` or `set_config('key', val, true)` inside an explicit BEGIN/COMMIT. NestJS request-scoped transactions wrap the work; the subscriber emits the GUC inside the transaction. Add a smoke test: open two parallel requests with different tenant IDs through PgBouncer, assert no cross-talk.
**Warning signs:** `SET app.tenant_id` (without LOCAL) in any code or migration.

### Pitfall 2: TypeORM connection lifecycle vs CLS

**What goes wrong:** TypeORM's default repository checks out a connection per query, not per request. CLS context can be empty by the time the subscriber fires if the request handler awaited something that broke async context.
**Why it happens:** `nestjs-cls` needs the `ClsModule.forRoot({ middleware: { mount: true }, ... })` with `useEnterWith: true` or explicit middleware wrapping.
**How to avoid:** Use `ClsModule.forRoot({ middleware: { mount: true, generateId: true } })` and confirm tenant context is set in the JWT auth guard BEFORE the repository touches DB. Wrap each request in `cls.run(() => ...)` if needed.
**Warning signs:** Sporadic `No tenant context` errors under load; missing GUC on the connection.

### Pitfall 3: PowerSync logical replication slot exhaustion

**What goes wrong:** PowerSync needs `wal_level=logical` + a replication slot. On RDS, slot count is capped (`max_replication_slots`, default 10). Multiple sync-service instances can exhaust slots; restart loops compound.
**Why it happens:** Each PowerSync server replica consumes a slot.
**How to avoid:** Phase 1 — single sync service deployment. Document slot quota in ADR. RDS parameter group: `max_replication_slots=20`, `wal_level=logical`, `max_wal_senders=10`. Verify in OpenTofu module.
**Warning signs:** `ERROR: all replication slots are in use`.

### Pitfall 4: Keycloak token aud/iss mismatch in NestJS

**What goes wrong:** `passport-jwt` rejects tokens because `issuer` doesn't match — Keycloak uses the URL it was reached at, not the configured frontend URL.
**Why it happens:** Behind ingress, Keycloak emits `iss=https://internal-svc/...` while clients expect `iss=https://auth.gravel.ci/...`.
**How to avoid:** Set `KC_HOSTNAME=auth.gravel.ci` and `KC_HOSTNAME_STRICT=true` in Keycloak 26. Configure `passport-jwt` `issuer` to match exactly.
**Warning signs:** 401 for all requests with "jwt issuer invalid".

### Pitfall 5: Drift schema drift from Postgres schema

**What goes wrong:** Mobile Drift schema diverges from Postgres → PowerSync sync rules can't map columns → silent sync gap.
**Why it happens:** Two sources of truth.
**How to avoid:** Generate Drift Dart classes from a shared schema source (codegen from `packages/shared-types` or from a Postgres `information_schema` dump). For Phase 1 with only `daily_activity_log` synced, hand-maintain — but write a CI check that diffs the Drift schema against the Postgres migration.
**Warning signs:** Sync events accepted by server, never appear in mobile DB (or vice versa).

### Pitfall 6: Chain-of-hash performance under load

**What goes wrong:** Audit triggers serialize the entire write workload because each row needs the previous `row_hash` → contention on a counter row.
**Why it happens:** Naive global chain = global lock.
**How to avoid:** Chain **per (tenant_id, table_name)** partition — not global. Each chain progresses independently. Confirm by reading partition column in trigger function. Document tradeoff in ADR-0004.
**Warning signs:** TPS collapses with concurrent writes from multiple workers; lock waits on a single `audit_chain_state` row.

### Pitfall 7: OperationalDay ambiguity at shift boundary

**What goes wrong:** Event timestamp falls exactly on `shift_start_local` → resolver puts it on yesterday or today depending on `<` vs `<=`. Off-by-one in reports.
**Why it happens:** Boundary convention undefined.
**How to avoid:** Convention: `event_utc >= operational_day.started_at_utc AND event_utc < operational_day.ended_at_utc`. Document in ADR-0003. Add explicit unit tests at boundary, +1s, -1s.

### Pitfall 8: Cross-tenant CI test that lies green

**What goes wrong:** The auto-generated test connects as `gravel_owner` (the migration role) which bypasses RLS → always green → false confidence.
**Why it happens:** Test fixture wiring.
**How to avoid:** Test MUST connect as `gravel_app` role with no `BYPASSRLS`. Assert one preflight check: query a sentinel row of tenant B while context=tenant A — must return zero. If it returns the row, the test infrastructure is broken, fail loudly.

### Pitfall 9: i18n key sprawl + missing fallbacks

**What goes wrong:** Mobile + web + backend all duplicate the same `site.status.active` label → drift in translations.
**Why it happens:** No single source of truth for business labels.
**How to avoid:** `packages/i18n/labels/<module>/{fr,en}.json` is the source of truth for business labels. Web imports via Transloco custom loader; mobile generates ARB at build via small script; backend reads JSON directly for emails/error messages. Lint rule: no inline French/English strings in business code (only in i18n files).

### Pitfall 10: Mobile photo upload + offline + content-addressed storage

**What goes wrong:** Mobile takes a photo offline, syncs metadata, photo never uploads because S3 client requires auth.
**Why it happens:** Two-phase write not designed.
**How to avoid:** Photo stays in mobile filesystem keyed by local SHA-256. On connectivity, mobile requests a presigned PUT URL from API (`POST /attachments { sha256, size, mime }`). API issues a presigned URL whose object key = `sha256` (idempotent — uploading twice is a no-op). Activity log row references the SHA-256. Phase 1 supports photo as **optional**; photo failures don't block sync.

## Runtime State Inventory

Not applicable — greenfield. No existing services, stored data, OS-registered state, secrets, or build artifacts predate this phase. Verified by `git log` (empty repo) and CONTEXT.md `<code_context>` confirming no existing assets.

## Code Examples

### NestJS JWT Guard with Keycloak JWKS

```typescript
// apps/api/src/common/guards/jwt-auth.guard.ts
// Source: https://www.keycloak.org/docs/latest/securing_apps/#_oidc + https://github.com/auth0/node-jwks-rsa
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${config.get('KEYCLOAK_URL')}/realms/${config.get('KEYCLOAK_REALM')}/protocol/openid-connect/certs`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: config.get('KEYCLOAK_CLIENT_ID'),
      issuer: `${config.get('KEYCLOAK_URL')}/realms/${config.get('KEYCLOAK_REALM')}`,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any) {
    // Map Keycloak claims to JwtClaims shape (packages/shared-types/src/jwt-claims.ts)
    return {
      userId: payload.sub,
      tenantId: payload.tenant_id,
      siteIds: payload.site_ids ?? [],
      role: payload.role,
      groupScope: payload.group_scope ?? null,
      preferredLocale: payload.preferred_locale ?? 'fr-CI',
    };
  }
}
```

### Auto-Generated Cross-Tenant Leak Test (Pseudocode)

```typescript
// apps/api/test/rls-leak/cross-tenant.spec.ts (GENERATED by scripts/generate-rls-tests.ts)
// Iterates information_schema, builds one test per tenant-scoped table.
import { dataSource, asAppUser } from './helpers';

describe('RLS cross-tenant isolation (auto-generated)', () => {
  let tenantA: string, tenantB: string;
  beforeAll(async () => {
    // seed: 2 tenants × 2 sites × 5 users each
    ({ tenantA, tenantB } = await seedTwoTenants());
  });

  const tables = await dataSource.query(`
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'tenant_id' AND table_schema = 'public'
    ORDER BY table_name
  `);

  for (const { table_name } of tables) {
    it(`tenant A cannot read any row of tenant B in ${table_name}`, async () => {
      const conn = await asAppUser(tenantA); // sets app.tenant_id = tenantA
      const rows = await conn.query(`SELECT id FROM ${table_name} WHERE tenant_id = $1 LIMIT 1`, [tenantB]);
      expect(rows).toHaveLength(0);
    });
  }
});
```

### Audit Trigger Generator (SQL)

```sql
-- Source: PostgreSQL trigger docs https://www.postgresql.org/docs/18/plpgsql-trigger.html + pgcrypto
-- Generated by scripts/generate-audit-triggers.ts per table

CREATE OR REPLACE FUNCTION audit_fn_sites() RETURNS trigger AS $$
DECLARE
  v_prev_hash bytea;
  v_payload   jsonb;
  v_row_hash  bytea;
BEGIN
  v_payload := jsonb_build_object(
    'tenant_id', COALESCE(NEW.tenant_id, OLD.tenant_id),
    'table',    'sites',
    'action',   TG_OP,
    'row_pk',   COALESCE(NEW.id, OLD.id)::text,
    'before',   CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    'after',    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END,
    'actor',    current_setting('app.user_id', true),
    'request_id', current_setting('app.request_id', true),
    'at_utc',   now()
  );

  -- Chain per (tenant, table) — see pitfall #6
  SELECT row_hash INTO v_prev_hash FROM audit_log
   WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id) AND table_name = 'sites'
   ORDER BY at_utc DESC, id DESC LIMIT 1;

  v_row_hash := digest(COALESCE(v_prev_hash, '\x00'::bytea) || v_payload::text::bytea, 'sha256');

  INSERT INTO audit_log (tenant_id, table_name, row_pk, action, before_jsonb, after_jsonb,
                         actor_user_id, request_id, at_utc, prev_hash, row_hash)
  VALUES (COALESCE(NEW.tenant_id, OLD.tenant_id), 'sites', COALESCE(NEW.id, OLD.id)::text,
          TG_OP, v_payload->'before', v_payload->'after',
          NULLIF(current_setting('app.user_id', true), '')::uuid,
          NULLIF(current_setting('app.request_id', true), ''),
          now(), v_prev_hash, v_row_hash);

  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_sites
AFTER INSERT OR UPDATE OR DELETE ON sites
FOR EACH ROW EXECUTE FUNCTION audit_fn_sites();

-- audit_log itself is partitioned monthly:
CREATE TABLE audit_log (
  id           bigserial,
  tenant_id    uuid NOT NULL,
  table_name   text NOT NULL,
  row_pk       text NOT NULL,
  action       text NOT NULL,
  before_jsonb jsonb,
  after_jsonb  jsonb,
  actor_user_id uuid,
  request_id   text,
  at_utc       timestamptz NOT NULL,
  prev_hash    bytea,
  row_hash     bytea NOT NULL,
  PRIMARY KEY (id, at_utc)
) PARTITION BY RANGE (at_utc);
-- Partitions created by pg_partman or a monthly migration job.
```

### dinero.js Money Helper

```typescript
// apps/api/src/common/money/dinero.helpers.ts
import { dinero, toSnapshot, Dinero } from 'dinero.js';
import { XOF, EUR, USD } from '@dinero.js/currencies';

const CURRENCIES = { XOF, EUR, USD };

export function makeMoney(minor: bigint, currency: 'XOF' | 'EUR' | 'USD'): Dinero<number> {
  return dinero({ amount: Number(minor), currency: CURRENCIES[currency] });
}

export interface MoneyColumn {
  amount_minor: bigint;
  currency: string;     // CHAR(3) ISO 4217
  fx_rate_id?: string;  // uuid, references fx_rates
}

// Three-amounts convention (D-17):
export interface TransactionAmounts {
  amount_original: MoneyColumn;
  amount_site_functional: MoneyColumn;
  amount_group: MoneyColumn;
}
```

ESLint custom rule (lint level):

```js
// .eslintrc.cjs — fragment
// Forbid money fields typed as `number`. Run a regex check on entity files.
rules: {
  'no-restricted-syntax': [
    'error',
    {
      selector: "PropertyDefinition[key.name=/amount|price|cost/i] > TSTypeAnnotation TSNumberKeyword",
      message: 'Money MUST be bigint minor units, not number/float. See ADR-0003.',
    },
  ],
}
```

### Mobile Drift Schema for daily_activity_log

```dart
// apps/mobile/lib/core/db/schema.dart
// Source: https://drift.simonbinder.eu/ + https://docs.powersync.com/client-sdks/orms/flutter-orm-support
import 'package:drift/drift.dart';

class DailyActivityLog extends Table {
  TextColumn get id => text()();                          // uuid v4 client-generated
  TextColumn get tenantId => text()();
  TextColumn get siteId => text()();
  TextColumn get shiftId => text().nullable()();
  TextColumn get authorUserId => text()();
  DateTimeColumn get businessDate => dateTime()();
  TextColumn get notes => text().withLength(max: 500)();
  TextColumn get photoSha256 => text().nullable()();
  IntColumn get clientSeq => integer()();                 // monotonic local counter
  DateTimeColumn get createdAtLocal => dateTime()();
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))();

  @override
  Set<Column> get primaryKey => {id};
}
```

PowerSync sync rules (server-side YAML):

```yaml
# powersync.yaml
# Source: https://docs.powersync.com/usage/sync-rules
bucket_definitions:
  by_site:
    parameters:
      - SELECT site_id FROM users WHERE id = token_parameters.user_id
    data:
      - SELECT * FROM daily_activity_log WHERE site_id IN bucket.parameters.site_id
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Schema-per-tenant | RLS pooled multi-tenancy with FORCE RLS | PostgreSQL 16+ matured RLS perf; AWS guidance 2024 | Lower ops, but mandates rigorous CI gates |
| Sequelize | TypeORM 0.3.x / Prisma 5 | TypeORM 0.3 dropped legacy patterns | Better RLS hooks via subscribers |
| LWW everywhere on offline sync | Per-entity conflict policy (append-only / event-sourced / pessimistic / LWW) | Realm/Firebase failures in production mobile | Maps to mining domain reality |
| `@angular/localize` + rebuild per locale | Transloco runtime switch | Angular 17+ | Per-user locale without rebuild |
| Bloc / Provider | Riverpod 2.x | Riverpod 2 stable 2024 | Compile-time DI, fewer footguns |
| Realm / Atlas Device Sync | PowerSync + Drift | Atlas Device Sync sunset Sept 2025 | Forced migration; PowerSync is the answer |
| Terraform 1.6+ | OpenTofu 1.8+ | HashiCorp BSL Aug 2023 | License-safe for SaaS distribution |
| classic NgRx | `@ngrx/signals` + TanStack Query | Angular 17 signals + TanStack Angular adapter | Less boilerplate |

**Deprecated/outdated:**
- Realm SDK / Atlas Device Sync — sunset Sept 2025. Don't use.
- TimescaleDB on PG 18 — MEDIUM confidence at install (CONTEXT.md/STACK.md flag). Falls back to PG 17 if needed. Phase 1 doesn't actually USE TimescaleDB; loading the extension is the only Phase 1 task.
- `@nestjs/bull` legacy → `@nestjs/bullmq` is current. (Both in repo; pick `bullmq`.)
- `set app.tenant_id` (session-scoped) — must be `set_config(..., true)` or `SET LOCAL` to be safe with PgBouncer.

## Open Questions

1. **TimescaleDB on PostgreSQL 18 compatibility**
   - What we know: STACK.md flags MEDIUM confidence; CONTEXT.md TODO list confirms verify-at-install.
   - What's unclear: Whether Timescale 2.17+ supports PG18 by the time Phase 1 installs.
   - Recommendation: Phase 1 Wave 0 plan must include a "verify Timescale ↔ PG18" gate. If incompatible, pin RDS to PG17 (Timescale supports up to PG17 confirmed). Document in ADR. Phase 1 doesn't use Timescale features, so a PG17 fallback is acceptable.

2. **`af-south-1` (Cape Town) vs `eu-west-3` (Paris) for Phase 1 region**
   - What we know: D-39 prefers af-south-1 if SLA acceptable, else eu-west-3.
   - What's unclear: Whether af-south-1 supports all needed services (EKS managed addons, RDS PG18, S3 object lock) at parity with eu-west-3.
   - Recommendation: Spike in Wave 0 — try OpenTofu apply against af-south-1; if any module fails (e.g., RDS PG18 minor missing), fall back to eu-west-3 with documented rationale in ADR.

3. **Keycloak admin REST automation for realm export/import**
   - What we know: D-02 single realm + groups; CONTEXT.md asks for realm export/import for IaC.
   - What's unclear: Whether to declare realm as Keycloak `keycloak-config-cli` YAML, raw JSON export, or Operator CRD.
   - Recommendation: `keycloak-config-cli` (open source, GitOps-friendly). Stored in `infra/keycloak/realm-gravel.yaml`, applied as a Job in ArgoCD. Spike feasibility in Wave 0.

4. **Bucket-per-tenant on S3 vs prefix-per-tenant**
   - What we know: D-41 says "bucket per tenant".
   - What's unclear: AWS account-level S3 bucket limit (default 100, soft); doesn't scale beyond ~80 tenants without limit increase.
   - Recommendation: For Phase 1 (1-2 tenants), bucket-per-tenant works. Document limit in ADR-0005 alongside DB-per-tenant upgrade path. Phase 6 may switch to prefix-per-tenant with KMS-key-per-tenant for stronger isolation.

5. **Whether sync write-path goes through PowerSync's bidirectional write API or through a NestJS write proxy**
   - What we know: PowerSync supports a server-authoritative write path where the mobile pushes mutations to your API endpoint, which validates and writes to Postgres; the read path is the PowerSync replication stream.
   - What's unclear: Phase 1 round-trip is `append_only_event` — simplest path.
   - Recommendation: Use NestJS write proxy (`POST /sync/mutations`) even for Phase 1. Establishes the pattern. Conflict policy applies on server.

## Environment Availability

Phase 1 builds infrastructure from scratch via OpenTofu. The local developer environment must support:

| Dependency | Required By | Recommended Probe | Fallback |
|------------|------------|-------------------|----------|
| Node.js 24 LTS | apps/api, apps/web build | `node --version` | Use `nvm` to install 24 |
| pnpm 9.x | workspaces | `pnpm --version` | `corepack enable && corepack prepare pnpm@9 --activate` |
| Docker Desktop / Engine | Local Keycloak, Postgres, EMQX dev | `docker info` | Required — no fallback |
| Flutter 3.35+ | apps/mobile | `flutter --version` | Required — no fallback |
| Android SDK + JDK 21 | apps/mobile Android build + Keycloak | `sdkmanager --list` | Required for mobile work |
| OpenTofu 1.8+ | infra/tofu | `tofu version` | Install from opentofu.org |
| `kubectl` + `helm` | Local apply to EKS / kind | `kubectl version --client` | — |
| `kind` or local K8s | Optional dev cluster | `kind version` | Use EKS dev env instead |
| `psql` 18 client | Migrations, RLS testing | `psql --version` | Use `npx pg`/container |
| AWS CLI v2 | EKS/RDS provisioning | `aws --version` | Required for infra |

**Probe + record actual environment** in the Wave 0 plan; populate a `dev-env-report.md` in the repo root before Wave 1 begins. Missing dependencies are infra-blockers, not code-blockers.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | Jest 29.x (NestJS default) + Supertest for HTTP |
| Backend integration | `@testcontainers/postgresql` (real Postgres 18 + PostGIS) |
| Web framework | Karma + Jasmine (Angular default) — consider migration to Vitest in Phase 2 |
| Web E2E | Playwright 1.4x |
| Mobile framework | Flutter `test` + `integration_test` packages |
| Mobile sync chaos | Custom harness using two `flutter_test` instances against shared PowerSync dev backend |
| Config files | `apps/api/jest.config.ts`, `apps/web/karma.conf.js`, `apps/mobile/test/`, `playwright.config.ts` (root) |
| Quick run | `pnpm -r test --filter ...changed` and `flutter test` |
| Full suite | `pnpm -r test && pnpm -r e2e && cd apps/mobile && flutter test && flutter test integration_test/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FND-01 | Keycloak SSO + token validated | integration | `pnpm --filter @gravel/api test -t "Keycloak JWT"` | ❌ Wave 0 |
| FND-01 | Mobile flutter_appauth → token roundtrip | integration | `cd apps/mobile && flutter test integration_test/auth_test.dart` | ❌ Wave 0 |
| FND-02 | RLS cross-tenant leak — every table | integration (auto-gen) | `pnpm --filter @gravel/api test rls-leak` | ❌ Wave 0 (generator + harness) |
| FND-02 | PgBouncer + SET LOCAL safety | integration | `pnpm --filter @gravel/api test -t "PgBouncer tenant isolation"` | ❌ Wave 0 |
| FND-03 | Role × site_id tuple enforced by guard | unit | `pnpm --filter @gravel/api test site-scope.guard` | ❌ Wave 0 |
| FND-04 | Create site (form + PostGIS GPS point) | E2E | `pnpm e2e -- --grep "create site"` | ❌ Wave 0 |
| FND-05 | Create zone / bench / permit | E2E | `pnpm e2e -- --grep "site admin master data"` | ❌ Wave 0 |
| FND-06 | Audit trigger fires on every mutation; row_hash chain valid | integration | `pnpm --filter @gravel/api test audit-chain` | ❌ Wave 0 |
| FND-07 | Money columns reject float; three-amount transaction round-trips | unit + integration | `pnpm --filter @gravel/api test money` | ❌ Wave 0 |
| FND-07 | dinero.js XOF (scale=0) arithmetic | unit | `pnpm --filter @gravel/api test -t "XOF rounding"` | ❌ Wave 0 |
| FND-08 | OperationalDay resolver — DST crossing test | unit | `pnpm --filter @gravel/api test operational-day` | ❌ Wave 0 |
| FND-08 | Lint: `created_at::date` banned in reports/ | lint | `pnpm lint:custom -- --rule operational-day` | ❌ Wave 0 |
| FND-09 | FR↔EN switch persists per-user, applied web + mobile | E2E + flutter integration | `pnpm e2e -- --grep "locale switch"` + `flutter test integration_test/i18n_test.dart` | ❌ Wave 0 |
| FND-10 | Offline capture journal d'activité; sync on reconnect | flutter integration | `cd apps/mobile && flutter test integration_test/sync_roundtrip_test.dart` | ❌ Wave 0 |
| FND-10 | No event loss / duplication after 24h-equivalent offline replay | sync chaos | `pnpm test:sync-chaos` (custom harness) | ❌ Wave 0 |
| FND-11 | Conflict registry — `append_only_event` dedupes on (client_id, client_seq) | integration | `pnpm --filter @gravel/api test conflict-append-only` | ❌ Wave 0 |
| FND-11 | LWW for user_preferences resolves deterministically | integration | `pnpm --filter @gravel/api test conflict-lww` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm -r test --filter ...changed` + `flutter test` of affected lib (< 30s).
- **Per wave merge:** `pnpm -r test && pnpm -r lint && pnpm -r typecheck && flutter test` + Playwright smoke (3-5 min).
- **Phase gate:** Full suite green, including:
  - Auto-generated `rls-leak` suite (every tenant-scoped table)
  - `audit-chain` integrity verifier on a seeded DB
  - DST-crossing test
  - `sync-chaos` two-client harness
  - All Playwright E2E for master-data CRUD
  - Flutter `integration_test/` round-trip

### Wave 0 Gaps

All test infrastructure must be created — greenfield project:

- [ ] `apps/api/jest.config.ts` — Jest config with `@testcontainers/postgresql`
- [ ] `apps/api/test/helpers/test-db.ts` — spin up PG 18 + PostGIS + run migrations
- [ ] `apps/api/test/helpers/seed-tenants.ts` — 2 tenants × 2 sites × 5 users
- [ ] `apps/api/test/helpers/as-app-user.ts` — connect as `gravel_app` with `set_config('app.tenant_id', ..., true)`
- [ ] `apps/api/scripts/generate-rls-tests.ts` — codegen iterating `information_schema`
- [ ] `apps/api/test/rls-leak/` — directory with generated spec
- [ ] `apps/api/test/audit/audit-chain.spec.ts` — hash chain integrity verifier
- [ ] `apps/api/test/operational-day/dst.spec.ts` — `Europe/Paris` 2026-10-25 DST end
- [ ] `apps/api/test/money/dinero.spec.ts` — XOF/EUR/USD round-trip + half-up banker's rounding
- [ ] `apps/api/test/sync/conflict-policies.spec.ts` — registry behavior per strategy
- [ ] `apps/api/test/keycloak/jwks-validate.spec.ts` — uses a local Keycloak container
- [ ] `apps/web/e2e/` — Playwright setup + master-data CRUD specs
- [ ] `apps/mobile/integration_test/auth_test.dart`
- [ ] `apps/mobile/integration_test/sync_roundtrip_test.dart`
- [ ] `apps/mobile/integration_test/i18n_test.dart`
- [ ] `scripts/sync-chaos/` — two-client harness (Node + headless Flutter or pure SDK)
- [ ] `eslint-rules/no-money-float.js` + `eslint-rules/no-created-at-date-in-reports.js` — custom AST rules
- [ ] CI workflow `.github/workflows/ci.yml` matrix: api / web / mobile / infra-tofu-plan / rls-leak

**Framework installs (Wave 0):**

```bash
pnpm --filter @gravel/api add -D jest @types/jest ts-jest supertest @testcontainers/postgresql
pnpm --filter @gravel/web add -D @playwright/test
# Flutter test pkgs are in default SDK; just run:
# cd apps/mobile && flutter pub add --dev integration_test
```

## Suggested Plan Decomposition

**Recommended cut into 6 plans across 3 waves** (planner refines, this accelerates):

```
Wave 0 (sequential, foundational)
└── P1: Repo Bootstrap + Local Dev Env + Infra Skeleton
    ├── pnpm workspace, tsconfig.base, eslint+prettier+husky, custom lint stubs
    ├── apps/api scaffold (NestJS 11, OTel init, /health endpoints)
    ├── apps/web scaffold (Angular 20, Material, Transloco bootstrap)
    ├── apps/mobile scaffold (Flutter 3.35, Riverpod, Drift, PowerSync deps)
    ├── packages/shared-types, packages/i18n
    ├── infra/tofu (EKS, RDS PG18 + PostGIS, S3 buckets, Keycloak helm, PgBouncer)
    ├── ArgoCD app-of-apps + GitHub Actions matrix (api/web/mobile/tofu)
    ├── Keycloak realm declared via keycloak-config-cli (groups, clients, MFA policy)
    ├── ADR-0001..0005 stubs
    └── Wave 0 exit: smoke deploy to dev EKS, hello-world endpoint, blank Angular shell, blank Flutter shell, Keycloak login button works

Wave 1 (3 parallel plans)
├── P2: Data Platform — RLS + Money + Time + Audit
│   ├── DB roles (gravel_owner, gravel_app, gravel_service, gravel_audit_writer)
│   ├── TenantRlsSubscriber + TenantAwareRepository + nestjs-cls wiring
│   ├── RLS policy template + migration helper
│   ├── Money columns convention + dinero helpers + ESLint custom rule
│   ├── OperationalDay + Shift entities + resolver service + DST test + ESLint rule
│   ├── fx_rates table + service
│   ├── audit_log monthly-partitioned table + audit trigger generator + chain-of-hash
│   ├── Cross-tenant CI test generator iterating information_schema
│   └── Exit: All entities Tenant/Country/Site/Zone/Bench/Permit/User/FxRate/OperationalDay/Shift/DailyActivityLog migrate cleanly with RLS + triggers; cross-tenant suite green on seeded DB
│
├── P3: Sync Framework + Mobile Shell
│   ├── PowerSync server deployment + sync rules YAML for daily_activity_log
│   ├── Conflict policy registry (TS types in shared-types + server map)
│   ├── NestJS /sync/mutations endpoint with conflict-policy dispatcher (Phase 1: append_only_event + last_write_wins only)
│   ├── Drift schema for daily_activity_log + user_preferences
│   ├── Flutter app: navigation rail, flutter_appauth login, secure-storage refresh
│   ├── Riverpod auth state + sync state
│   ├── Locale switcher (intl ARB generation pipeline)
│   ├── Journal d'activité screen: form + offline list + sync status badge
│   ├── Photo SHA-256 + presigned upload endpoint (optional photo)
│   ├── Lamport-style ordering on server (server_received_at + sequence)
│   └── Exit: Mobile captures activity log offline; comes online; entries appear in DB; chaos harness green
│
└── P4: Identity + i18n + Web Admin Shell
    ├── JWT auth guard with jwks-rsa
    ├── TenantGuard, SiteScopeGuard, RoleGuard
    ├── User entity + preferred_locale + role + site_ids syncing from Keycloak (event listener or polling)
    ├── i18n loader (Transloco) reading from packages/i18n + apps/web/i18n
    ├── Locale switcher in header
    ├── Backend nestjs-i18n setup
    ├── Web layout: sidenav + header + auth-callback route + Keycloak silent SSO
    └── Exit: Tenant admin logs in via Keycloak, sees admin shell in FR or EN per preferred_locale

Wave 2 (2 plans, partial parallelism)
├── P5: Master-Data CRUD (Web)
│   ├── ag-grid + formly scaffolds for Tenant, Country, Site, ProductionZone, Bench, Permit
│   ├── Leaflet GPS picker for Site (PostGIS point)
│   ├── Polygon picker (Leaflet draw) for Zone/Bench
│   ├── Permit upload (presigned PUT to S3 with object lock)
│   ├── Soft-delete UI (archived_at) — archive/unarchive action only
│   ├── Validation: archived sites cannot be referenced by new permits
│   ├── Activity Log read-only viewer (filter by site/date)
│   └── Exit: Tenant admin creates a complete site with zones, benches, permits via UI
│
└── P6: Observability + CI/CD Hardening + Phase Gate
    ├── OTel SDK fully wired (HTTP + TypeORM + Postgres) in NestJS
    ├── OTel-JS in Angular (web vitals + route timing)
    ├── OTel-Flutter (basic HTTP + sync events)
    ├── Loki log shipping + Grafana dashboards:
    │   - Phase 1 health (request rate / error rate / p95 latency per module)
    │   - RLS posture (denied queries, GUC missing alerts)
    │   - Sync metrics (events processed, conflicts, lag)
    ├── Final CI matrix: api unit+integration+rls-leak, web unit+lint+E2E, mobile analyzer+test+integration, infra tofu plan, sync-chaos
    ├── ADRs finalized: ADR-0001 RLS, ADR-0002 PowerSync, ADR-0003 OperationalDay, ADR-0004 audit chain-of-hash, ADR-0005 DB-per-tenant upgrade path
    └── Exit: All 5 Phase 1 success criteria provably green in CI; production-like dev environment running on EKS
```

**Dependency graph:**

```
P1 ──┬─→ P2 ──┐
     ├─→ P3 ──┼─→ P5 ──┐
     └─→ P4 ──┘        ├─→ P6
                P2,P3,P4 ─→ P5
```

- P2/P3/P4 require P1 (repo + infra skeleton).
- P5 requires P2 (entities + RLS) and P4 (auth + i18n) — minor dep on P3 for activity-log read view.
- P6 verifies everything and finalizes ADRs/CI gates.

**Wave/parallelism guidance:**

- Wave 0 strictly sequential — one engineer-week if focused; this unblocks everything.
- Wave 1 P2/P3/P4 truly parallel if 3 engineers — they touch disjoint NestJS modules and disjoint apps. Interfaces between them are the JWT claim shape (P4 → P2/P3 consumer) and the entity model (P2 → P5).
- Wave 2 P5 starts as soon as P2 + P4 close; P6 runs alongside P5 (observability + CI work doesn't conflict).

## Sources

### Primary (HIGH confidence)
- PostgreSQL 18 Row Security docs — https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- PostgreSQL 18 `set_config` / GUC — https://www.postgresql.org/docs/18/functions-admin.html
- PostgreSQL trigger procedural language — https://www.postgresql.org/docs/18/plpgsql-trigger.html
- PostgreSQL declarative partitioning — https://www.postgresql.org/docs/18/ddl-partitioning.html
- AWS prescriptive guidance — multi-tenant Postgres RLS — https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html
- AWS blog — multi-tenant Postgres RLS deep dive — https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/
- NestJS 11 docs — https://docs.nestjs.com
- TypeORM 0.3 subscribers — https://typeorm.io/listeners-and-subscribers
- PgBouncer + transaction pooling caveats — https://www.pgbouncer.org/features.html
- Keycloak 26 server admin guide — https://www.keycloak.org/docs/26.0
- Keycloak `keycloak-config-cli` — https://github.com/adorsys/keycloak-config-cli
- PowerSync architecture + sync rules — https://docs.powersync.com/usage/sync-rules
- PowerSync + Drift integration — https://docs.powersync.com/client-sdks/orms/flutter-orm-support
- Drift ORM docs — https://drift.simonbinder.eu/
- flutter_appauth (OIDC native flow) — https://pub.dev/packages/flutter_appauth
- Transloco docs — https://jsverse.github.io/transloco/
- Angular 20 docs — https://angular.dev
- Flutter 3.35 docs — https://docs.flutter.dev
- dinero.js v2 docs — https://v2.dinerojs.com/docs
- OpenTelemetry Node SDK — https://opentelemetry.io/docs/instrumentation/js/
- Grafana LGTM stack — https://grafana.com/oss/lgtm/
- OpenTofu docs — https://opentofu.org/docs/
- ArgoCD ApplicationSet — https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/

### Secondary (MEDIUM confidence)
- date-fns-tz README — https://github.com/marnusw/date-fns-tz (DST handling verified against multiple posts)
- jwks-rsa for passport-jwt — https://github.com/auth0/node-jwks-rsa
- AG Grid Angular — https://www.ag-grid.com/angular-data-grid/getting-started/
- Formly Angular Material — https://formly.dev/docs/ui/material
- ngx-leaflet — https://github.com/Asymmetrik/ngx-leaflet

### Tertiary (LOW confidence — flagged in Open Questions)
- TimescaleDB on PG18 — verify at install (https://docs.timescale.com/self-hosted/latest/install/installation-postgres/)
- AWS `af-south-1` service parity — verify at OpenTofu apply

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — locked in CONTEXT.md with specific versions; STACK.md cross-verifies.
- RLS architecture pattern: HIGH — AWS prescriptive guidance + PostgreSQL official docs.
- Sync framework (PowerSync + Drift): HIGH — official integration docs; vendor-supported.
- Audit chain-of-hash: HIGH — standard `pgcrypto` digest pattern; partition tradeoff documented.
- OperationalDay resolver: HIGH — single pure function with DST test.
- Money model: HIGH — dinero.js v2 + bigint pattern is industry-standard for ERP.
- Observability: HIGH — locked stack, standard wire-up.
- Infrastructure (EKS/RDS/S3/PgBouncer/OpenTofu/ArgoCD): MEDIUM — standard reference architecture; af-south-1 service parity is an open question.
- TimescaleDB PG18: MEDIUM — flagged at install (Phase 1 doesn't use features; falls back to PG17).
- Plan decomposition: MEDIUM — planner will refine based on team capacity and granularity preference.

**Research date:** 2026-05-12
**Valid until:** 2026-06-11 (30 days — Phase 1 stack is mature; minor library version drift only)

## RESEARCH COMPLETE
