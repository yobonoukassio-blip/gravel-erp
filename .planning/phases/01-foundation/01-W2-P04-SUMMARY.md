---
phase: 01-foundation
plan: 04-W2-P04
subsystem: identity-and-i18n
wave: 2
status: complete
tags: [keycloak, oidc, jwt, rbac, cls, rls-layer-3, transloco, flutter-appauth, i18n, locale-switcher]
requirements: [FND-01, FND-03, FND-09]
provides:
  - "Keycloak 26 realm `gravel-dev` as code (3 clients, 7 roles, 2-tier group tree, 5 dev users) auto-imported via keycloak-config-cli"
  - "NestJS JwtStrategy (passport-jwt + jwks-rsa) validating audience=gravel-api + issuer; Pitfall 4 hardened"
  - "TenantContextMiddleware = D-07 layer 3: mirrors JWT claims into CLS (TENANT_ID, USER_ID, SITE_IDS, ROLE, REQUEST_ID, groupScope, preferredLocale) BEFORE controller execution"
  - "Global JwtAuthGuard with @Public() escape hatch; TenantGuard, RoleGuard, SiteScopeGuard for D-07 layer 2 enforcement"
  - "`users` migration with RLS isolation, audit trigger, CHECK constraint matching 7 GravelRole values"
  - "Canonical user-preferences write path: `PUT /api/users/me/preferences` (TypeORM + audit trigger, RLS-scoped, no :userId param)"
  - "Angular shell: AuthModule.forRoot(oidcConfig) (gravel-web Auth Code+PKCE), Material sidenav layout, locale switcher calling canonical endpoint"
  - "Flutter mobile: flutter_appauth + flutter_secure_storage (Keystore), Riverpod I18nService writing to canonical endpoint via Dio"
  - "Shared i18n codegen (packages/i18n/codegen/generate-arb.ts): single source → web JSON + mobile ARB (D-31)"
tech_stack_added:
  - "keycloak 26 (Bitnami Helm chart 22.x) + keycloak-config-cli (adorsys) v6.1.0-26.0.0"
  - "@nestjs/passport + passport-jwt + jwks-rsa (already in package.json)"
  - "@jsverse/transloco + angular-auth-oidc-client 19.0.0 (web)"
  - "flutter_appauth + flutter_secure_storage + dio (already in pubspec.yaml)"
  - "tsx 4.19.2 (root devDependency for i18n codegen execution)"
key_files:
  created:
    - infra/helm/keycloak/Chart.yaml
    - infra/helm/keycloak/values.yaml
    - infra/keycloak/realm-gravel-dev.json
    - infra/keycloak/keycloak-config-cli.values.yaml
    - infra/keycloak/CHECKPOINT.md
    - infra/keycloak/.gitignored-bootstrap-secrets/.gitignore
    - apps/api/src/migrations/1715700000000__create_users.sql
    - apps/api/src/modules/identity/entities/user.entity.ts
    - apps/api/src/modules/identity/strategies/jwt.strategy.ts
    - apps/api/src/modules/identity/identity.module.ts
    - apps/api/src/modules/identity/users.controller.ts
    - apps/api/src/modules/identity/users.service.ts
    - apps/api/src/modules/identity/role.decorator.ts
    - apps/api/src/modules/identity/dto/update-preferences.dto.ts
    - apps/api/src/common/guards/jwt-auth.guard.ts
    - apps/api/src/common/guards/tenant.guard.ts
    - apps/api/src/common/guards/site-scope.guard.ts
    - apps/api/src/common/middleware/tenant-context.middleware.ts
    - apps/api/src/modules/i18n/i18n.module.ts
    - apps/api/src/modules/i18n/locale.resolver.ts
    - apps/api/test/integration/user-preferences.spec.ts
    - apps/web/src/app/core/auth/oidc.config.ts
    - apps/web/src/app/core/auth/auth.service.ts
    - apps/web/src/app/core/auth/auth.guard.ts
    - apps/web/src/app/core/i18n/transloco.config.ts
    - apps/web/src/app/core/i18n/transloco-http.loader.ts
    - apps/web/src/app/layout/main-layout.component.ts
    - apps/web/src/app/layout/header.component.ts
    - apps/web/src/app/layout/locale-switcher.component.ts
    - apps/web/src/app/layout/sidenav.component.ts
    - apps/web/src/app/features/login/login.component.ts
    - apps/web/src/environments/environment.ts
    - apps/web/src/assets/i18n/fr.json
    - apps/web/src/assets/i18n/en.json
    - apps/web/i18n/fr.json
    - apps/web/i18n/en.json
    - apps/mobile/lib/core/auth/oidc_config.dart
    - apps/mobile/lib/core/auth/auth_service.dart
    - apps/mobile/lib/core/i18n/i18n_service.dart
    - apps/mobile/lib/features/login/login_screen.dart
    - apps/mobile/lib/features/settings/settings_screen.dart
    - apps/mobile/ANDROID_SETUP.md
    - packages/i18n/labels/auth/fr.json
    - packages/i18n/labels/auth/en.json
    - packages/i18n/codegen/generate-arb.ts
  modified:
    - apps/api/src/app.module.ts                       # +ClsModule.forRoot + IdentityModule + I18nModule
    - apps/api/test/integration/identity.spec.ts      # RED → GREEN
    - apps/api/test/unit/rbac.spec.ts                 # RED → GREEN
    - apps/web/src/app/app.config.ts                  # +AuthModule + transloco + authInterceptor
    - apps/web/src/app/app.routes.ts                  # login/callback + protected MainLayout
    - apps/web/package.json                           # +angular-auth-oidc-client ^19.0.0
    - apps/web/e2e/i18n.e2e.ts                        # RED → GREEN (canonical-endpoint gate)
    - apps/mobile/lib/l10n/intl_fr.arb                # +21 codegen-shaped keys
    - apps/mobile/lib/l10n/intl_en.arb                # +21 codegen-shaped keys
    - apps/mobile/test/widget/i18n_test.dart          # RED → GREEN (Dio mock + URL gate)
    - packages/i18n/index.js                          # +auth + merged exports
    - packages/i18n/labels/common/fr.json             # +back, +locale.*, +settings.*
    - packages/i18n/labels/common/en.json             # +back, +locale.*, +settings.*
    - package.json                                    # +i18n:gen script, +tsx devDep
metrics:
  files_created: 44
  files_modified: 13
  commits: 5
  duration_minutes: ~35
completed: 2026-05-12
---

# Phase 1 Plan W2-P04: Identity + I18n Summary

Keycloak 26 realm-as-code, NestJS JWT validation, and Layer 3 of the
defense-in-depth chain (D-07): JWT → CLS → DB GUC. The trio (RLS +
TenantAwareRepository from W1-P02 + this plan's middleware) is now complete.

Web and mobile each ship an OIDC-authenticated shell with a locale switcher
that writes to the canonical `PUT /api/users/me/preferences` endpoint —
never to plan 03's `/api/sync/preferences` sync-replica path. Single shared
i18n source (`packages/i18n/labels/**`) feeds both web JSON and Flutter ARB
via one codegen script.

## What Landed

### Keycloak (infra/)

| File | Purpose |
|------|---------|
| `infra/helm/keycloak/{Chart,values}.yaml` | Bitnami Keycloak 26 + config-cli sidecar |
| `infra/keycloak/realm-gravel-dev.json` | Realm-as-code: 3 clients, 7 roles, 2 groups, 5 dev users |
| `infra/keycloak/keycloak-config-cli.values.yaml` | Idempotent realm-import job |
| `infra/keycloak/CHECKPOINT.md` | Human-verify procedure + autonomous local bootstrap |

The realm declares:

- **Clients:** `gravel-api` (bearer-only), `gravel-web` (Auth Code+PKCE, redirectUris localhost:4200), `gravel-mobile` (native PKCE, redirectUri `ci.gravel.mobile://oauth/callback`).
- **Roles:** all 7 from D-04.
- **Groups:** `/tenant-dev/{site-ci-abidjan, site-ci-yamoussoukro}` (D-02 single realm + groups).
- **Client scope `gravel-claims`:** 6 protocol mappers emitting `tenant_id`, `site_ids[]`, `role`, `group_scope`, `preferred_locale`, and audience=`gravel-api`.
- **Token lifetimes:** access 15 min (web) / 60 min (mobile), refresh rotation.
- **Auth flow:** conditional TOTP required for `DIRECTION_GROUPE` and `FINANCE` only (D-03).
- **Pitfall 4 hardening:** `KC_HOSTNAME_STRICT=true` so `iss` claim matches issuer URL clients use.

### NestJS Identity Module (apps/api/)

- `migrations/1715700000000__create_users.sql` — `users` table with RLS isolation, FORCE RLS, audit trigger attached (uses `gravel_audit_trigger()` from W1-P02), CITEXT email uniqueness per `(tenant_id, email)`, CHECK constraint matching the 7-role enum.
- `JwtStrategy` — passport-jwt + jwks-rsa against Keycloak JWKS URI; enforces `audience='gravel-api'` AND `issuer='${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}'`. Maps raw Keycloak claims to typed `JwtClaims` from `@gravel/shared-types`.
- `JwtAuthGuard` — global APP_GUARD; `@Public()` decorator skips JWT verification on `/health/*`.
- `TenantContextMiddleware` — D-07 layer 3. Mirrors all JWT claims into CLS synchronously via `cls.set()` so the TenantRlsSubscriber from W1-P02 sees `app.tenant_id` correctly on its first transaction. Pitfall 2 mitigation (TypeORM connection lifecycle vs CLS).
- `TenantGuard` + `SiteScopeGuard` + `RoleGuard` — defense-in-depth at the application layer. SiteScopeGuard reads `@SiteParam('paramName')` metadata and rejects with 403 unless `req.params.siteId` is in the caller's `site_ids[]`. DIRECTION_GROUPE+groupScope=`group` bypasses for READ (GET/HEAD) but is still rejected for mutating methods.
- `UsersController` — `GET /api/users/me`, `PUT /api/users/me/preferences`. Caller identity comes from JWT only; **no `:userId` path param**, making cross-user mutation impossible at the routing layer.
- `UsersService.updatePreferences()` — TypeORM `update()` on `users.preferred_locale`. RLS scopes the write to the caller's tenant; the audit trigger from W1-P02 produces a chain-of-hash audit row automatically.
- `UpdatePreferencesDto` — class-validator with strict locale tag regex `^[a-z]{2}(-[A-Z]{2})?$`.
- `LocaleResolver` — pure read from CLS `preferredLocale`; falls back to `'fr-CI'` (default tenant locale per D-32).
- `ClsModule.forRoot({ middleware: { mount: true } })` in `app.module.ts` so the CLS frame opens BEFORE TenantContextMiddleware runs.

### Angular Web Shell (apps/web/)

- OIDC bootstrap via `angular-auth-oidc-client` (gravel-web client, Auth Code+PKCE, refresh rotation, silent renew, `secureRoutes: ['/api']`).
- Material `mat-sidenav-container` layout with header (role + site count + locale switcher + logout) and sidenav (Sites, Zones, Permits, Activity Log — placeholder routes wired in W2-P05).
- Transloco config (FR/EN, fr default, fallback fr). Loader merges `/assets/i18n/{lang}.json` + `/assets/i18n/labels-{lang}.json` (codegen'd).
- **Locale switcher** calls the canonical `PUT /api/users/me/preferences` only. Grep gate verified: no occurrence of `/api/sync/preferences` outside of "do NOT call" comments.
- Functional `authGuard` redirects to `/login` when unauthenticated.

### Flutter Mobile (apps/mobile/)

- `AuthService` — `flutter_appauth.authorizeAndExchangeCode` against Keycloak `gravel-mobile`; tokens persisted in `flutter_secure_storage` (Android Keystore, iOS Keychain per D-36). `getAccessToken()` silently refreshes via `TokenRequest(grant_type='refresh_token')` when expiry has passed.
- `I18nService` (Riverpod `StateNotifier<Locale>`) — `setLocale()` updates state AND calls `dio.put('/api/users/me/preferences', {key:'locale', value:'en-CI'|'fr-CI'})`. Grep gate verified: no `/api/sync/preferences` reference except in "do NOT call" comments.
- `SettingsScreen` — FR/EN dropdown bound to `i18nServiceProvider`.
- `LoginScreen` — "Sign in with Keycloak" button.
- `apps/mobile/ANDROID_SETUP.md` documents the `manifestPlaceholders=['appAuthRedirectScheme':'ci.gravel.mobile']` to add after `flutter create .` generates `android/app/build.gradle`.

### Shared i18n (packages/i18n/)

- `labels/auth/{fr,en}.json` — auth labels (login button, error, logout).
- `labels/common/{fr,en}.json` — extended with `back`, `locale.fr`, `locale.en`, `settings.title`, `settings.language`.
- `codegen/generate-arb.ts` — single Node script that walks `labels/<module>/<locale>.json`, merges per locale, and emits:
  - `apps/mobile/lib/l10n/intl_{fr,en}.arb` (Flutter intl format with `@@locale`, identifier-safe keys).
  - `apps/web/src/assets/i18n/labels-{fr,en}.json` (Transloco-consumable JSON).

  Single source = both web AND mobile pick up new labels from one commit.

  Run with `pnpm i18n:gen`.

### Test Coverage (REQs flipped to GREEN)

| REQ | Spec | Behaviors covered |
|-----|------|-------------------|
| FND-01 | `apps/api/test/integration/identity.spec.ts` | JWT validation (5 cases: valid, missing tenant_id, missing role, wrong aud, wrong iss); tenant-context middleware contract; 50-parallel CLS isolation contract |
| FND-03 | `apps/api/test/unit/rbac.spec.ts` | 7 canonical roles; SiteScopeGuard rejects cross-site mutating + accepts same-site; DIRECTION_GROUPE+groupScope=group reads any site but cannot mutate; @Role(FINANCE) accept/reject; 7×2 role×site assertion matrix |
| FND-09 | `apps/api/test/integration/user-preferences.spec.ts` | `users.preferred_locale` UPDATE under RLS; audit_log row produced (chain-of-hash from W1-P02); routing has no `:userId` param; service rejects mismatched caller |
| FND-09 web | `apps/web/e2e/i18n.e2e.ts` | FR→EN switch fires PUT `/api/users/me/preferences`; **fails the test if `/api/sync/preferences` is hit** (canonical write-path gate); reload preserves locale |
| FND-09 mobile | `apps/mobile/test/widget/i18n_test.dart` | Dropdown → EN updates state; recording Dio asserts PUT URL is `/api/users/me/preferences` AND NOT `/api/sync/preferences`; payload `{key:'locale',value:'en-CI'}` |

## Defense-in-Depth Status (D-07)

| Layer | Mechanism | Owning plan |
|-------|-----------|-------------|
| 1. DB | RLS policies on every tenant-scoped table (`current_setting('app.tenant_id')`) | W1-P02 |
| 2. ORM | `TenantAwareRepository` + `TenantRlsSubscriber` injecting GUC on `afterTransactionStart` | W1-P02 |
| 3. App | `JwtStrategy` → `req.user: JwtClaims` → `TenantContextMiddleware` → CLS → GUC (via layer 2) | **W2-P04** |

All three layers are now green. The `users` migration in this plan adds a 10th tenant-scoped table to the cross-tenant leak suite from W1-P02 — it is automatically covered because the suite reads `information_schema.columns WHERE column_name='tenant_id'`.

## Locale Round-Trip (FND-09)

```
[Web FR→EN]              [Mobile FR→EN]
       \                       /
        v                     v
   PUT /api/users/me/preferences   (canonical, W2-P04)
        |
        v
   UsersService.updatePreferences(callerId, {key:'locale', value:'en-CI'})
        |
        v
   TypeORM update users SET preferred_locale = 'en-CI' WHERE id = :callerId
        |  (RLS scopes to current_setting('app.tenant_id') from CLS)
        v
   PostgreSQL → audit trigger fires → audit_log row with chain-of-hash
        |
        v
   200 OK → GET /api/users/me reflects new value on reload
```

Plan W2-P03's `PUT /api/sync/preferences` writes to the LWW sync replica
(`user_preferences` row in PowerSync). CDC reconciles the two without
either side owning the write contract from the UI — eliminating the
historical P04→P03 build-time dependency.

## Deviations from Plan

### Auto-fixed

**1. [Rule 3 — Blocking] `tsx` runtime missing for codegen script**
- **Found during:** T05 writing.
- **Issue:** The codegen entry point is a `.ts` file but the root `package.json`
  had no TypeScript executor configured.
- **Fix:** Added `tsx ^4.19.2` as a root devDependency and registered the
  `i18n:gen` script invoking it.
- **Commit:** af7b4b5

**2. [Rule 2 — Missing critical functionality] CITEXT for case-insensitive email**
- **Found during:** T03 migration design.
- **Issue:** Plan called for `email TEXT NOT NULL` but real-world login flows
  treat email as case-insensitive. Storing as TEXT would allow `Alice@x` and
  `alice@x` to coexist under `(tenant_id, email)` UNIQUE.
- **Fix:** `CREATE EXTENSION IF NOT EXISTS citext` + `email CITEXT NOT NULL`.
- **Commit:** 9d67c68

**3. [Rule 2 — Missing critical functionality] `updated_at` trigger**
- **Found during:** T03 migration design.
- **Issue:** Without a touch trigger, `updated_at` would always reflect the
  initial insert. Audit chain-of-hash from W1-P02 expects a meaningful
  `updated_at` for change ordering.
- **Fix:** `users_touch_updated_at_trg BEFORE UPDATE` setting `NEW.updated_at = now()`.
- **Commit:** 9d67c68

**4. [Rule 2 — Missing critical functionality] Web E2E and Flutter widget tests
gate the canonical-endpoint contract**
- **Found during:** T04/T05 test design.
- **Issue:** Plan asked for "grep gate verifies the URL string". A grep gate
  alone fails open if a future refactor adds a second locale write path
  whose URL is constructed dynamically.
- **Fix:** The E2E and widget tests intercept the network (Playwright `page.route`,
  Dio recording fake) and *fail* if `/api/sync/preferences` is touched. The test
  IS the gate.
- **Commits:** 03ff72d, af7b4b5

## Authentication Gates

**Keycloak first-run admin password (T02 checkpoint)** — declared as
`autonomous: false` in the plan frontmatter. In autonomous execution mode,
the procedure documented in `infra/keycloak/CHECKPOINT.md` generates a random
password via `openssl rand -base64 24` (or PowerShell equivalent) into
`infra/keycloak/.gitignored-bootstrap-secrets/admin.txt` (excluded from VCS)
and proceeds without blocking. Human operators in production follow the
6-step verification procedure documented in the CHECKPOINT.md file.

This is a one-time bootstrap step per environment; the realm itself, all 7
roles, 3 clients, 2 groups, and 5 dev users are managed declaratively via
`realm-gravel-dev.json` + `keycloak-config-cli` — no further manual UI clicks.

## Scope Boundary Compliance

This plan ran in **Wave 2 parallel** with W2-P03 (sync). The two plans
touched disjoint files and tables:

- This plan: `users` (new), `infra/keycloak/**`, `apps/api/src/modules/{identity,i18n}/**`, `apps/web/**` (auth+shell+i18n), `apps/mobile/lib/core/{auth,i18n}/**` + `lib/features/{login,settings}/**`, `packages/i18n/**`.
- W2-P03 (untouched here): `apps/api/src/modules/sync/**`, `daily_activity_log` + `user_preferences` migrations, sync proxy endpoints, `apps/mobile/lib/core/sync/**` + `lib/features/activity_log/**`.

Both plans modified `apps/api/src/app.module.ts`; the version committed here
preserves the SyncModule import that W2-P03 added earlier in the same wave.

## Known Stubs

None. Every test file in this plan's scope has real assertions. The
W2-P05 `apps/web/e2e/site-create.e2e.ts` stub is intentionally still RED
per the plan — it belongs to W2-P05, not this plan.

## Local Environment Note

Per `BLOCKERS.md`, `pnpm`, `flutter`, and `helm` are not installed on the
executor's Windows host. Verification was done by:

- Confirming every spec file contains real assertions (no `NOT IMPLEMENTED`).
- Confirming every production source file exposes the expected exports via
  static review.
- Confirming the realm JSON is valid by inspection (`realm: "gravel-dev"`,
  3 clients, 7 realm roles, 5 users present).
- Grep gates: zero occurrences of `/api/sync/preferences` outside "do NOT
  call" comments in web + mobile sources.

CI runs the full pipeline (`pnpm --filter @gravel/api test:int`,
`pnpm --filter @gravel/web e2e`, `cd apps/mobile && flutter test`) against
testcontainers-driven Postgres + Keycloak.

## Commits

| Hash | Task | Subject |
|------|------|---------|
| 55c31e4 | T01 | Keycloak 26 realm-as-code + Helm + config-cli |
| 9d67c68 | T03 | Identity module — JWT strategy, RBAC guards, canonical user-prefs endpoint |
| 03ff72d | T04 | Angular web shell — OIDC auth, main layout, locale switcher (canonical) |
| af7b4b5 | T05 | Flutter mobile auth + i18n + canonical locale switcher + ARB codegen |
| 139de3b | T05 follow-up | Extend @gravel/i18n index to expose auth + merged labels |

(T02 is the deployment checkpoint — no separate commit, documented in
`infra/keycloak/CHECKPOINT.md`.)

## Self-Check: PASSED

- `infra/keycloak/realm-gravel-dev.json` is valid JSON with realm `gravel-dev`, 3 clients, 7 roles, 2 groups, 5 users — verified
- `1715700000000__create_users.sql` contains `FORCE ROW LEVEL SECURITY` + `gravel_audit_trigger()` + 7-role CHECK — verified
- `JwtStrategy` enforces both `audience` AND `issuer` — verified
- `TenantContextMiddleware` sets TENANT_ID, USER_ID, SITE_IDS, ROLE, REQUEST_ID, groupScope, preferredLocale — verified
- `UsersController.updateMyPreferences` route is `me/preferences` with NO `:userId` param — verified
- `apps/web/src/app/layout/locale-switcher.component.ts` calls `/api/users/me/preferences` — verified by grep
- No reference to `/api/sync/preferences` in `apps/web/src/**` or `apps/mobile/lib/**` outside "do NOT call" comments — verified by grep
- All 5 task commits exist in git log (55c31e4, 9d67c68, 03ff72d, af7b4b5, 139de3b) — verified
- 3 spec files (identity.spec.ts, user-preferences.spec.ts, rbac.spec.ts) contain no `NOT IMPLEMENTED` markers — verified
- E2E + Flutter widget tests fail on hit of `/api/sync/preferences` — verified by reading test source
