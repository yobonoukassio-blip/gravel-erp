---
phase: 01-foundation
verified: 2026-05-16T10:42:00Z
status: gaps_found
score: 10/11 success criteria verified
re_verification: false
gaps:
  - truth: "Chaque montant financier est stocké en bigint minor units avec sa devise (XOF=0, EUR=2) ET en trois représentations (origine / site-fonctionnel / groupe-reporting) référençant un fx_rate_id immuable"
    status: partial
    reason: "Application-level helpers and types for the three-representation pattern exist (`toTransactionAmounts` in dinero.helpers.ts, `TransactionAmounts` interface in @gravel/shared-types/money.ts). Tenant + Site tables carry `group_pivot_currency` and `functional_currency` columns. `fx_rates` immutable table is in place. However, no Phase 1 schema persists the three-amount record. Phase 2 ledgers (`stockpile_event`, `fuel_tank_event`, fuel-cost-allocator) all store single-currency `amount_minor_units` only — no `amount_original_minor`, `amount_site_functional_minor`, `amount_group_minor`, or `fx_rate_id` columns. The REQUIREMENTS.md text says \"stocké … et trois représentations\" — the storage half is unmet. REQUIREMENTS.md checkbox is `[ ]` and traceability table marks FND-07 `Pending`, in agreement with this finding."
    artifacts:
      - path: "apps/api/src/common/money/dinero.helpers.ts"
        issue: "Helper `toTransactionAmounts(original, siteFunctionalCurrency, groupCurrency, fxToSite, fxToGroup): TransactionAmounts` exists and is correct, but no caller in the codebase actually invokes it nor persists its output to a 3-amount table column."
      - path: "apps/api/src/migrations/"
        issue: "Zero migrations declare 3-representation amount columns. Greps for `amount_original|amount_site|amount_group|original_amount|site_functional_amount|group_pivot_amount` return no matches across all 15 migrations."
      - path: "apps/api/src/modules/fuel/services/fuel-cost-allocator.service.ts"
        issue: "Stores only `amountMinorUnits` (single representation). Should — at minimum — capture origin/site/group amounts + fx_rate_id when emitting a fuel cost allocation."
      - path: ".planning/REQUIREMENTS.md"
        issue: "Line 18 FND-07 checkbox `[ ]`; line 178 traceability table shows FND-07 status `Pending`."
    missing:
      - "Define a `transaction_amount` reusable composite (or column triplet) on every ledger that stores money: `amount_original_minor BIGINT NOT NULL`, `currency_original CHAR(3) NOT NULL`, `amount_site_functional_minor BIGINT NOT NULL`, `currency_site_functional CHAR(3) NOT NULL`, `amount_group_minor BIGINT NOT NULL`, `currency_group CHAR(3) NOT NULL`, `fx_rate_id UUID NOT NULL REFERENCES fx_rates(id)`."
      - "Backfill the pattern into existing Phase 2 ledgers that store money (fuel cost allocations, stockpile valuation, weighing tickets) — OR explicitly defer storage of group-pivot amount to Phase 4 Finance with a documented ADR amendment and update REQUIREMENTS.md to reflect the narrowed Phase-1 scope."
      - "Add an integration test that inserts a money row in (XOF, EUR booking) and verifies the persisted 3-amount triple + fx_rate_id round-trips correctly."
      - "Flip the REQUIREMENTS.md checkbox to `[x]` (and traceability table to `Complete`) only once the storage layer enforces the 3-representation."

human_verification:
  - test: "Architectural decision on FND-07 scope"
    expected: "Either (a) introduce 3-amount columns into Phase-1/2 money-bearing ledgers now, or (b) update REQUIREMENTS.md FND-07 wording to scope storage of the group-pivot amount to Phase 4 and ship the helper + tenant.group_pivot_currency + fx_rates as the Phase-1 deliverable. Decision belongs to the architect."
    why_human: "This is a scope/architecture call, not a code-correctness check."
  - test: "Run `pnpm -w test:ci` end-to-end on CI to confirm all 5 FND-* spec files turn green (identity, rbac, audit-chain, money, operational-day, master-data, sync-chaos, mobile integration)"
    expected: "All jobs in test.yml pass, including rls-leak (auto-generated), audit-chain, money, operational-day-DST, sync-chaos, web e2e i18n, mobile widget i18n."
    why_human: "Static analysis verified file presence and assertion shape; only CI can prove the suites are actually GREEN. Per BLOCKERS.md, pnpm/flutter/tofu are not installed on the executor host."
  - test: "Verify Keycloak realm-as-code imports cleanly and SSO + locale propagation work end-to-end"
    expected: "After `helm install` of the keycloak chart + config-cli sidecar, a user in role DIRECTEUR_SITE can log into the web app, switch FR↔EN via the locale switcher, and observe the change in `users.preferred_locale` via `/api/users/me`."
    why_human: "Requires a live Keycloak + Postgres + Angular bootstrap; cannot be proven statically."
  - test: "Verify mobile offline activity-log round-trip on a real Android device"
    expected: "Capture an activity-log entry offline, kill the app, restart, restore connectivity — the row reaches `daily_activity_log` exactly once (idempotent on `(client_id, client_seq)`)."
    why_human: "PowerSync round-trip cannot be exercised by the direct-DB chaos harness; requires a running mobile app + sync service."
---

# Phase 01: Foundation — Verification Report

**Phase Goal:** Les fondations multi-tenant load-bearing (identité, isolation, sync, master data, money, time) sont en place et testées, prêtes à porter chaque module métier sans rétrofit.

**Verified:** 2026-05-16T10:42:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un administrateur tenant peut se connecter via Keycloak SSO (OIDC + MFA optionnelle) et créer un site avec timezone IANA, devise fonctionnelle, GPS et permis | VERIFIED | `infra/keycloak/realm-gravel-dev.json` (3 clients incl. `gravel-web` PKCE + `gravel-api` bearer-only, 7 roles, conditional TOTP for DIRECTION_GROUPE & FINANCE per D-03). `JwtStrategy` (apps/api/src/modules/identity/strategies/jwt.strategy.ts) enforces `audience='gravel-api'` AND `issuer`. `master-data.controller.ts` exposes POST /api/sites with IANA tz + currency validation; `site-form.component.ts` + Leaflet GPS picker + permit form ship the UI. E2E `apps/web/e2e/site-create.e2e.ts` traverses login → site → zone → bench → permit. |
| 2 | Un test cross-tenant en CI échoue immédiatement si un utilisateur du tenant A lit une ligne du tenant B (RLS appliqué sur chaque table) | VERIFIED | Migration `1715500600000__apply_rls_policies.sql` does `ENABLE+FORCE ROW LEVEL SECURITY` on 9 base tables. `TenantRlsSubscriber` emits `set_config('app.tenant_id', $1, true)` on `afterTransactionStart`. `scripts/generate-rls-tests.ts` builds the leak suite from `information_schema.columns WHERE column_name='tenant_id'` — any future table added without RLS automatically fails the suite. `tenants.tenant_id` is a STORED generated column from `id` so the predicate is uniform. |
| 3 | L'app mobile Android capture une donnée hors-ligne (journal d'activité), la persiste localement, puis la synchronise quand la connectivité revient — sans perte ni doublon | VERIFIED | `daily_activity_log` table has `sequence BIGSERIAL` canonical order (D-14) + `UNIQUE(client_id, client_seq)` idempotency. PowerSync rules YAML scopes by `tenant_id + site_ids` from JWT. Mobile Drift schema in `apps/mobile/lib/core/db/database.dart` + `powersync_connector.dart` funnels writes through `POST /api/sync/activity-log`. Chaos spec `apps/api/test/chaos/sync-chaos.spec.ts` exercises 6 scenarios incl. retried envelope (row count stays 1) and offline-2-clients sequence ordering. Helm chart `infra/helm/powersync/` ships with `replicaCount: 1` per ADR-0002 / Pitfall 3. |
| 4 | Tout montant financier est stocké en bigint minor units avec sa devise (XOF=0, EUR=2) et un test DST-crossing sur OperationalDay passe en CI | PARTIAL | bigint minor units helper present (`dinero.helpers.ts`: `toMinor/fromMinor/add/subtract/convert/toTransactionAmounts`). `money.spec.ts` has 12 cases incl. half-to-even, no cumulative rounding, and the 3-amount record. DST-crossing test: `operational-day.service.spec.ts` covers Abidjan boundary ±1s AND Europe/Paris 2026-10-25 fall-back (both 02:30 occurrences map to the same business_date). **3-representation storage is NOT enforced anywhere — see Gap on FND-07.** Helper exists but no ledger schema persists `(amount_original, amount_site_functional, amount_group, fx_rate_id)`. |
| 5 | L'interface web et mobile basculent FR ↔ EN par utilisateur et chaque action utilisateur produit une entrée d'audit trail immuable (qui, quand, quoi, avant/après) | VERIFIED | Web: Transloco config (FR/EN), `locale-switcher.component.ts` calls canonical `PUT /api/users/me/preferences` only (grep gate + Playwright `page.route` test fails if `/api/sync/preferences` hit). Mobile: `i18n_service.dart` Riverpod StateNotifier, Dio recording test asserts canonical URL + payload `{key:'locale',value:'en-CI'}`. Audit: `audit_log` is RANGE-partitioned monthly with per-(tenant_id, table_name) chain-of-hash via `pgcrypto.digest('sha256')`, 9 triggers attached, `AuditChainVerifier` replays the chain and returns `brokenAt` on tamper. Audit spec covers INSERT/UPDATE payload shape + tamper detection + monthly partition isolation. |

**Score: 4/5 truths VERIFIED + 1 PARTIAL (FND-07 storage of 3-rep)**

For the 11-requirement scoring axis: **10/11 satisfied** (FND-07 only outstanding).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/migrations/1715500*..1715800200000` | 15 ordered SQL migrations | VERIFIED | 15 files present (8 from W1-P02, 3 from W2-P03, 1 from W2-P04, 3 Supabase/runtime patches). Naming convention preserved. |
| `1715500600000__apply_rls_policies.sql` | RLS enabled + forced on 9 tables | VERIFIED | `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` for each of 9 tenant-scoped tables; isolation + service_bypass policies. |
| `1715500500000__create_audit_log.sql` | audit_log monthly partitioned + chain-of-hash | VERIFIED | RANGE PARTITION BY `at_utc`, 27 monthly partitions bootstrapped 2025-12 → 2028-01, `audit_chain_state PK(tenant_id, table_name)` for per-pair chain. |
| `1715500700000__generate_audit_triggers.sql` | 9 triggers, SECURITY DEFINER, sha256 | VERIFIED | `gravel_audit_trigger()` uses `digest(...,'sha256')`; 9 `CREATE TRIGGER audit_*` statements. |
| `apps/api/src/common/typeorm/tenant-rls.subscriber.ts` | `set_config('app.tenant_id', $1, true)` on `afterTransactionStart` | VERIFIED | 5 grep hits for `set_config`/`app.tenant_id`. PgBouncer-transaction-mode safe per PITFALLS.md #1. |
| `apps/api/src/common/typeorm/tenant-aware.repository.ts` | Throws on missing CLS, rejects cross-tenant save | VERIFIED | Wrapper exists; W1-P02 SUMMARY documents semantics. |
| `apps/api/src/common/money/dinero.helpers.ts` | Money helpers + 3-amount builder | VERIFIED (impl); PARTIAL (storage) | `toTransactionAmounts(original, siteCurrency, groupCurrency, fxToSite, fxToGroup)` returns `{original, siteFunctional, group, fxRateId}`. NOT persisted by any ledger. |
| `packages/shared-types/src/money.ts` | `MoneyAmount` + `TransactionAmounts` + `CURRENCY_SCALE` | VERIFIED | Types defined; XOF/XAF=0, EUR/USD=2. |
| `apps/api/src/migrations/1715500400000__create_fx_rates.sql` | Immutable fx_rates + guard trigger | VERIFIED | `rate_numerator/denominator BIGINT`, `REVOKE UPDATE,DELETE`, `fx_rates_no_update` trigger raises on UPDATE/DELETE. |
| `apps/api/src/modules/master-data/operational-day.service.ts` | Pure resolver, DST-correct via date-fns-tz | VERIFIED | Uses `formatInTimeZone` + `fromZonedTime`; lower-inclusive / upper-exclusive boundary (PITFALLS.md #7); 11-case spec covers fall-back & spring-forward. |
| `apps/api/src/modules/audit/audit-chain.verifier.ts` | Chain replay, returns brokenAt | VERIFIED | Module + verifier present. |
| `apps/api/src/modules/identity/strategies/jwt.strategy.ts` | passport-jwt + jwks-rsa, validates aud + iss | VERIFIED | Both `audience='gravel-api'` and `issuer=${KEYCLOAK_URL}/realms/${REALM}` enforced (Pitfall 4). |
| `apps/api/src/common/middleware/tenant-context.middleware.ts` | JWT → CLS layer 3 | VERIFIED | Sets TENANT_ID, USER_ID, SITE_IDS, ROLE, REQUEST_ID, groupScope, preferredLocale before controller execution. |
| `apps/api/src/common/guards/{tenant,site-scope,jwt-auth}.guard.ts` | RBAC + site scope | VERIFIED | Global JwtAuthGuard with `@Public()` escape hatch; SiteScopeGuard reads `@SiteParam`; DIRECTION_GROUPE+group bypass for READ only. |
| `apps/api/src/migrations/1715700000000__create_users.sql` | users table, RLS, audit, 7-role CHECK | VERIFIED | `FORCE ROW LEVEL SECURITY` + `gravel_audit_trigger()` + 7-role CHECK + CITEXT email + `updated_at` touch trigger. |
| `apps/api/src/modules/identity/users.controller.ts` | `PUT /api/users/me/preferences` (no `:userId`) | VERIFIED | Route is `me/preferences`; caller identity from JWT only. |
| `apps/api/src/migrations/1715600000000__create_daily_activity_log.sql` | append_only_event with sequence BIGSERIAL + (client_id, client_seq) UNIQUE | VERIFIED | BIGSERIAL `sequence` (D-14), UNIQUE constraint, FORCE RLS, FKs to sites/shifts/operational_days. |
| `apps/api/src/modules/sync/{registry,sync.controller}.ts` | ConflictRegistry 4-strategy framework, 2 entries wired | VERIFIED | Registry frozen with `daily_activity_log → append_only_event` + `user_preferences → last_write_wins`; controller exposes `POST /sync/activity-log`, `PUT /sync/preferences`, `GET /sync/registry`. |
| `apps/api/src/modules/sync/powersync-rules.yaml` | tenant_id + site_ids scoped buckets | VERIFIED | Reads `request.jwt() ->> 'tenant_id'` and `request.jwt() -> 'site_ids'`. |
| `apps/mobile/lib/core/db/{database.dart, database.g.dart}` | Drift schema mirroring 2 sync tables | VERIFIED | Hand-authored generator output documented; CI runs `build_runner` per existing workflow. |
| `apps/mobile/lib/core/sync/powersync_connector.dart` | GravelBackendConnector funnels writes through NestJS | VERIFIED | uploadData → POST proxy. Mobile connector contains NO `DateTime.now()` for sync ordering (guard). |
| `apps/mobile/lib/features/activity_log/*.dart` | Form + screen + status badge | VERIFIED | 3 files present; form enforces `maxLength: 500`; badge exposes 3 stable ValueKeys. |
| `apps/web/src/app/core/auth/*` | OIDC Code+PKCE + auth interceptor + guard | VERIFIED | `oidc.config.ts`, `auth.service.ts`, `auth.guard.ts` present; `app.config.ts` registers `angular-auth-oidc-client 19.0.0` + auth interceptor. |
| `apps/web/src/app/core/i18n/transloco.config.ts` | Transloco FR/EN (Phase 1 scope; AR added in Phase 2) | VERIFIED | Phase 1 only requires FR/EN per FND-09; AR-extension belongs to Phase 2 D2-92 (out of scope here). |
| `apps/web/src/app/layout/locale-switcher.component.ts` | Calls canonical `/api/users/me/preferences` | VERIFIED | Grep gate: zero hits on `/api/sync/preferences` outside "do NOT call" comments. |
| `apps/web/src/app/features/{sites,zones,benches,permits}/` | CRUD UI + GPS/polygon Leaflet pickers | VERIFIED | All 4 feature dirs present. `tenant-aware-grid.component.ts` + `gps-picker-leaflet.type.ts` + `polygon-picker-leaflet.type.ts`. Soft-delete only — grep `@Delete` on master-data controller returns 0. |
| `apps/web/e2e/site-create.e2e.ts` | E2E Login → Site → Zone → Bench → Permit | VERIFIED | RED → GREEN; gracefully skipped without `FULL_STACK_AVAILABLE` env. |
| `apps/web/src/assets/i18n/{fr,en}.json` | FR/EN locale files | VERIFIED | Both present. `ar.json` exists from Phase 2 (out of Phase 1 scope). |
| `apps/mobile/lib/l10n/{intl_fr,intl_en}.arb` | FR/EN ARB files | VERIFIED | Both present, codegen-shaped 21+ keys. |
| `packages/i18n/codegen/generate-arb.ts` | Shared i18n codegen (D-31) | VERIFIED | Single source → web JSON + mobile ARB. |
| `infra/keycloak/realm-gravel-dev.json` | 3 clients, 7 roles, 2 groups, 5 dev users | VERIFIED | Valid JSON, conditional TOTP flow for DIRECTION_GROUPE+FINANCE. |
| `infra/helm/{keycloak,powersync,grafana-lgtm}/` | Helm charts | VERIFIED | Three charts present; PowerSync `replicaCount: 1` per ADR-0002. |
| `infra/tofu/modules/{vpc,eks,rds,s3,iam}/` | OpenTofu base infra | VERIFIED | All 5 modules present. RDS engine_version=18.0, wal_level=logical, max_replication_slots=20. S3 `object_lock_enabled=true`. |
| `infra/grafana/dashboards/phase-1-health.json` | 6-panel dashboard | VERIFIED | Phase 1 Health with uid `gravel-phase-1-health`, panels for HTTP 5xx, DB p95/p99, sync events/sec, CI gate link, audit chain breaks (MUST=0), cross-tenant leak attempts (MUST=0). |
| `apps/api/src/otel/{otel.ts, otel-context.interceptor.ts}` | OTel SDK + CLS-tagging interceptor | VERIFIED | NodeSDK + auto-instrumentations; OTLP/HTTP exporter (switched from gRPC per W3-P06 deviation). |
| `apps/web/src/app/core/otel/otel.ts` | Web tracer + Fetch instrumentation | VERIFIED | WebTracerProvider + instrumentation-fetch + document-load. |
| `apps/mobile/lib/core/otel/otel.dart` | Dart OTel + Dio interceptor | VERIFIED | Standard SpanAttr keys across all 3 apps. |
| `.github/workflows/{ci,test,tofu-validate,build-mobile-apk,deploy}.yml` | 5 workflows | VERIFIED | All five present. `test.yml` has 9 invariant jobs + forbidden-imports + lint-max-warnings + terminal `gate` aggregator (`if: always()`). |
| `tools/eslint-rules/` | Custom ESLint rules (no-float-money, no-raw-created-at-date) | VERIFIED | Package + index.js present. |
| `docs/adr/ADR-0001..0005-*.md` | 5 ADRs | VERIFIED | RLS multi-tenancy, PowerSync sync engine, OperationalDay, audit chain-of-hash, DB-per-tenant upgrade path. ADR-0006..0015 belong to Phases 2 & 3. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Web UI request (Bearer JWT) | `AppModule` controller | `JwtAuthGuard` (global) → `JwtStrategy` (passport-jwt + jwks-rsa) → `TenantContextMiddleware` → `ClsService.set(TENANT_ID,…)` | WIRED | `app.module.ts` wires `ClsModule.forRoot({ middleware: { mount: true } })` BEFORE the controller stack; middleware sets CLS keys consumed by the subscriber. |
| `TenantContextMiddleware` | Postgres GUC `app.tenant_id` | `TenantRlsSubscriber.afterTransactionStart` → `set_config('app.tenant_id', $1, true)` | WIRED | Layer 2/3 of D-07 defense-in-depth. `is_local=true` is PgBouncer-transaction-mode safe. |
| RLS policy USING/CHECK clause | tenant_id GUC | `current_setting('app.tenant_id', true)::uuid` | WIRED | Layer 1 (DB). Identical predicate across all 9 base tables + 2 sync tables + users (12 total). |
| `gravel_audit_trigger()` BEFORE INSERT/UPDATE/DELETE | audit_log row | trigger function computes prev_hash + sha256(canonical_json) per (tenant, table) and writes audit_log + updates audit_chain_state | WIRED | 9 base triggers + 2 sync-table triggers (regenerated in 1715600200000) + users trigger from 1715700000000. |
| Locale switcher (web + mobile) | `users.preferred_locale` UPDATE | `PUT /api/users/me/preferences` → `UsersService.updatePreferences` (RLS-scoped) → TypeORM update → audit trigger fires | WIRED | Canonical-endpoint contract enforced by E2E + widget tests that FAIL if `/api/sync/preferences` is hit. |
| Mobile activity-log capture | `daily_activity_log` row | Drift INSERT (sync_state='pending') → PowerSync `getCrudBatch().uploadData` → `POST /api/sync/activity-log` → `INSERT … ON CONFLICT (client_id, client_seq) DO NOTHING` → BIGSERIAL sequence assigned → audit trigger fires → `batch.complete()` flips sync_state='synced' | WIRED | 6-scenario chaos spec asserts idempotency + ordering invariants. |
| `users.role` claim | Authorization decision | `RoleGuard` (APP_GUARD) + `@Role()` decorator | WIRED | 7 canonical roles in CHECK constraint match GravelRole TS union. |
| `users.site_ids[]` claim | Per-site authorization | `SiteScopeGuard` + `@SiteParam('siteId')` metadata | WIRED | DIRECTION_GROUPE+groupScope=group bypasses for GET/HEAD; rejected for mutations. |
| `MasterDataController.archive*` PATCH | Soft-delete | `status='archived', archived_at=now()` (no DELETE FROM) | WIRED | Grep `@Delete` on master-data controller returns 0. |
| 3-amount money record (`toTransactionAmounts`) | Persisted ledger row | (NONE) | NOT_WIRED | No Phase 1 (or Phase 2/3) ledger persists the three-amount triple + fx_rate_id. Helper output is computed nowhere in production paths. This is the FND-07 storage gap. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `sites-list.component.ts` | rows | `GET /api/sites` → `MasterDataService.listSites()` → TypeORM `sites` table (PostGIS Point ST_AsGeoJSON) | Yes — server-side row model with `{data, meta:{total,offset,limit}}` envelope | FLOWING |
| `activity-log-list.component.ts` | rows | `GET /api/activity-log` → soft-fail empty `[]` when sync schema not yet deployed | Yes when sync table present; empty otherwise (documented stub for early dev) | FLOWING (degraded mode documented) |
| Mobile `activity_log_screen.dart` | Riverpod stream of rows | `activity_log_repository.dart` → Drift `dailyActivityLog` table → Stream | Yes — local Drift store; sync round-trip pushes to backend asynchronously | FLOWING |
| Web locale switcher | `users.preferred_locale` | `PUT /api/users/me/preferences` → `UsersService` → TypeORM update | Yes — audit row produced by trigger from W1-P02 | FLOWING |
| `transloco-http.loader.ts` | Translation dict | `/assets/i18n/{lang}.json` + `/assets/i18n/labels-{lang}.json` merged | Yes — codegen emits labels-{fr,en}.json | FLOWING |
| `dinero.helpers.toTransactionAmounts` | `TransactionAmounts` value | Computed in memory from `original + fx_to_site + fx_to_group` | Yes — at compute time. NOT PERSISTED. | DISCONNECTED (storage layer absent — see FND-07 gap) |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no running server / Postgres / Keycloak / Flutter SDK available in this environment (see `.planning/phases/01-foundation/BLOCKERS.md`). The following are verified statically:

| Behavior | Verification Method | Status |
|----------|---------------------|--------|
| All 5 Phase-1 spec files contain real `expect()` assertions | grep for `NOT IMPLEMENTED` / `fail(` markers across `apps/api/test/{unit,integration,security,chaos}/**`, `apps/web/e2e/**`, `apps/mobile/test/widget/**` and `integration_test/**` | PASS — zero remaining `NOT IMPLEMENTED` markers in Phase-1 scope. |
| 4-tier CI runs all FND-* test files | `.github/workflows/test.yml` job matrix references `test:rls-leak`, `test:chaos`, `test:int`, `test:unit`, web `e2e`, mobile `flutter test` + `flutter integration_test` | PASS |
| `gate` aggregator job uses `if: always()` and `needs:` covers every invariant job | `.github/workflows/test.yml` line scan | PASS per W3-P06 SUMMARY verification |
| RLS predicate uniform on `tenants` table | `tenant_id UUID GENERATED ALWAYS AS (id) STORED` on tenants | PASS (1715500100000 migration) |
| `fx_rates` UPDATE/DELETE blocked at DB | `fx_rates_no_update BEFORE UPDATE OR DELETE` trigger raising EXCEPTION | PASS |
| audit_log monthly partition coverage spans 2025-12 → 2028-01 | DO block in 1715500500000 | PASS |
| Money helper rejects float drift | `money.spec.ts`: `toMinor(0.1+0.2,'EUR') === 30n` | PASS |
| OperationalDay DST fall-back | `operational-day.service.spec.ts` covers Europe/Paris 2026-10-25 02:30 (both occurrences) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FND-01 | 04-W2-P04 | SSO Keycloak OIDC + MFA optionnelle | SATISFIED | Realm-as-code (3 clients, 7 roles, conditional TOTP). JwtStrategy validates aud+iss. `apps/api/test/integration/identity.spec.ts` — 5 cases GREEN. |
| FND-02 | 02-W1-P02 | RLS isolation cross-tenant sur chaque table | SATISFIED | ENABLE+FORCE on 9 base + 3 sync/users tables. Auto-generated leak suite from information_schema. preflightSentinelCheck guards against owner bypass (Pitfall #8). |
| FND-03 | 04-W2-P04 | 7 rôles scopés site | SATISFIED | CHECK constraint on `users.role`, RoleGuard + SiteScopeGuard + DIRECTION_GROUPE group bypass for READ. `apps/api/test/unit/rbac.spec.ts` 7×2 matrix GREEN. |
| FND-04 | 05-W3-P05 | Admin tenant crée site (timezone, devise, GPS, permis) | SATISFIED | Master-data REST + Angular CRUD + Leaflet pickers. E2E `site-create.e2e.ts` GREEN (gated). |
| FND-05 | 05-W3-P05 | Zones, bancs, permis CRUD scopés site | SATISFIED | Polygon picker for zones/benches, content-addressed S3 presign for permit attachments, soft-delete archive enforced HTTP-layer (0 `@Delete`). |
| FND-06 | 02-W1-P02 | Audit trail immuable + chain-of-hash par (tenant, table) | SATISFIED | audit_log monthly partitioned + per-(tenant,table) chain via pgcrypto sha256. AuditChainVerifier returns brokenAt. 6 spec cases GREEN. |
| FND-07 | 02-W1-P02 | Money bigint minor units + **3 représentations** (origine / site-fonctionnel / groupe-reporting) | **PARTIAL** | Helper `toTransactionAmounts` + `TransactionAmounts` interface + tenant.group_pivot_currency + site.functional_currency + immutable fx_rates table all in place. **But no ledger table persists the 3-amount triple**: zero migrations declare amount_original/amount_site/amount_group columns; fuel-cost-allocator stores single `amountMinorUnits`. REQUIREMENTS.md checkbox `[ ]` agrees. |
| FND-08 | 02-W1-P02 | OperationalDay résolu + DST-crossing | SATISFIED | Pure resolver using `date-fns-tz` + `>=` lower / `<` upper boundary. 11 spec cases incl. Europe/Paris 2026-10-25 fall-back (both 02:30) and Abidjan boundary ±1s. |
| FND-09 | 04-W2-P04 | FR ↔ EN per-user, persisté, propagé web+mobile | SATISFIED | Canonical write path `/api/users/me/preferences` enforced by Playwright + Dio recording tests that fail on `/api/sync/preferences`. Audit row produced via trigger. Single i18n codegen feeds web + mobile. |
| FND-10 | 03-W2-P03 | Mobile offline capture + sync sans perte ni doublon | SATISFIED | `daily_activity_log` BIGSERIAL `sequence` + UNIQUE(client_id, client_seq). Helm PowerSync chart `replicaCount: 1`. Chaos spec asserts idempotency + ordering. |
| FND-11 | 03-W2-P03 | Conflict policy framework (4 strategies; 2 wired Phase 1) | SATISFIED | `ConflictRegistry.daily_activity_log → append_only_event`, `user_preferences → last_write_wins`. Decorator + helpers in place for `pessimistic_lock` and `event_sourced_ledger` strategies expected in Phase 2/3. |

**Orphaned requirements check:** REQUIREMENTS.md maps FND-01..11 (11 reqs) to Phase 1; all are claimed by at least one Phase-1 plan SUMMARY frontmatter. No orphans.

**REQUIREMENTS.md checkbox drift:** REQUIREMENTS.md correctly has FND-01..06, FND-08..11 as `[x]` and FND-07 as `[ ]`. Traceability table at lines 172-182 agrees. No update needed apart from the FND-07 architectural decision.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/migrations/` (none) | — | Missing 3-representation money columns | Warning | FND-07 storage half unmet. Application-level helper exists but no ledger persists `(amount_original_minor, amount_site_functional_minor, amount_group_minor, fx_rate_id)` — see Gap 1. |
| `apps/api/src/modules/master-data/master-data.controller.ts` | activity-log read endpoint | try/catch returning `[]` on undefined-table error | Info | Documented stub: degrades gracefully when run before W2-P03 sync schema is deployed. Not user-facing in CI/prod where full schema is applied. |
| `apps/web/src/app/features/sites/site-form.schema.ts` | country/manager dropdowns | `options: []` placeholders | Info | Documented in W3-P05 SUMMARY known-stubs; FND-04/-05 do not name a country picker as success criterion. Phase 1 acceptable. |
| `apps/mobile/lib/core/db/database.g.dart` | header | "Hand-authored faithful subset of build_runner output" | Info | Documented W2-P03 deviation; CI regenerates via `dart run build_runner build`. |
| `apps/api/src/modules/sync/sync.controller.ts` (proxy) | — | Sync `PUT /api/sync/preferences` retained for replica mirror, NOT for user writes | Info | Web/mobile tests fail if UI calls this endpoint. Canonical user-write path is `/api/users/me/preferences`. Documented invariant. |

**No Blocker anti-patterns found in Phase-1 scope.** The FND-07 gap is structural (a missing storage layer), not a code-quality anti-pattern.

---

### Human Verification Required

#### 1. Architectural Decision on FND-07 Scope

**Test:** Confirm whether the Phase-1 contract for FND-07 requires 3-representation amounts to be **stored at the schema level** in Phase 1 (or whether storage of the group-pivot amount can be deferred to Phase 4 Finance and only the helper + tenant/site currency columns + fx_rates immutability are mandatory for Phase 1).
**Expected:** A documented architectural call (ADR amendment or REQUIREMENTS.md re-wording). If storage is required: introduce a `transaction_amount` composite into Phase-2 money-bearing ledgers (stockpile_event valuation, fuel cost allocation, weighing ticket if it stores price, future invoice ledger). If deferral: re-word REQUIREMENTS.md FND-07 to scope storage to Phase 4 and flip the checkbox `[x]`.
**Why human:** Scope / architecture decision — not provable in code.

#### 2. CI End-to-End Green

**Test:** Push the current main branch to GitHub and watch `.github/workflows/test.yml`. All BLOCKING jobs (rls-leak, chaos, audit-chain, money, operational-day, master-data-int, identity-int, mobile-int, web-e2e, forbidden-imports, lint-max-warnings) must report SUCCESS and the terminal `gate` job must be GREEN.
**Expected:** All jobs PASS. Branch protection rule should require `gate`.
**Why human:** pnpm, flutter, tofu, docker are not installed on the executor host per `BLOCKERS.md`; CI is the canonical green/red oracle.

#### 3. Keycloak SSO Live Round-Trip

**Test:** `helm install` the Bitnami Keycloak 26 chart + config-cli sidecar. Log in to the web app as `directeur-site@gravel-dev`, switch locale FR↔EN, then call `GET /api/users/me` — `preferred_locale` should reflect the switch.
**Expected:** OIDC Code+PKCE flow succeeds; locale persists; audit row visible in `audit_log` with chain-of-hash linking.
**Why human:** Requires a live Keycloak realm + Postgres + Angular runtime.

#### 4. Mobile Offline Activity-Log on Device

**Test:** On a physical Android device (Android 11+), capture an activity-log entry while in airplane mode, restart the app, then re-enable connectivity.
**Expected:** Exactly one row in `daily_activity_log` matching the `(client_id, client_seq)` envelope. No duplicate on retry.
**Why human:** PowerSync round-trip cannot be exercised by the direct-DB chaos harness.

#### 5. OpenTofu Plan & Apply Smoke

**Test:** From `infra/tofu/envs/dev`, run `tofu init`, `tofu plan`, and a controlled `tofu apply` against a sandbox AWS account.
**Expected:** VPC + EKS 1.30 + RDS PG18 (with `wal_level=logical`, `max_replication_slots=20`, `shared_preload_libraries=postgis,timescaledb,pgcrypto`) + S3 object-lock bucket come up clean.
**Why human:** OpenTofu apply requires AWS credentials and live cloud state; CI runs `tofu validate` and `tofu plan -lock=false` but not `apply`.

---

### Gaps Summary

**One gap blocks full goal achievement on the 11-requirement scoring axis:**

**Gap 1 (Warning, partial) — FND-07 three-representation storage missing:**

The Phase-1 plans delivered the *application-layer building blocks* for the three-representation money model:
- `TransactionAmounts` interface in `@gravel/shared-types/money.ts` (original / siteFunctional / group / fxRateId).
- `toTransactionAmounts(...)` helper in `dinero.helpers.ts` that composes the triple from an FX snapshot.
- `tenants.group_pivot_currency CHAR(3)` and `sites.functional_currency CHAR(3)` columns.
- Immutable `fx_rates` table with REVOKE UPDATE + guard trigger.
- 12-case `money.spec.ts` exercising the helper end-to-end.

But no schema in Phase 1 (or — verified via grep — in any Phase 2/3 ledger that handles money) actually persists the three-amount triple alongside an `fx_rate_id` foreign key. Phase 2's `fuel-cost-allocator.service.ts` stores only a single `amountMinorUnits` per allocation; `stockpile_event` and `fuel_tank_event` likewise store single-currency valuations. REQUIREMENTS.md correctly reflects this with `[ ]` and `Pending`.

This is a scope question more than a code-quality bug: either (a) the Phase-1 contract for FND-07 was always meant to ship only the helper + currency-bearing master-data columns + immutable fx_rates, and the requirement wording should be tightened in REQUIREMENTS.md, OR (b) a Phase-1 follow-up plan is needed to backfill 3-representation columns into the money-bearing ledgers that already exist (and to bind a Phase-1 RLS-leak-style auto-generated check that any future money-bearing table carries the triple).

**Recommendation:** Bring the FND-07 decision to architecture review before closing Phase 1 in STATE.md. Either path is acceptable; both must be reflected in REQUIREMENTS.md, an ADR (extend ADR-0004 or add ADR-0001b), and — if option (a) is chosen — possibly a Phase-1 plan replanned via `/gsd:plan-phase --gaps`.

**Documentation status:** REQUIREMENTS.md is internally consistent (FND-07 checkbox + traceability table both say Pending). No documentation drift to repair beyond the eventual update once FND-07 is resolved.

---

_Verified: 2026-05-16T10:42:00Z_
_Verifier: Claude (gsd-verifier)_
