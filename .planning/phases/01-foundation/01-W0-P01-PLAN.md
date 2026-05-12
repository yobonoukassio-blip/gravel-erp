---
phase: 01-foundation
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - pnpm-workspace.yaml
  - package.json
  - tsconfig.base.json
  - .eslintrc.cjs
  - .prettierrc
  - .gitignore
  - apps/api/package.json
  - apps/api/tsconfig.json
  - apps/api/jest.config.ts
  - apps/api/src/main.ts
  - apps/api/src/app.module.ts
  - apps/api/test/setup/testcontainers.ts
  - apps/api/test/integration/identity.spec.ts
  - apps/api/test/security/rls-leak.generator.ts
  - apps/api/test/security/rls-leak.generated.spec.ts
  - apps/api/test/unit/rbac.spec.ts
  - apps/api/test/integration/master-data.spec.ts
  - apps/api/test/integration/audit-chain.spec.ts
  - apps/api/test/unit/money.spec.ts
  - apps/api/test/unit/operational-day.spec.ts
  - apps/api/test/chaos/sync-chaos.spec.ts
  - apps/web/package.json
  - apps/web/e2e/site-create.e2e.ts
  - apps/web/e2e/i18n.e2e.ts
  - apps/mobile/pubspec.yaml
  - apps/mobile/test/widget/i18n_test.dart
  - apps/mobile/integration_test/sync_offline_test.dart
  - apps/mobile/test/helpers/sync_harness.dart
  - packages/shared-types/package.json
  - packages/shared-types/src/jwt-claims.ts
  - packages/shared-types/src/conflict-policy.ts
  - packages/shared-types/src/money.ts
  - packages/i18n/package.json
  - infra/tofu/envs/dev/main.tf
  - infra/tofu/modules/vpc/main.tf
  - infra/tofu/modules/eks/main.tf
  - infra/tofu/modules/rds/main.tf
  - infra/tofu/modules/s3/main.tf
  - infra/.github/workflows/ci.yml
  - infra/.github/workflows/test.yml
autonomous: true
requirements: [FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, FND-11]
must_haves:
  truths:
    - "pnpm install at root resolves all workspaces without error"
    - "All Wave 0 test stubs compile and FAIL with explicit not-implemented messages (RED state)"
    - "tofu validate passes for dev environment infra modules"
    - "CI workflow runs unit + integration + security + chaos tiers and blocks merge on red"
  artifacts:
    - path: "pnpm-workspace.yaml"
      provides: "Monorepo workspace declaration"
      contains: "apps/*"
    - path: "apps/api/test/security/rls-leak.generator.ts"
      provides: "Auto-generator iterating information_schema.columns WHERE column_name='tenant_id'"
    - path: "infra/tofu/modules/rds/main.tf"
      provides: "PostgreSQL 18 Multi-AZ with PostGIS + wal_level=logical + max_replication_slots=20"
      contains: "wal_level"
    - path: "infra/.github/workflows/test.yml"
      provides: "CI test pipeline gating merges"
    - path: "packages/shared-types/src/conflict-policy.ts"
      provides: "ConflictPolicy union: append_only_event | event_sourced_ledger | pessimistic_lock | last_write_wins"
  key_links:
    - from: "infra/.github/workflows/test.yml"
      to: "apps/api/jest.config.ts"
      via: "pnpm --filter @gravel/api test:ci"
      pattern: "test:ci"
    - from: "apps/api/test/setup/testcontainers.ts"
      to: "Postgres 18 + Keycloak 26 containers"
      via: "Testcontainers GenericContainer"
      pattern: "postgres:18"
---

<objective>
Wave 0 bootstrap: create the pnpm monorepo skeleton (apps/api NestJS 11, apps/web Angular 20, apps/mobile Flutter 3.35, packages/shared-types, packages/i18n), scaffold the OpenTofu base infrastructure (VPC, EKS 1.30+ cluster, RDS PostgreSQL 18 Multi-AZ with PostGIS + wal_level=logical, S3 with object lock, IAM), wire GitHub Actions CI with 4-tier test pipeline (unit/integration/security/chaos), and produce ALL Wave 0 test stubs from 01-VALIDATION.md (Nyquist gate) so every downstream production-code task has a pre-existing RED test to turn GREEN. Purpose: every later plan inherits a working pnpm install, a green `tofu validate`, and failing-but-compiling test files that pin executor intent.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation/01-CONTEXT.md
@.planning/phases/01-foundation/01-RESEARCH.md
@.planning/phases/01-foundation/01-VALIDATION.md
@.planning/research/STACK.md
</context>

<tasks>

<task type="auto" id="W0-T01">
  <name>Initialize pnpm monorepo workspace</name>
  <files>pnpm-workspace.yaml, package.json, tsconfig.base.json, .eslintrc.cjs, .prettierrc, .gitignore, .nvmrc</name>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md (section "Recommended Project Structure" lines 256-356)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-44, D-46)
  </read_first>
  <action>
    Create `pnpm-workspace.yaml` with packages: `apps/*`, `packages/*`. Create root `package.json` with name `gravel-erp`, private=true, scripts:
      - `"test:quick": "pnpm -r --parallel run test:quick"`
      - `"test:ci": "pnpm -r run test:ci"`
      - `"lint": "pnpm -r run lint"`
      - `"format": "prettier --write \"**/*.{ts,json,md}\""`
    Add devDependencies: `typescript@^5.5`, `eslint@^8`, `@typescript-eslint/parser@^8`, `@typescript-eslint/eslint-plugin@^8`, `prettier@^3`, `husky@^9`, `lint-staged@^15`.
    Create `tsconfig.base.json` with target=ES2022, module=NodeNext, strict=true, esModuleInterop=true, skipLibCheck=true, declaration=true, resolveJsonModule=true, lib=["ES2022"].
    Create `.eslintrc.cjs` extending `@typescript-eslint/recommended` with custom rules:
      - `no-restricted-syntax` blocking `Literal[regex=/^\\d+\\.\\d+$/]` in `src/**/money/**` (money-float ban per D-16)
      - `no-restricted-syntax` blocking `created_at::date` substring in `src/**/reports/**` (per D-20)
    Create `.prettierrc`: { "singleQuote": true, "trailingComma": "all", "printWidth": 100, "semi": true }.
    Create `.nvmrc` with `24`.
    Create `.gitignore` covering: `node_modules/`, `dist/`, `build/`, `.env*`, `coverage/`, `.idea/`, `.vscode/`, `*.log`, `apps/mobile/.dart_tool/`, `apps/mobile/build/`, `apps/mobile/.flutter-plugins*`, `infra/tofu/**/.terraform/`, `infra/tofu/**/*.tfstate*`.
    Run `pnpm install` to verify resolution.
  </action>
  <verify>
    <automated>pnpm install --frozen-lockfile=false && pnpm exec tsc --version && pnpm exec eslint --version</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm-workspace.yaml` exists and contains `apps/*` and `packages/*`
    - `pnpm install` exits 0
    - `tsconfig.base.json` exists with `"strict": true`
    - `.eslintrc.cjs` references custom money-float / `created_at::date` rules
    - `node --version` matches `.nvmrc`
  </acceptance_criteria>
  <done>Root workspace bootstraps; subsequent tasks can run `pnpm --filter <pkg> ...`.</done>
</task>

<task type="auto" id="W0-T02">
  <name>Scaffold packages/shared-types and packages/i18n base</name>
  <files>packages/shared-types/package.json, packages/shared-types/tsconfig.json, packages/shared-types/src/index.ts, packages/shared-types/src/jwt-claims.ts, packages/shared-types/src/conflict-policy.ts, packages/shared-types/src/money.ts, packages/i18n/package.json, packages/i18n/labels/common/fr.json, packages/i18n/labels/common/en.json</files>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md (Pattern 4 "Per-Entity Sync Conflict Registry")
    - .planning/phases/01-foundation/01-CONTEXT.md (D-04, D-11, D-16, D-17)
  </read_first>
  <action>
    `packages/shared-types/package.json`: name `@gravel/shared-types`, version `0.1.0`, main `dist/index.js`, types `dist/index.d.ts`, scripts: `build: tsc -p .`, `test:quick: echo "no tests yet"`.
    `packages/shared-types/src/jwt-claims.ts` exports interface `JwtClaims` with fields per D-04: `userId: string; tenantId: string; siteIds: string[]; role: 'DIRECTION_GROUPE'|'DIRECTEUR_SITE'|'CHEF_CARRIERE'|'MAINTENANCE'|'HSE'|'FINANCE'|'OPERATEUR_TERRAIN'; groupScope: 'group' | null; preferredLocale: string;`
    `packages/shared-types/src/conflict-policy.ts` exports per D-11:
      ```ts
      export type ConflictPolicy =
        | { strategy: 'append_only_event' }
        | { strategy: 'event_sourced_ledger'; foldFn: string }
        | { strategy: 'pessimistic_lock'; lockTtlSec: number }
        | { strategy: 'last_write_wins' };
      ```
    `packages/shared-types/src/money.ts` exports per D-16/D-17:
      ```ts
      export interface MoneyAmount { amountMinor: bigint; currency: string; /* ISO 4217 CHAR(3) */ }
      export interface TransactionAmounts { original: MoneyAmount; siteFunctional: MoneyAmount; group: MoneyAmount; fxRateId: string; }
      export const CURRENCY_SCALE: Record<string, number> = { XOF: 0, XAF: 0, EUR: 2, USD: 2 };
      ```
    `packages/shared-types/src/index.ts` re-exports all.
    `packages/i18n/package.json`: name `@gravel/i18n`, version `0.1.0`, main `index.js`. Create `labels/common/fr.json` `{ "app.name": "Gravel Ivoire ERP", "common.save": "Enregistrer", "common.cancel": "Annuler" }` and `en.json` `{ "app.name": "Gravel Ivoire ERP", "common.save": "Save", "common.cancel": "Cancel" }`.
    Run `pnpm --filter @gravel/shared-types build`.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/shared-types build && test -f packages/shared-types/dist/index.d.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/shared-types/src/conflict-policy.ts` contains all 4 strategies from D-11
    - `packages/shared-types/src/money.ts` contains `CURRENCY_SCALE` with `XOF: 0` and `EUR: 2`
    - `packages/shared-types/dist/index.d.ts` exists after build
    - `packages/i18n/labels/common/{fr,en}.json` both exist
  </acceptance_criteria>
  <done>Shared types compile and are importable by downstream apps as `@gravel/shared-types`.</done>
</task>

<task type="auto" id="W0-T03">
  <name>Scaffold NestJS 11 apps/api skeleton</name>
  <files>apps/api/package.json, apps/api/tsconfig.json, apps/api/nest-cli.json, apps/api/src/main.ts, apps/api/src/app.module.ts, apps/api/src/modules/health/health.module.ts, apps/api/src/modules/health/health.controller.ts, apps/api/ormconfig.ts, apps/api/jest.config.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md (Project Structure apps/api section, lines 274-304)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-45)
  </read_first>
  <action>
    `apps/api/package.json` name `@gravel/api`, deps: `@nestjs/core@^11 @nestjs/common@^11 @nestjs/platform-express@^11 @nestjs/typeorm@^11 typeorm@^0.3 pg@^8.11 @nestjs/passport passport passport-jwt jwks-rsa @nestjs/cls nestjs-cls class-validator class-transformer nestjs-pino @willsoto/nestjs-prometheus @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node dinero.js @dinero.js/currencies date-fns date-fns-tz @casl/ability reflect-metadata rxjs`. devDeps: `@nestjs/cli @nestjs/testing @types/node@^24 @types/passport-jwt @types/express jest@^29 ts-jest@^29 @testcontainers/postgresql testcontainers supertest`. Scripts:
      - `build: nest build`
      - `start:dev: nest start --watch`
      - `test:quick: jest --selectProjects unit`
      - `test:ci: jest --runInBand`
      - `test:int: jest --selectProjects integration`
      - `test:rls-leak: jest --selectProjects security`
      - `test:chaos: jest --selectProjects chaos`
      - `lint: eslint src test --ext .ts`
      - `migration:run: typeorm-ts-node-commonjs migration:run -d ormconfig.ts`
    `apps/api/tsconfig.json` extends `../../tsconfig.base.json`, outDir `dist`, rootDir `.`, experimentalDecorators=true, emitDecoratorMetadata=true.
    `apps/api/nest-cli.json` standard NestJS 11 config sourceRoot=src.
    `apps/api/jest.config.ts` with **projects**: unit (`testMatch: ['<rootDir>/test/unit/**/*.spec.ts']`), integration (`<rootDir>/test/integration/**/*.spec.ts`), security (`<rootDir>/test/security/**/*.spec.ts`), chaos (`<rootDir>/test/chaos/**/*.spec.ts`). Global setup: `test/setup/testcontainers.ts`. preset `ts-jest`.
    `src/main.ts`: bootstrap NestFactory.create(AppModule), enable global ValidationPipe, listen on `PORT=3000`.
    `src/app.module.ts`: imports placeholder modules per D-45 (HealthModule only for now). Subsequent plans add identity/tenancy/master-data/sync/audit/i18n.
    `src/modules/health/health.controller.ts`: routes `GET /health/live` returns 200 `{status:'ok'}`; `GET /health/ready` returns 200 `{status:'ready'}`.
    `ormconfig.ts`: DataSource pointing to `process.env.DATABASE_URL`, entities glob `src/**/*.entity.ts`, migrations glob `src/migrations/*.ts`, type `postgres`.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api install && pnpm --filter @gravel/api build && pnpm --filter @gravel/api exec -- node -e "require('./dist/main.js')" 2>&1 | head -1 || true</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/package.json` includes `nestjs-cls`, `dinero.js`, `passport-jwt`, `jwks-rsa`
    - `pnpm --filter @gravel/api build` exits 0
    - `apps/api/jest.config.ts` declares 4 projects (unit, integration, security, chaos)
    - `src/modules/health/health.controller.ts` exposes `/health/live` and `/health/ready`
  </acceptance_criteria>
  <done>NestJS app compiles; jest configured with 4 tiers.</done>
</task>

<task type="auto" id="W0-T04">
  <name>Write Wave 0 test stubs (RED state)</name>
  <files>apps/api/test/setup/testcontainers.ts, apps/api/test/integration/identity.spec.ts, apps/api/test/security/rls-leak.generator.ts, apps/api/test/security/rls-leak.generated.spec.ts, apps/api/test/unit/rbac.spec.ts, apps/api/test/integration/master-data.spec.ts, apps/api/test/integration/audit-chain.spec.ts, apps/api/test/unit/money.spec.ts, apps/api/test/unit/operational-day.spec.ts, apps/api/test/chaos/sync-chaos.spec.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-VALIDATION.md (Per-Task Verification Map + Wave 0 Requirements)
    - .planning/phases/01-foundation/01-RESEARCH.md (Auto-Generated Cross-Tenant Leak Test, lines 646-674)
  </read_first>
  <action>
    For EACH stub below, create a Jest spec file that:
      1. Imports the helper module it will eventually exercise (use a `// @ts-expect-error TODO: implement in plan XX-XX` marker if module doesn't exist yet, OR import a placeholder that throws)
      2. Contains a `describe(...)` with at least one `it.todo(...)` AND one `it(... fail explicitly)` that calls `throw new Error('NOT IMPLEMENTED — see plan {targets}')`
      3. Comments at top reference: REQ-ID, plan that will turn green, source decision IDs.

    Stubs to write (one per VALIDATION.md row):
    - `test/setup/testcontainers.ts` — exports `pgContainer`, `kcContainer`, `startContainers()`, `stopContainers()` using `@testcontainers/postgresql` (postgres:18 image) + `GenericContainer('quay.io/keycloak/keycloak:26.0')`. Phase 1 plans wire real fixtures. Currently throws if started: `throw new Error('Wave 0 stub — testcontainers not configured. Plans 02/04 implement.');`
    - `test/integration/identity.spec.ts` — FND-01: `it('SSO Keycloak OIDC validates JWT issued by realm', () => { throw new Error('NOT IMPLEMENTED — plan W1-P04 (Identity)') })`. `it.todo('MFA TOTP optional flow')`.
    - `test/security/rls-leak.generator.ts` — exports `generateRlsLeakTests(dataSource)`. Generator queries `information_schema.columns WHERE column_name='tenant_id' AND table_schema='public'` and emits Jest `it(...)` per table asserting cross-tenant SELECT returns 0 rows when context=tenantA, querying tenantB rows. See research lines 646-674. Stub returns empty array now; preflight test asserts generator function exists.
    - `test/security/rls-leak.generated.spec.ts` — calls generator, runs preflight sentinel check (research §"Pitfall 8"): connect as `gravel_app` (NOT owner), insert sentinel for tenantB, switch to tenantA context, assert sentinel invisible. Currently: `throw new Error('NOT IMPLEMENTED — plan W1-P02 wires data-platform')`.
    - `test/unit/rbac.spec.ts` — FND-03: roles enum from D-04: `['DIRECTION_GROUPE','DIRECTEUR_SITE','CHEF_CARRIERE','MAINTENANCE','HSE','FINANCE','OPERATEUR_TERRAIN']`. `it('CHEF_CARRIERE scoped to site-A cannot access site-B', ...)` throws NOT_IMPLEMENTED (plan W1-P04).
    - `test/integration/master-data.spec.ts` — FND-04, FND-05: CRUD on Tenant, Country, Site (with PostGIS gps_point + iana_timezone + functional_currency), ProductionZone, Bench, Permit. Stub: `throw new Error('plan W2-P05')`.
    - `test/integration/audit-chain.spec.ts` — FND-06: `it('audit chain invariant: row_hash[n] = sha256(row_hash[n-1] || canonical_json(payload))', ...)` per (tenant, table) partition. Stub: throws (plan W1-P02).
    - `test/unit/money.spec.ts` — FND-07: `it('XOF stored as bigint with scale 0; 1000 XOF = 1000n minor units')`. `it('EUR stored as bigint with scale 2; 12.34 EUR = 1234n minor units')`. `it('rejects float currency math')`. `it('three amounts: original + site_functional + group with fx_rate_id')`. Stub: throws (plan W1-P02).
    - `test/unit/operational-day.spec.ts` — FND-08: D-21 DST test: `it('Europe/Paris 2026-10-25 02:30 local resolves consistently across DST end fall-back', ...)`. Stub: throws (plan W1-P02).
    - `test/chaos/sync-chaos.spec.ts` — FND-11: 2 offline clients editing same `daily_activity_log` entity append-only → no loss no duplicate; LWW preference conflict → last write wins. Stub: throws (plan W1-P03).

    Run `pnpm --filter @gravel/api test:ci` — expect ALL tests to FAIL with explicit NOT_IMPLEMENTED messages (RED). This is intentional — Nyquist RED state.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api test:ci 2>&1 | grep -E "NOT IMPLEMENTED|Wave 0 stub" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - 10 spec files exist matching VALIDATION.md Wave 0 list
    - Each spec contains the string "NOT IMPLEMENTED" or "Wave 0 stub"
    - `pnpm --filter @gravel/api test:ci` exits non-zero (RED state expected)
    - `test/security/rls-leak.generator.ts` exports `generateRlsLeakTests` function
  </acceptance_criteria>
  <done>All Wave 0 stubs compile, run, and fail loudly with clear pointers to the plans that will implement them.</done>
</task>

<task type="auto" id="W0-T05">
  <name>Scaffold apps/web Angular 20 skeleton and Wave 0 E2E stubs</name>
  <files>apps/web/package.json, apps/web/angular.json, apps/web/tsconfig.json, apps/web/src/main.ts, apps/web/src/app/app.config.ts, apps/web/src/app/app.routes.ts, apps/web/src/app/app.component.ts, apps/web/playwright.config.ts, apps/web/e2e/site-create.e2e.ts, apps/web/e2e/i18n.e2e.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md (Project Structure apps/web, lines 305-320)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-30, D-32)
  </read_first>
  <action>
    `apps/web/package.json` name `@gravel/web`, deps: `@angular/core@^20 @angular/common@^20 @angular/platform-browser@^20 @angular/router@^20 @angular/material@^20 @angular/cdk@^20 @angular/forms@^20 rxjs@^7 zone.js @tanstack/angular-query-experimental @ngrx/signals@^18 @ngx-formly/core@^6 @ngx-formly/material@^6 ag-grid-angular@^32 ag-grid-enterprise@^32 @jsverse/transloco leaflet @asymmetrik/ngx-leaflet`. devDeps: `@angular/cli@^20 @angular-devkit/build-angular@^20 typescript@~5.5 karma@^6 karma-jasmine jasmine-core @types/jasmine @playwright/test@^1.45`. Scripts:
      - `start: ng serve`
      - `build: ng build`
      - `test:quick: ng test --watch=false --browsers=ChromeHeadless`
      - `test:ci: ng test --watch=false --browsers=ChromeHeadless --code-coverage`
      - `e2e: playwright test`
      - `lint: eslint src e2e --ext .ts`
    `angular.json` standard CLI workspace pointing to src, with `architect.build.options.outputPath: dist/web`, `architect.test.options.karmaConfig: karma.conf.js`.
    `src/main.ts`: `bootstrapApplication(AppComponent, appConfig)`.
    `src/app/app.config.ts`: ApplicationConfig with `provideRouter(routes)`, `provideHttpClient()`, `provideAnimationsAsync()`, transloco provider (placeholder — full setup in W1-P04).
    `src/app/app.routes.ts`: empty `Routes = []` (filled in W1-P04/W2-P05).
    `src/app/app.component.ts`: standalone component with `<router-outlet />`.
    `playwright.config.ts`: baseURL `http://localhost:4200`, testDir `./e2e`, projects chromium only Phase 1.
    `e2e/site-create.e2e.ts` — FND-04 stub: `test('admin tenant creates site with timezone, currency, GPS, permit', async ({page}) => { test.fail(true, 'NOT IMPLEMENTED — plan W2-P05'); throw new Error('NOT IMPLEMENTED'); });`
    `e2e/i18n.e2e.ts` — FND-09 stub: `test('user toggles FR↔EN, preference persisted, applies to mobile and web', ...) { throw new Error('NOT IMPLEMENTED — plan W1-P04'); }`
  </action>
  <verify>
    <automated>pnpm --filter @gravel/web install && pnpm --filter @gravel/web exec -- ng build --configuration=production 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/package.json` lists `@angular/material`, `@jsverse/transloco`, `ag-grid-enterprise`, `@playwright/test`
    - `pnpm --filter @gravel/web build` exits 0
    - `apps/web/e2e/site-create.e2e.ts` exists with "NOT IMPLEMENTED — plan W2-P05" string
    - `apps/web/e2e/i18n.e2e.ts` exists with "NOT IMPLEMENTED" string
  </acceptance_criteria>
  <done>Angular app builds; Playwright E2E stubs in place.</done>
</task>

<task type="auto" id="W0-T06">
  <name>Scaffold apps/mobile Flutter 3.35 skeleton and Wave 0 stubs</name>
  <files>apps/mobile/pubspec.yaml, apps/mobile/analysis_options.yaml, apps/mobile/lib/main.dart, apps/mobile/lib/app/app.dart, apps/mobile/test/widget/i18n_test.dart, apps/mobile/integration_test/sync_offline_test.dart, apps/mobile/test/helpers/sync_harness.dart, apps/mobile/l10n.yaml, apps/mobile/lib/l10n/intl_fr.arb, apps/mobile/lib/l10n/intl_en.arb</files>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md (apps/mobile structure, lines 321-336)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-34, D-35, D-36)
  </read_first>
  <action>
    `pubspec.yaml`: name `gravel_mobile`, environment sdk: `>=3.7.0 <4.0.0`, flutter: `>=3.35.0`. Dependencies: `flutter (sdk)`, `flutter_riverpod: ^2.5.0`, `powersync: ^1.0.0`, `drift: ^2.18.0`, `drift_sqlite_async: ^0.1.0`, `sqlite_async: ^0.10.0`, `flutter_appauth: ^7.0.0`, `flutter_secure_storage: ^9.2.0`, `dio: ^5.4.0`, `intl: ^0.19.0`, `path_provider: ^2.1.0`. dev_dependencies: `flutter_test (sdk)`, `integration_test (sdk)`, `build_runner: ^2.4.0`, `drift_dev: ^2.18.0`.
    flutter: `generate: true`, `uses-material-design: true`.
    `analysis_options.yaml`: include `package:flutter_lints/flutter.yaml`, set `errors: invalid_annotation_target: ignore`.
    `l10n.yaml`: `arb-dir: lib/l10n`, `template-arb-file: intl_en.arb`, `output-localization-file: app_localizations.dart`.
    `lib/l10n/intl_fr.arb`: `{"@@locale":"fr","appName":"Gravel Ivoire ERP","login":"Connexion","activityLog":"Journal d'activité"}`
    `lib/l10n/intl_en.arb`: `{"@@locale":"en","appName":"Gravel Ivoire ERP","login":"Login","activityLog":"Activity log"}`
    `lib/main.dart`: `void main() => runApp(const ProviderScope(child: GravelApp()));`
    `lib/app/app.dart`: stateless `GravelApp` returning MaterialApp with `localizationsDelegates`, `supportedLocales: [Locale('fr'), Locale('en')]`, home: `Scaffold(body: Center(child: Text('Phase 1 shell — see W1-P03')))`.
    `test/widget/i18n_test.dart` — FND-09 stub: `testWidgets('FR ↔ EN switch updates UI', (tester) async { fail('NOT IMPLEMENTED — plan W1-P04 (i18n)'); });`
    `integration_test/sync_offline_test.dart` — FND-10 stub: `testWidgets('mobile captures journal d\\'activité offline, syncs on reconnect, no loss no duplicate', (t) async { fail('NOT IMPLEMENTED — plan W1-P03 (sync + mobile)'); });`
    `test/helpers/sync_harness.dart` — exports `class SyncChaosHarness { Future<void> bringOffline(); Future<void> bringOnline(); Future<void> simulateConflict(); }` with throwing stubs.
  </action>
  <verify>
    <automated>cd apps/mobile && flutter pub get 2>&1 | tail -5 && flutter test test/widget/i18n_test.dart 2>&1 | grep -E "NOT IMPLEMENTED|fail" | head -3</automated>
  </verify>
  <acceptance_criteria>
    - `pubspec.yaml` lists `powersync`, `drift`, `flutter_appauth`, `flutter_secure_storage`, `flutter_riverpod`
    - `flutter pub get` succeeds
    - `test/widget/i18n_test.dart` exists with "NOT IMPLEMENTED" string
    - `integration_test/sync_offline_test.dart` exists with "NOT IMPLEMENTED" string
    - ARB files for fr and en both exist
  </acceptance_criteria>
  <done>Flutter shell ready; Wave 0 mobile stubs fail loudly with clear pointers.</done>
</task>

<task type="auto" id="W0-T07">
  <name>OpenTofu base infrastructure modules (VPC, EKS, RDS Postgres 18, S3)</name>
  <files>infra/tofu/envs/dev/main.tf, infra/tofu/envs/dev/variables.tf, infra/tofu/envs/dev/outputs.tf, infra/tofu/envs/dev/backend.tf, infra/tofu/modules/vpc/main.tf, infra/tofu/modules/eks/main.tf, infra/tofu/modules/rds/main.tf, infra/tofu/modules/s3/main.tf, infra/tofu/modules/iam/main.tf</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-39, D-40, D-41, D-42)
    - .planning/phases/01-foundation/01-RESEARCH.md (Pitfall 3 "PowerSync logical replication slot exhaustion")
  </read_first>
  <action>
    `envs/dev/backend.tf`: `terraform { required_version = ">= 1.8.0", required_providers { aws = { source = "hashicorp/aws", version = "~> 5.60" } }, backend "s3" { bucket = "gravel-tofu-state-dev", key = "phase1/terraform.tfstate", region = "eu-west-3" } }`.
    `envs/dev/main.tf`: provider aws region var.region; module "vpc" source `../../modules/vpc`; module "eks" source `../../modules/eks` depends on vpc; module "rds" source `../../modules/rds` depends on vpc; module "s3" source `../../modules/s3`; module "iam".
    `envs/dev/variables.tf`: `region` default `eu-west-3` (Paris fallback per D-39; switch to af-south-1 if available), `tenant_id_dev`, `environment` default `dev`.
    `modules/vpc/main.tf`: VPC 10.0.0.0/16, 3 public + 3 private subnets across AZs, NAT gateways, route tables. Tag `Phase=1`.
    `modules/eks/main.tf`: EKS cluster version 1.30+, managed node group (t3.medium x2 for dev), aws-auth configmap, OIDC provider. Outputs cluster endpoint + ca.
    `modules/rds/main.tf`: aws_db_instance, engine `postgres`, engine_version `18.0`, instance_class `db.t3.medium`, multi_az = true, allocated_storage 50, storage_encrypted = true, db_subnet_group from VPC private subnets, parameter_group with **`wal_level=logical`, `max_replication_slots=20`, `max_wal_senders=10`** (CRITICAL per research Pitfall 3), `shared_preload_libraries=postgis,timescaledb,pgcrypto`, deletion_protection=false (dev), backup_retention_period 7, performance_insights_enabled true. Output endpoint.
    `modules/s3/main.tf`: aws_s3_bucket `gravel-attachments-dev-${random_suffix}` with `object_lock_enabled=true` (per D-41), versioning enabled, server_side_encryption_configuration AES256, public access blocked.
    `modules/iam/main.tf`: IRSA roles for api pod, sync pod, keycloak pod (each with least-privilege S3/RDS access).
    Run `cd infra/tofu/envs/dev && tofu init -backend=false && tofu validate`.
  </action>
  <verify>
    <automated>cd infra/tofu/envs/dev && tofu fmt -recursive -check && tofu init -backend=false && tofu validate</automated>
  </verify>
  <acceptance_criteria>
    - `tofu validate` exits 0 for envs/dev
    - `modules/rds/main.tf` contains `wal_level` and `max_replication_slots`
    - `modules/s3/main.tf` contains `object_lock_enabled = true`
    - `modules/rds/main.tf` engine_version starts with "18"
    - All modules pass `tofu fmt -check`
  </acceptance_criteria>
  <done>Infrastructure validates as code; plans 02-06 can `tofu apply` to provision real resources.</done>
</task>

<task type="auto" id="W0-T08">
  <name>GitHub Actions CI workflow (4-tier test gating)</name>
  <files>infra/.github/workflows/ci.yml, infra/.github/workflows/test.yml, infra/.github/workflows/tofu-validate.yml, .github/workflows/ci.yml, .github/workflows/test.yml, .github/workflows/tofu-validate.yml</files>
  <read_first>
    - .planning/phases/01-foundation/01-VALIDATION.md (Sampling Rate, Wave 0 Requirements last bullet)
    - .planning/phases/01-foundation/01-CONTEXT.md (D-43)
  </read_first>
  <action>
    Create workflows under both `.github/workflows/` (GitHub-required path) and a mirror under `infra/.github/workflows/` (documentation). The active path is `.github/workflows/`; `infra/` is symlink-or-copy reference for ADR coherence.
    `.github/workflows/ci.yml`:
      ```yaml
      name: ci
      on: [push, pull_request]
      jobs:
        lint:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@v4
            - uses: pnpm/action-setup@v4
              with: { version: 9 }
            - uses: actions/setup-node@v4
              with: { node-version: 24, cache: pnpm }
            - run: pnpm install --frozen-lockfile
            - run: pnpm -r run lint
        build:
          runs-on: ubuntu-latest
          steps: [...]
            - run: pnpm -r run build
      ```
    `.github/workflows/test.yml`: 4 jobs running in parallel:
      - `unit`: `pnpm --filter @gravel/api test:quick && pnpm --filter @gravel/web test:quick`
      - `integration`: services postgres (postgres:18-3-postgis), keycloak (quay.io/keycloak/keycloak:26.0); `pnpm --filter @gravel/api test:int`
      - `security`: services postgres; `pnpm --filter @gravel/api test:rls-leak` (BLOCKING — per D-08)
      - `chaos`: services postgres; `pnpm --filter @gravel/api test:chaos` (BLOCKING — per D-13)
      - `mobile`: `cd apps/mobile && flutter test && flutter test integration_test/`
    All jobs gate on each other via `needs:` and the `merge_group` event so PRs cannot merge red.
    `.github/workflows/tofu-validate.yml`: triggers on `infra/**` changes; runs `tofu fmt -check`, `tofu init -backend=false`, `tofu validate` for envs/dev. BLOCKING.
    Add `concurrency: { group: ${{ github.ref }}, cancel-in-progress: true }` to all workflows.
  </action>
  <verify>
    <automated>test -f .github/workflows/test.yml && grep -q "test:rls-leak" .github/workflows/test.yml && grep -q "test:chaos" .github/workflows/test.yml && grep -q "postgres:18" .github/workflows/test.yml</automated>
  </verify>
  <acceptance_criteria>
    - `.github/workflows/test.yml` runs unit + integration + security + chaos jobs
    - rls-leak and chaos jobs are NOT marked `continue-on-error`
    - postgres service uses `postgres:18` image (PostGIS variant acceptable)
    - keycloak service uses `quay.io/keycloak/keycloak:26.0` image
    - `tofu-validate.yml` runs on infra/** PRs and blocks merge
  </acceptance_criteria>
  <done>CI infrastructure ready; every plan task that lands code triggers the 4-tier pipeline; RED tests block merges.</done>
</task>

</tasks>

<verification>
- `pnpm install` clean install at root succeeds
- `pnpm -r run build` builds api + web + shared-types (mobile build deferred to plan W1-P03)
- `tofu validate` green for envs/dev
- `pnpm --filter @gravel/api test:ci` runs all 4 tiers and exits non-zero (RED state — expected at Wave 0)
- `cd apps/mobile && flutter pub get && flutter test test/widget/i18n_test.dart` runs the stub and fails with NOT_IMPLEMENTED message
- All Wave 0 stub files from 01-VALIDATION.md are present (12 stubs total)
- `.github/workflows/test.yml` blocks merge on red unit/integration/security/chaos
</verification>

<success_criteria>
- Monorepo bootstraps in <5 min for a fresh clone (pnpm install + flutter pub get + tofu init)
- Every REQ-ID FND-01..FND-11 has at least one Wave 0 test stub that fails loudly with a pointer to the implementing plan
- No production code yet — this plan is pure scaffolding + RED tests
- Downstream plans can run `pnpm --filter @gravel/<pkg> <script>` without further setup
</success_criteria>

<output>
After completion create `.planning/phases/01-foundation/01-W0-P01-SUMMARY.md` listing: files created, packages installed (versions resolved), Wave 0 stubs by REQ-ID, infra modules validated, CI workflows registered.
</output>
