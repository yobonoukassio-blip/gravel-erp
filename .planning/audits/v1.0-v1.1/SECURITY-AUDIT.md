# Security Audit — Gravel Ivoire ERP v1.0-v1.1

**Date:** 2026-05-16
**Scope:** `apps/api/src/modules/`, `apps/api/src/common/`, `apps/web/src/app/core/`, committed seed/script files
**Auditor:** Static analysis — no running services

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 4 |
| MEDIUM | 3 |
| LOW | 2 |
| **Total** | **14** |

---

## Findings

### [CRITICAL] FINDING-001: Real Supabase credentials committed in `.env.example`

**Location:** `apps/api/.env.example` (committed to git at commit `6194c12` and HEAD), lines 13–15
**OWASP category:** A02 Cryptographic Failures / A05 Security Misconfiguration
**Description:**
The `.env.example` file — which is intentionally committed to source control as a template — contains the real, live `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for the production Supabase project `qrkfkfhzavqjorhrlluj`. The `SUPABASE_SERVICE_ROLE_KEY` is a fully privileged JWT that bypasses all Supabase Row-Level Security policies and grants admin-level database access to any holder.

**Exploit scenario:**
Any person with read access to the repository (CI/CD runners, future collaborators, any GitHub public fork) can decode the service-role JWT, derive the project ref, and use the Supabase REST API or `pg` driver to read, write, or delete all data across every tenant with no authentication barrier. The `anon_key` additionally allows unauthenticated reads on any table without RLS.

**Fix:**
1. IMMEDIATELY rotate both keys in the Supabase dashboard (Project Settings → API → Regenerate).
2. Replace the real values in `apps/api/.env.example` with obviously fake placeholders (e.g. `eyJhbGci...REPLACE_ME`).
3. Scan the full git history with `git log --all -p -- apps/api/.env.example` and remove the commit containing real values using `git filter-repo` or BFG Repo-Cleaner, then force-push.
4. Audit which systems or CI jobs used the exposed key and rotate any downstream secrets that were derived from it.

---

### [CRITICAL] FINDING-002: Hardcoded production DB password in committed seed script

**Location:** `apps/api/seed_alert_rules.mjs` line 5 (committed in `6194c12`)
**OWASP category:** A02 Cryptographic Failures
**Description:**
The committed file `apps/api/seed_alert_rules.mjs` hardcodes the literal Supabase Postgres password `Waliyatb123` inside the connection string `postgresql://postgres:Waliyatb123@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres`. This password grants direct superuser-level Postgres access, bypassing all application-level RLS and guards.

**Exploit scenario:**
Any repository reader can extract this connection string and connect directly to the production database via a standard `psql` or `pg` client — reading, writing or dropping any table. The 3-layer tenant isolation (RLS + CLS + TenantAwareRepository) is entirely circumvented because a direct Postgres superuser connection skips RLS.

**Fix:**
1. IMMEDIATELY rotate the Supabase database password (Supabase dashboard → Project Settings → Database → Reset database password).
2. Remove the literal password from `seed_alert_rules.mjs` — replace with `process.env.DATABASE_URL` pattern (as the proper scripts under `apps/api/scripts/` already do).
3. Use `git filter-repo` to expunge commit `6194c12`'s version of the file from history.
4. Update Railway/Vercel environment variables with the new password.

---

### [CRITICAL] FINDING-003: Production Angular app runs with `mockAuth: true` — no real JWT validation

**Location:** `apps/web/src/environments/environment.prod.ts` lines 9–19
**OWASP category:** A01 Broken Access Control / A07 Identification and Authentication Failures
**Description:**
The production Angular build (`environment.prod.ts`) sets `mockAuth: true`. This makes `AuthService` return a hardcoded `DEV_CLAIMS` object (`role: 'DIRECTION_GROUPE'`, fixed `tenantId`, fixed `siteIds`) for every session, completely bypassing OIDC/Keycloak authentication on the frontend. Every user who opens the production web app is treated as a DIRECTION_GROUPE director without any login.

**Exploit scenario:**
Any person who navigates to the production URL (`gravel-erp-web-sigma.vercel.app`) is immediately logged in as DIRECTION_GROUPE with full group-level access to all financial analytics, OHADA exports, consolidation data, and administrative screens. No credential is required. Combined with `DEV_BYPASS_JWT=true` on the backend (see FINDING-004), this creates a completely unauthenticated system end-to-end.

**Fix:**
```typescript
// environment.prod.ts
export const environment = {
  production: true,
  mockAuth: false,          // MUST be false
  keycloakUrl: 'https://your-real-keycloak.example.com',
  keycloakRealm: 'gravel-prod',
  ...
};
```
Keycloak (or Supabase Auth) must be fully configured before setting this. Do not deploy to production with `mockAuth: true`.

---

### [CRITICAL] FINDING-004: Backend `DEV_BYPASS_JWT=true` present in `.env` — deployed state unknown

**Location:** `apps/api/.env` line 24; `apps/api/src/common/guards/jwt-auth.guard.ts` lines 17–25, 48–51
**OWASP category:** A01 Broken Access Control / A07 Identification and Authentication Failures
**Description:**
The `JwtAuthGuard` and `TenantContextMiddleware` both check `process.env.DEV_BYPASS_JWT === 'true'` and, when true, inject a hardcoded `DEV_USER` (role `DIRECTION_GROUPE`, fixed tenant/site) without validating any JWT. The local `.env` has this set to `true`. If this variable is present in the Railway production environment (which is plausible given the comment on line 3 of `main.ts`: "TYPEORM_SYNCHRONIZE=true activé sur Railway"), every request to the production API is authenticated as the hardcoded superuser with no real identity validation.

**Exploit scenario:**
If `DEV_BYPASS_JWT=true` is set in Railway, any HTTP client can call any API endpoint with no `Authorization` header and receive a full `DIRECTION_GROUPE` response. All tenant data would be accessible without authentication.

**Fix:**
1. Verify Railway environment variables immediately — `DEV_BYPASS_JWT` must NOT be set (or must be `false`) in production.
2. Add a startup assertion in `main.ts`:
```typescript
if (process.env.NODE_ENV === 'production' && process.env.DEV_BYPASS_JWT === 'true') {
  throw new Error('FATAL: DEV_BYPASS_JWT must not be true in production');
}
```
3. Consider removing the bypass mechanism entirely and using a test fixture approach instead.

---

### [CRITICAL] FINDING-005: `SyncController` insert accepts client-controlled `tenantId` without JWT validation

**Location:** `apps/api/src/modules/sync/sync.controller.ts` lines 46–116
**OWASP category:** A01 Broken Access Control / A04 Insecure Design
**Description:**
The `POST /api/sync/activity-log` and `PUT /api/sync/preferences` endpoints accept `tenantId` as a field in the request body and insert it directly into the database via `QueryRunner.query()`. The JWT guard is globally applied (via `APP_GUARD`) so the user is authenticated, but the endpoint does NOT verify that `m.tenantId === req.user.tenantId`. A malicious authenticated user can submit mutations for any other tenant's UUID, bypassing the entire 3-layer tenant isolation model.

Furthermore, the `QueryRunner` is created directly (`this.ds.createQueryRunner()`) without going through a transaction, which means `TenantRlsSubscriber.afterTransactionStart()` IS called, but it sets the RLS GUC to the CLS tenant (from the JWT), while the actual `tenant_id` column value being inserted is the attacker-supplied value from the body. The RLS policy for INSERT would enforce `tenant_id = current_setting('app.tenant_id')`, so if RLS is correctly set up with `WITH CHECK`, it would block this — but that depends entirely on the migration's RLS policy for `daily_activity_log`.

**Exploit scenario:**
Authenticated user A (tenant T1) sends `POST /api/sync/activity-log` with `tenantId: "<T2-UUID>"`. If the INSERT-path RLS policy is missing or misconfigured, a row with `tenant_id = T2` is created under T1's authenticated session. This corrupts another tenant's data.

**Fix:**
Override `tenantId` from the JWT claims, not the body:
```typescript
// In pushActivityLog, replace m.tenantId with the JWT-derived value:
@Post('activity-log')
async pushActivityLog(
  @Body() body: { mutations: ActivityLogMutation[] },
  @Req() req: { user: JwtClaims },
): Promise<...> {
  const jwtTenantId = req.user.tenantId;
  // For each mutation, enforce tenantId = jwtTenantId:
  for (const m of mutations) {
    if (m.tenantId !== jwtTenantId) {
      throw new ForbiddenException('tenantId in body must match JWT tenant');
    }
    ...
  }
}
```
Same fix applies to `putPreference`.

---

### [HIGH] FINDING-006: Tir module controllers have no authentication or role guards

**Location:**
- `apps/api/src/modules/tir/controllers/blast-plan.controller.ts` — all endpoints (no `@UseGuards`)
- `apps/api/src/modules/tir/controllers/blast-report.controller.ts` — all endpoints
- `apps/api/src/modules/tir/controllers/detonator.controller.ts` — all endpoints
- `apps/api/src/modules/tir/controllers/explosives-ledger.controller.ts` — all endpoints

**OWASP category:** A01 Broken Access Control
**Description:**
All four blast/explosives controllers have no `@UseGuards(...)` decorator and no `@Role(...)` decorator. While the global `APP_GUARD: JwtAuthGuard` applies JWT validation globally, none of these controllers enforce role-based access. Any authenticated user (even a `OPERATOR` role with no explosives authorization) can approve blast plans (`POST /blast-plans/:id/approve-hse`), issue zone clearances, or fire detonators. Explosives management is one of the highest-risk surfaces in the application.

Furthermore, several endpoints accept `tenantId` from the request body (e.g. `body.tenantId` in `approveHse`, `requestFire`, `issueClearance`) rather than extracting it from the JWT — creating the same tenant-injection risk as FINDING-005.

**Exploit scenario:**
An authenticated operator with any role calls `POST /blast-plans/:id/approve-hse` with a crafted body and bypasses the HSE approval workflow. An attacker could fire detonators, issue clearances, or corrupt the explosives ledger without being an authorized HSE officer or blast supervisor.

**Fix:**
Add `@UseGuards(JwtAuthGuard, TenantGuard, RoleGuard)` plus `@Role('HSE', 'TIR_SUPERVISOR', 'CHEF_CARRIERE')` (as appropriate per endpoint). Replace all `body.tenantId` parameters with `req.user.tenantId` extracted from the JWT.

---

### [HIGH] FINDING-007: HSE, Alerts, and multiple other controllers missing explicit `@UseGuards`

**Location:**
- `apps/api/src/modules/hse/controllers/hse-incident.controller.ts` (no `@UseGuards`)
- `apps/api/src/modules/hse/controllers/corrective-action.controller.ts` (no `@UseGuards`)
- `apps/api/src/modules/alerts/alerts.controller.ts` (no `@UseGuards`)
- `apps/api/src/modules/transport/controllers/truck-rotation.controller.ts` (no `@UseGuards`)
- `apps/api/src/modules/maintenance/controllers/maintenance.controller.ts` (no `@UseGuards`)
- `apps/api/src/modules/iot/controllers/iot.controller.ts` (no `@UseGuards`)
- `apps/api/src/modules/ventes/controllers/ventes.controller.ts` (no `@UseGuards`)
- `apps/api/src/modules/fuel/controllers/fuel.controller.ts` (no `@UseGuards`)

**OWASP category:** A01 Broken Access Control
**Description:**
These controllers rely solely on the global `APP_GUARD: JwtAuthGuard` for authentication and the global `APP_GUARD: RoleGuard` for role enforcement. However, the global `RoleGuard` from `identity.module.ts` passes through (returns `true`) when no `@Role(...)` metadata is set on the route (see `role.decorator.ts` line 27: `if (!required || required.length === 0) return true`). This means all these controllers accept any authenticated JWT regardless of role.

An authenticated employee with role `OPERATOR` can:
- Close HSE incidents and CAPAs
- Acknowledge and resolve alerts
- Sign BLs and generate invoices
- Complete truck rotations
- Append IoT sensor readings for any site
- Access financial analytics endpoints if they were not separately protected

**Fix:**
Add explicit `@UseGuards(JwtAuthGuard, TenantGuard, RoleGuard)` with `@Role(...)` restricting to appropriate roles for each controller. For safety-critical endpoints (HSE close, BL sign, explosives), also add `@SiteParam()` and `SiteScopeGuard`.

---

### [HIGH] FINDING-008: PostgreSQL array injection via unvalidated string interpolation in HSE incident insert

**Location:** `apps/api/src/modules/hse/services/hse-incident.service.ts` lines 139, 142
**OWASP category:** A03 Injection
**Description:**
The `create()` method builds PostgreSQL `text[]` array literals via string interpolation:
```typescript
equipmentIds.length > 0 ? `{${equipmentIds.map((id) => `"${id}"`).join(',')}}` : '{}'
attachments.length > 0 ? `{${attachments.map((h) => `"${h}"`).join(',')}}` : '{}'
```
The `equipmentIds` and `contentAddressedAttachments` arrays come from `dto.equipment_impacted_ids` and `dto.content_addressed_attachments` in the HTTP request body. The `assertInvariants()` method (lines 276–289) does NOT validate these fields — it only checks `severity` and `chronologyMd`. If any string in these arrays contains `"` (double-quote), `}`, or `\`, it will corrupt the array literal and may produce unexpected SQL behavior or cause parsing errors.

**Exploit scenario:**
An authenticated user sends `equipment_impacted_ids: ["foo\",{},\"bar"]`. The constructed literal becomes `{"foo",{},\"bar"}` which is malformed. Depending on Postgres version and error handling, this could cause a 500 response leaking stack trace, or in edge cases with nested array syntax, produce unintended query structure. The risk is currently low-severity injection (not classic SQL injection since it goes through `em.query()` with parameterized binding) but is a correctness and stability risk.

**Fix:**
Validate each element of both arrays before use. For `equipmentImpactedIds`, validate UUID format. For `contentAddressedAttachments`, validate 64-char hex (SHA-256):
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
for (const id of equipmentIds) {
  if (!UUID_RE.test(id)) throw new BadRequestException(`Invalid equipment ID: ${id}`);
}
for (const h of attachments) {
  if (!SHA256_RE.test(h)) throw new BadRequestException(`Invalid attachment hash: ${h}`);
}
```
Then pass arrays as proper parameterized Postgres arrays: `$14::uuid[]` rather than manual string construction.

---

### [HIGH] FINDING-009: `TypeORM synchronize=true` enabled in non-production environments — risk of accidental schema destruction

**Location:** `apps/api/src/app.module.ts` lines 52–55; `apps/api/src/main.ts` line 3 comment
**OWASP category:** A05 Security Misconfiguration
**Description:**
The TypeORM configuration enables `synchronize: true` whenever `NODE_ENV !== 'production'` OR when `TYPEORM_SYNCHRONIZE=true` is explicitly set. The main.ts comment ("TYPEORM_SYNCHRONIZE=true activé sur Railway") indicates this was deliberately enabled on the Railway production-adjacent environment. `synchronize: true` drops and recreates tables to match entity definitions — any entity schema change can silently destroy production data.

**Exploit scenario:**
A developer changes an entity column definition, pushes, and Railway restarts the API with `TYPEORM_SYNCHRONIZE=true`. TypeORM drops the column (and its data) to match the entity. On a multi-tenant database with thousands of rows of operational ERP data (BLs, invoices, explosives ledger), this is catastrophic data loss.

**Fix:**
Remove the `TYPEORM_SYNCHRONIZE` env variable from Railway immediately. Remove the `cfg.get('NODE_ENV') !== 'production'` fallback — never auto-synchronize based on environment:
```typescript
synchronize: cfg.get('TYPEORM_SYNCHRONIZE') === 'true', // only explicit opt-in, never in prod
```
Add a startup assertion:
```typescript
if (cfg.get('NODE_ENV') === 'production' && cfg.get('TYPEORM_SYNCHRONIZE') === 'true') {
  throw new Error('FATAL: TYPEORM_SYNCHRONIZE must not be true in production');
}
```

---

### [MEDIUM] FINDING-010: No HTTP security headers (Helmet) configured

**Location:** `apps/api/src/main.ts` — no `app.use(helmet())` call; `package.json` — `helmet` not in dependencies
**OWASP category:** A05 Security Misconfiguration
**Description:**
The NestJS API does not configure any HTTP security headers. Standard defensive headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Referrer-Policy`) are absent. This is especially relevant for any browser-accessible API endpoint or the health endpoint which is marked `@Public()`.

**Fix:**
```bash
npm install helmet
```
```typescript
// main.ts
import helmet from 'helmet';
app.use(helmet());
```

---

### [MEDIUM] FINDING-011: No rate limiting on any endpoint — auth, sync, or financial

**Location:** `apps/api/src/main.ts`, `apps/api/package.json` — no `@nestjs/throttler` or equivalent
**OWASP category:** A04 Insecure Design
**Description:**
No rate limiting is implemented on any endpoint. The sync endpoint (`POST /api/sync/activity-log`) accepts batches of up to 200 mutations per request with no throttle, the HSE incident creation endpoint has no write limit, and the financial analytics endpoints (consolidation, OHADA export) have no query rate limiting. An authenticated attacker or runaway mobile client could flood the database with garbage data or cause DoS via expensive analytics aggregations.

**Fix:**
```bash
npm install @nestjs/throttler
```
Apply globally in `AppModule` with specific overrides for bulk endpoints:
```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])
// On sync bulk endpoint:
@Throttle({ default: { ttl: 60000, limit: 10 } })
```

---

### [MEDIUM] FINDING-012: `ssl: { rejectUnauthorized: false }` disables TLS certificate validation on DB connection

**Location:** `apps/api/src/app.module.ts` line 57
**OWASP category:** A02 Cryptographic Failures
**Description:**
The TypeORM database connection is configured with `ssl: { rejectUnauthorized: false }`, which accepts any TLS certificate for the Supabase/Postgres connection — including self-signed or invalid certs. This makes the connection vulnerable to man-in-the-middle attacks between the Railway API server and Supabase. Similarly, the committed script `apps/api/scripts/verify-supabase-password.mjs` (line 20) sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` globally, disabling TLS verification for all Node.js connections in that process.

**Fix:**
For the TypeORM connection, use the Supabase CA certificate instead of disabling verification:
```typescript
ssl: process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
  : { rejectUnauthorized: false }
```
Remove the `NODE_TLS_REJECT_UNAUTHORIZED = '0'` line from `verify-supabase-password.mjs`.

---

### [LOW] FINDING-013: `X-Request-ID` header accepted from client without length validation

**Location:** `apps/api/src/common/middleware/tenant-context.middleware.ts` lines 52–55
**OWASP category:** A03 Injection
**Description:**
The middleware accepts the `x-request-id` header value from any client request and stores it in CLS, which is then likely included in log entries and traces. There is no length limit or format validation — a client could send a very long string or a log-injection string (e.g. containing newlines for log forging). This is a low-severity concern since the value goes into CLS/logs, not SQL.

**Fix:**
```typescript
private requestId(req: Request): string {
  const hdr = req.headers['x-request-id'];
  if (typeof hdr === 'string' && hdr.length > 0 && hdr.length <= 128 && /^[\w\-]+$/.test(hdr)) {
    return hdr;
  }
  return randomUUID();
}
```

---

### [LOW] FINDING-014: HSE attachment upload URL — no content-type or file size enforcement at the API layer

**Location:** `apps/api/src/modules/hse/services/hse-attachment.service.ts` lines 65–91
**OWASP category:** A04 Insecure Design
**Description:**
The `requestUploadUrl()` method accepts any `contentType` string and any `sizeBytes` value from the caller without validation. While the production flow would use AWS presigned URLs (which can enforce `ContentType` via `PutObjectCommand`), the current implementation is a placeholder URL that includes no such enforcement. When the real S3 SDK is wired in, the accepted MIME types and maximum file size must be validated server-side before issuing the presigned URL to prevent abuse (e.g. uploading malware as `application/octet-stream` into the 7-year Object Lock retention bucket).

**Fix:**
```typescript
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
if (!ALLOWED_TYPES.has(input.contentType)) {
  throw new BadRequestException(`contentType ${input.contentType} not allowed`);
}
if (input.sizeBytes > MAX_SIZE_BYTES) {
  throw new BadRequestException('File exceeds 50 MB limit');
}
```

---

## Cross-Reference with Known Issues

The following items from existing VERIFICATION.md files were reviewed and not re-reported:
- OutboxModule import wiring (VERIFICATION Phase 2)
- BlSignedHandler wiring (VERIFICATION Phase 2)
- TirModule OperationalDayService stub (VERIFICATION Phase 2)

## Remediation Priority

| Priority | Findings | Action |
|----------|----------|--------|
| Immediate (today) | FINDING-001, FINDING-002 | Rotate all exposed credentials NOW |
| Before any prod traffic | FINDING-003, FINDING-004 | Disable mockAuth and DEV_BYPASS_JWT in prod |
| Before next deploy | FINDING-005, FINDING-006 | Fix tenant injection in sync, add explosives guards |
| Next sprint | FINDING-007, FINDING-008, FINDING-009 | Add role guards to all controllers, fix array injection, disable synchronize |
| Backlog | FINDING-010, FINDING-011, FINDING-012, FINDING-013, FINDING-014 | Helmet, rate limiting, TLS cert, request-ID, upload validation |
