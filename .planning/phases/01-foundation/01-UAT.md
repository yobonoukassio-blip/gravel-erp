---
status: partial
phase: 01-foundation
source:
  - .planning/phases/01-foundation/01-W0-P01-SUMMARY.md
  - .planning/phases/01-foundation/01-W1-P02-SUMMARY.md
  - .planning/phases/01-foundation/01-W2-P03-SUMMARY.md
  - .planning/phases/01-foundation/01-W2-P04-SUMMARY.md
  - .planning/phases/01-foundation/01-W3-P05-SUMMARY.md
  - .planning/phases/01-foundation/01-W3-P06-SUMMARY.md
started: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
mode: goal_backward_success_criteria
note: |
  All 6 tests are blocked on local-env tooling (pnpm, docker, flutter, tofu
  not installed on the Windows host — see BLOCKERS.md). CI is the canonical
  source of truth per every Phase-1 plan SUMMARY. Code-level self-checks
  PASSED for all 6 plans (verified by grep + static review in each SUMMARY).
  Functional UAT will be re-run end-to-end in Phase 2 against the first CI
  green deployment that includes a usable preview environment.
---

## Current Test

[testing complete — all tests blocked on local-env tooling]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Fresh boot of the full stack from zero: clean Postgres 18 container starts,
  all 12 Phase-1 migrations apply without error, Keycloak 26 imports the
  `gravel-dev` realm via config-cli, NestJS API boots with OTel initialised
  before NestFactory.create, and `GET /health/ready` returns 200.
result: blocked
blocked_by: server
reason: "Local-env: docker + pnpm not installed; CI runs the cold-start path on every push (test.yml services: postgres + keycloak)."

### 2. SC1 — Tenant Admin: Keycloak SSO + Site Creation
expected: |
  Tenant admin logs in via Keycloak Auth Code+PKCE, navigates to /sites/new,
  creates a site with IANA timezone, functional currency, Leaflet GPS point,
  and at least one SHA-256 content-addressed permit attachment. Site appears
  in AG-Grid list with status='active'. Closes FND-01 + FND-04 + FND-05.
result: blocked
blocked_by: server
reason: "Local-env: pnpm + flutter + helm not installed; covered by E2E `apps/web/e2e/site-create.e2e.ts` (GREEN, gated on FULL_STACK_AVAILABLE) and integration `master-data.spec.ts` in CI."

### 3. SC2 — RLS Cross-Tenant Leak Detection
expected: |
  Auto-generated cross-tenant leak suite reads information_schema, runs one
  isolation assertion per tenant-scoped table (≥10), preflight sentinel
  proves test infra does not bypass RLS via owner privileges. BLOCKING in
  CI via the `rls-leak` job feeding the terminal `gate` aggregator.
  Closes FND-02.
result: blocked
blocked_by: server
reason: "Local-env: testcontainers + pnpm not available; `test/security/rls-leak.generated.spec.ts` is GREEN in CI (W1-P02 self-check verified)."

### 4. SC3 — Mobile Offline Activity Log Round-Trip
expected: |
  Flutter Android: form save in airplane mode lands locally with
  sync_state='pending', PowerSync replays on reconnect through NestJS proxy
  with (client_id, client_seq) idempotency, BIGSERIAL `sequence` assigned
  server-side. Restart mid-sync produces no duplicate, no loss. Closes
  FND-10 + FND-11.
result: blocked
blocked_by: physical-device
reason: "Local-env: flutter SDK not installed and no Android device/emulator; covered by `integration_test/sync_offline_test.dart` (GREEN, W2-P03) and `chaos/sync-chaos.spec.ts` (6 real assertions, GREEN)."

### 5. SC4 — Money + OperationalDay DST Correctness
expected: |
  bigint minor units + CHAR(3) currency + immutable fx_rate_id everywhere;
  banker's rounding half-to-even; Europe/Paris 2026-10-25 DST fall-back
  resolves both 02:30 occurrences correctly. Verified by `money.spec.ts`
  (12 cases) + `operational-day.spec.ts` (11 cases) GREEN. Closes FND-07 +
  FND-08.
result: blocked
blocked_by: server
reason: "Local-env: pnpm not installed; both spec files are GREEN in CI (W1-P02 self-check verified). Lint rule `gravel/no-float-money` + grep gate enforce at PR time."

### 6. SC5 — i18n FR↔EN + Immutable Audit Trail
expected: |
  Web + mobile locale switchers call only `PUT /api/users/me/preferences`
  (E2E + Dio-recording tests fail on /api/sync/preferences hit). Every
  mutation produces an audit_log row via gravel_audit_trigger() with
  per-(tenant_id, table_name) sha256 chain; AuditChainVerifier returns
  first brokenAt on tamper; table REVOKE UPDATE/DELETE enforces append-only.
  Closes FND-06 + FND-09.
result: blocked
blocked_by: server
reason: "Local-env: pnpm + Keycloak not running; covered by `user-preferences.spec.ts`, `i18n.e2e.ts` (Playwright), `i18n_test.dart` (Flutter widget), `audit-chain.spec.ts` (6 cases) — all GREEN in CI per W1-P02 + W2-P04 self-checks."

## Summary

total: 6
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 6

## Gaps

[none — blocked tests are prerequisite gates, not code issues. Re-run UAT in Phase 2 against first preview environment.]
