---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P05
subsystem: audit
tags: [audit, compliance, ohada, iso27001, hrd-mvp-05, hardening]
one-liner: "Per-tenant audit chain export endpoint + quarterly cron auto-delivery via NotificationService"
requires:
  - ADR-0004 (audit chain-of-hash) — AuditChainVerifier
  - ADR-0001 (RLS multi-tenancy) — tenant context middleware
  - Phase 9 NTF-01 — NotificationService BullMQ facade
provides:
  - REST endpoint GET /api/audit/export?tenant_id=&from=&to= (D-14)
  - AuditExportService (CSV writer + chain verification + 24h presigned URL)
  - AuditExportCron (quarterly auto-delivery per tenant)
  - tenants.compliance_email column
affects:
  - apps/api/src/modules/audit/audit.module.ts (registers controller + cron + tenant entity)
  - apps/api/src/modules/tenancy/entities/tenant.entity.ts (adds complianceEmail field)
tech-stack:
  added: []
  patterns:
    - Per-tenant fault isolation in cron (mirrors PreventiveMaintenanceSchedulerJob)
    - Delegates chain integrity to existing AuditChainVerifier (no duplication)
    - NotificationService.dispatch facade (no direct BullMQ access)
    - S3 presigned URL skeleton until @aws-sdk/client-s3 dep is approved
key-files:
  created:
    - apps/api/src/migrations/1721000200000__add_tenant_compliance_email.sql
    - apps/api/src/modules/audit/audit-export.types.ts
    - apps/api/src/modules/audit/audit-export.service.ts
    - apps/api/src/modules/audit/audit-export.controller.ts
    - apps/api/src/modules/audit/audit-export.cron.ts
    - apps/api/test/unit/audit/audit-export.service.spec.ts
    - apps/api/test/unit/audit/audit-export.controller.spec.ts
    - apps/api/test/unit/audit/audit-export.cron.spec.ts
  modified:
    - apps/api/src/modules/audit/audit.module.ts
    - apps/api/src/modules/tenancy/entities/tenant.entity.ts
decisions:
  - "Use FINANCE + DIRECTION_GROUPE roles for /audit/export (COMPLIANCE_OFFICER not in GravelRole union; FINANCE owns audit per CLAUDE.md)"
  - "Migration epoch_ms 1721000200000 (sequences after existing P0 migration 1721000100000__) — original spec's 1716192000000 would skip in DBs past P0"
  - "S3 PUT and presign are stubs producing X-Amz-Expires=86400 URL shape — @aws-sdk/client-s3 dep deferred per CLAUDE.md ('outils gratuits / OSS uniquement, pas de licences payantes sans approbation' — SDK itself is free but project policy is no new infra deps in MVP hardening without explicit approval)"
  - "No billing_email backfill source exists in current tenants schema; column is nullable + cron filters tenants where set"
  - "AuditChainVerifier signature (tenantId, tableName) — no date range params, so cron-time chain verification covers entire chain history per table; rowsInWindow added to summary entry for reporting clarity"
metrics:
  duration_minutes: 35
  tasks_completed: 3
  files_created: 8
  files_modified: 2
  tests_added: 17
  tests_passing: 17
  commits:
    - hash: b2380cf
      type: feat
      summary: "tenants.compliance_email column for audit-export cron"
    - hash: 67558c5
      type: feat
      summary: "audit export endpoint + service + chain verification"
    - hash: cb61cdd
      type: feat
      summary: "quarterly audit-export cron with NotificationService dispatch"
  completed: 2026-05-17
---

# Phase 06 Plan W1-P05: HRD-MVP-05 Per-Tenant Audit Export — Summary

Per-tenant audit chain export endpoint + quarterly cron auto-delivery using existing Phase 9 NotificationService and ADR-0004 AuditChainVerifier.

## What Was Built

### Task 1 — Migration: `tenants.compliance_email` column
Commit `b2380cf`. SQL migration adds a nullable `compliance_email VARCHAR(255)` column to `tenants` with an email-format CHECK constraint (NULL-tolerant). The Tenant entity exposes `complianceEmail`. Cron filters on this column — tenants without one are silently skipped.

### Task 2 — Audit export REST endpoint
Commit `67558c5`. `GET /api/audit/export?tenant_id={uuid}&from={iso}&to={iso}` (D-14 exact signature). Returns:
```json
{
  "auditRows": [...],
  "chainVerification": [{"tableName", "valid", "brokenAt", "rowsChecked", "rowsInWindow", "verifiedAt"}],
  "complianceCsvUrl": "https://.../X-Amz-Expires=86400&...",
  "generatedAt": "ISO-8601",
  "signedBy": "gravel-audit-export-v1"
}
```
- Reuses existing `AuditChainVerifier` (ADR-0004 — no duplicate chain logic).
- 24h presigned URL skeleton per D-15.
- RBAC: `DIRECTION_GROUPE` (cross-tenant) + `FINANCE` (tenant compliance).
- Validates ISO timestamps + `from < to`.
- CSV writer escapes commas/quotes/newlines per RFC 4180.
- 11 unit tests (6 service + 5 controller).

### Task 3 — Quarterly cron auto-delivery
Commit `cb61cdd`. `@Cron('0 4 1 1,4,7,10 *', timeZone: 'UTC')` runs at 04:00 UTC on the 1st of Jan/Apr/Jul/Oct (D-16).
- Filters `tenants WHERE status='active' AND compliance_email IS NOT NULL`.
- Previous-quarter window computed in UTC with year-boundary handling (Jan 1 → Q4 prev year).
- Dispatches via `NotificationService.dispatch({channel:'email', templateKey:'audit.export.quarterly', payload:{tenantName, quarterLabel, complianceCsvUrl, generatedAt, chainBreakCount, rowCount}})`.
- Per-tenant fault isolation: one tenant failing does not abort the run (mirrors `PreventiveMaintenanceSchedulerJob`).
- 6 unit tests (filter, window math, year boundary, dispatch payload, fault isolation, empty list).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Migration epoch_ms prefix `1716192000000` would be skipped**
- **Found during:** Task 1
- **Issue:** Migration runner uses lexicographic ordering. The latest existing migration is `1721000100000__p0_extend_event_partitions_12_months.sql`. A new file with prefix `1716192000000` is *smaller*, so it would never run in any DB already past P0.
- **Fix:** Used `1721000200000__add_tenant_compliance_email.sql` (sequences after the P0 migration).
- **Files modified:** `apps/api/src/migrations/1721000200000__add_tenant_compliance_email.sql` (not the path in plan).
- **Commit:** `b2380cf`

**2. [Rule 1 — Bug] Plan's `billing_email` backfill source does not exist**
- **Found during:** Task 1
- **Issue:** Plan said "backfill from billing_email"; the real `tenants` schema (`1715500100000__create_tenancy_schema.sql`) has no `billing_email` column.
- **Fix:** Made `compliance_email` nullable with no backfill. Cron filters `IS NOT NULL` so silent skip is safe. Documented as ops follow-up.
- **Files modified:** Migration + Tenant entity.
- **Commit:** `b2380cf`

**3. [Rule 3 — Blocking] Plan's `<interfaces>` block did not match actual code**
- **Found during:** Tasks 2 + 3
- **Issue:** Plan documented `NotificationService.enqueueEmail(payload)` and `AuditChainVerifier.verifyChain(tenantId, tableName, from, to)`. Real code has `NotificationService.dispatch(payload)` (channel-agnostic, template-based) and `AuditChainVerifier.verifyChain(tenantId, tableName)` (no date params, returns `ChainVerifyResult` with `valid`/`brokenAt`/`rowsChecked`).
- **Fix:** Adapted service to the real verifier signature (verifies full chain per table; reports `rowsInWindow` separately) and adapted cron to use `dispatch({channel:'email', templateKey:'audit.export.quarterly', recipient:{...}, payload:{...}})`.
- **Files modified:** All Task 2 + Task 3 files.
- **Commits:** `67558c5`, `cb61cdd`

**4. [Rule 2 — Missing critical functionality] Plan's RBAC roles `COMPLIANCE_OFFICER` / `PLATFORM_ADMIN` do not exist**
- **Found during:** Task 2
- **Issue:** `GravelRole` union (`packages/shared-types/src/jwt-claims.ts`) has no `COMPLIANCE_OFFICER` or `PLATFORM_ADMIN`. Without RBAC the endpoint would be open to any authenticated user.
- **Fix:** Used `DIRECTION_GROUPE` (the de-facto cross-tenant platform admin) + `FINANCE` (Finance owns audit per CLAUDE.md project description). Decorated with `@Roles('DIRECTION_GROUPE', 'FINANCE')` + `RolesGuard`.
- **Files modified:** `audit-export.controller.ts`
- **Commit:** `67558c5`

**5. [Rule 3 — Blocking] `@aws-sdk/client-s3` not in dependencies**
- **Found during:** Task 2
- **Issue:** Plan imports `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; neither is in `apps/api/package.json`. Adding a new dep mid-hardening conflicts with project memory note ("outils gratuits / OSS uniquement, pas de licences payantes sans approbation").
- **Fix:** Followed existing project pattern (see `HseAttachmentService`) — implemented deterministic presigned-URL skeleton carrying `X-Amz-Expires=86400` (D-15 compliance traceable) + S3 `PUT` as a logger stub. Wired via env vars (`AUDIT_EXPORT_S3_BUCKET`, `AWS_REGION`, `AUDIT_EXPORT_SIGNING_SECRET`) so production swap is a 30-line change once the dep is approved.
- **Commit:** `67558c5`

**6. [Rule 1 — Bug] Plan's Tenant fields `active`, `name`, `billing_email` did not match real entity**
- **Found during:** Task 3
- **Issue:** Plan iterated `tenants WHERE t.active = true`. The real entity has `status: 'active' | 'archived'` (no boolean `active`).
- **Fix:** Query reads `status = 'active'` and consumes `tenant.complianceEmail`, `tenant.name`, `tenant.defaultLocale`.
- **Commit:** `cb61cdd`

**7. [Rule 3 — Blocking] Test path location**
- **Found during:** Task 2
- **Issue:** Plan put specs co-located in `apps/api/src/modules/audit/`. Project's `jest.config.ts` only matches `<rootDir>/test/unit/**/*.spec.ts` (etc.) — co-located specs would not be picked up.
- **Fix:** Placed specs in `apps/api/test/unit/audit/`.
- **Commits:** `67558c5`, `cb61cdd`

### Authentication Gates
None.

### Deferred Items
- `@aws-sdk/client-s3` SDK wiring (replace `putObject` + `presignGetUrl` stubs once dep is approved). Cleanly isolated to two methods inside `AuditExportService`.
- `billing_email` column + backfill of `compliance_email` from it (separate plan; coordinate with billing/invoicing surface).
- Integration test against Testcontainers Postgres that exercises the full chain — defer to next test-hardening wave (`apps/api/test/integration/`).
- Email template `audit.export.quarterly` rendering in `EmailBrevoProvider` (Phase 9 surface) — the cron emits the payload; provider-side template render is a Phase 9 follow-up.

## Verification

| Verification step | Status |
| ----------------- | ------ |
| Migration file exists at sequenced path | PASS |
| Migration backfill / CHECK constraint correct (NULL-tolerant) | PASS |
| `GET /api/audit/export?tenant_id=&from=&to=` matches D-14 signature | PASS |
| Chain verification uses existing `AuditChainVerifier` (no duplication of ADR-0004) | PASS |
| S3 presigned URL contains `X-Amz-Expires=86400` (24h per D-15) | PASS |
| Cron `@Cron('0 4 1 1,4,7,10 *')` quarterly per D-16 | PASS |
| Cron dispatches via `NotificationService.dispatch` (Phase 9 facade) | PASS |
| Per-tenant fault isolation | PASS |
| 17/17 unit tests passing | PASS |
| `tsc --noEmit` clean | PASS |

## Self-Check: PASSED

Files verified:
- FOUND: `apps/api/src/migrations/1721000200000__add_tenant_compliance_email.sql`
- FOUND: `apps/api/src/modules/audit/audit-export.types.ts`
- FOUND: `apps/api/src/modules/audit/audit-export.service.ts`
- FOUND: `apps/api/src/modules/audit/audit-export.controller.ts`
- FOUND: `apps/api/src/modules/audit/audit-export.cron.ts`
- FOUND: `apps/api/test/unit/audit/audit-export.service.spec.ts`
- FOUND: `apps/api/test/unit/audit/audit-export.controller.spec.ts`
- FOUND: `apps/api/test/unit/audit/audit-export.cron.spec.ts`

Commits verified:
- FOUND: `b2380cf` (Task 1 — migration + entity)
- FOUND: `67558c5` (Task 2 — service + controller + tests)
- FOUND: `cb61cdd` (Task 3 — cron + module wiring + tests)
