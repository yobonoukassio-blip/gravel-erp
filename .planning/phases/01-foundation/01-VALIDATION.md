 03 / W1-P03-T01 (ConflictRegistry) + W1-P03-T03 (chaos harness) | 03 / W1-P03-T03 (offline integration_test) | 04 / W1-P04-T04 (web i18n e2e) + W1-P04-T05 (mobile widget) | 02 / W1-P02-T04 (OperationalDay + DST Europe/Paris) | 02 / W1-P02-T04 (money helpers + tests) | 02 / W1-P02-T03 (audit triggers + chain verifier) | 02 / W1-P02-T05 (schema) + 05 / W2-P05-T01 (API) + W2-P05-T02 (UI) | 05 / W2-P05-T03 (E2E site-create) | 04 / W1-P04-T03 (RBAC role+site) | 02 / W1-P02-T02 (RLS + auto-generated leak test) | 04 / W1-P04-T03 (api int) + W1-P04-T05 (mobile auth) |---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false  # flipped by execute-phase once Wave 0 stubs land
created: 2026-05-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework — Backend** | Jest 29.x (NestJS default) + Testcontainers (PostgreSQL 18 + Keycloak) |
| **Framework — Web** | Karma + Jasmine (Angular 20 default) ; Playwright E2E |
| **Framework — Mobile** | `flutter test` (unit + widget) ; `integration_test` for sync chaos |
| **Framework — Infra** | `tofu validate` + `tofu plan` (no apply in CI) ; `helm template` lint |
| **Config files** | `apps/api/jest.config.ts` · `apps/web/karma.conf.js` · `apps/mobile/test/` · `infra/.github/workflows/*` |
| **Quick run command** | `pnpm -w test:quick` (unit only, parallel) |
| **Full suite command** | `pnpm -w test:ci` (unit + integration + RLS-leak + chaos + DST) |
| **Estimated runtime** | quick ~45s · full ~8–12 min |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -w test:quick`
- **After every plan wave:** Run `pnpm -w test:ci` for the impacted package(s)
- **Before `/gsd:verify-work`:** Full suite must be green across api/web/mobile
- **Max feedback latency:** 45 s for unit tier ; 12 min for full integration tier

---

## Per-Task Verification Map

Tasks are not yet enumerated (planner produces them). The map below pre-allocates
verification commands per Phase-1 requirement so the planner can attach them.

| REQ-ID | Plan / Task ID | Behaviour to prove | Test type | Automated command | Wave 0 file |
|--------|----------------|-------------------|-----------|-------------------|-------------|
| FND-01 | SSO Keycloak OIDC + MFA optionnelle | integration | `pnpm --filter @gravel/api test:int -- identity.spec.ts` | `apps/api/test/integration/identity.spec.ts` (W0 stub) |
| FND-02 | RLS isolation cross-tenant sur **chaque table** | generated integration | `pnpm --filter @gravel/api test:rls-leak` | `apps/api/test/security/rls-leak.generated.spec.ts` (W0 generator) |
| FND-03 | Rôle (Direction Groupe/Directeur Site/Chef Carrière/Maintenance/HSE/Finance/Opérateur Terrain) scopé site | unit + integration | `pnpm --filter @gravel/api test -- rbac.spec.ts` | `apps/api/test/unit/rbac.spec.ts` (W0 stub) |
| FND-04 | Admin tenant crée site (timezone, devise, GPS, permis) | E2E web | `pnpm --filter @gravel/web e2e -- site-create.e2e.ts` | `apps/web/e2e/site-create.e2e.ts` (W0 stub) |
| FND-05 | Zones, bancs, permis CRUD scopés site | integration | `pnpm --filter @gravel/api test:int -- master-data.spec.ts` | `apps/api/test/integration/master-data.spec.ts` (W0 stub) |
| FND-06 | Audit trail immuable + chain-of-hash par (tenant, table) | integration | `pnpm --filter @gravel/api test:int -- audit-chain.spec.ts` | `apps/api/test/integration/audit-chain.spec.ts` (W0 stub) |
| FND-07 | Money stocké en bigint minor units + 3 montants (origine/site/groupe) | unit | `pnpm --filter @gravel/api test -- money.spec.ts` | `apps/api/test/unit/money.spec.ts` (W0 stub) |
| FND-08 | OperationalDay résolu correctement + DST-crossing test | unit | `pnpm --filter @gravel/api test -- operational-day.spec.ts` | `apps/api/test/unit/operational-day.spec.ts` (W0 stub) |
| FND-09 | FR ↔ EN per-user, persisté, propagé web+mobile | E2E + widget | `pnpm --filter @gravel/web e2e -- i18n.e2e.ts` + `cd apps/mobile && flutter test test/widget/i18n_test.dart` | `apps/web/e2e/i18n.e2e.ts` (W0 stub) ; `apps/mobile/test/widget/i18n_test.dart` (W0 stub) |
| FND-10 | Mobile capture offline du journal d'activité + sync sans perte ni doublon | integration (flutter) | `cd apps/mobile && flutter test integration_test/sync_offline_test.dart` | `apps/mobile/integration_test/sync_offline_test.dart` (W0 stub) |
| FND-11 | Sync conflict policy framework — chaos harness append-only + LWW | chaos | `pnpm --filter @gravel/api test:chaos` | `apps/api/test/chaos/sync-chaos.spec.ts` (W0 stub) |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Tests stubs to scaffold before any production code (must compile/run and FAIL with a clear "not implemented" message — RED state in TDD).

- [ ] `apps/api/test/integration/identity.spec.ts` — stubs for FND-01
- [ ] `apps/api/test/security/rls-leak.generator.ts` — generator that reads `information_schema.tables` and emits one test per table for FND-02
- [ ] `apps/api/test/unit/rbac.spec.ts` — role × site scope assertions for FND-03
- [ ] `apps/web/e2e/site-create.e2e.ts` — Playwright stub for FND-04
- [ ] `apps/api/test/integration/master-data.spec.ts` — CRUD stubs for FND-05
- [ ] `apps/api/test/integration/audit-chain.spec.ts` — chain-of-hash invariants for FND-06
- [ ] `apps/api/test/unit/money.spec.ts` — bigint minor units + scale per currency for FND-07
- [ ] `apps/api/test/unit/operational-day.spec.ts` — DST crossing `Europe/Paris 2026-10-25 02:00` for FND-08
- [ ] `apps/web/e2e/i18n.e2e.ts` + `apps/mobile/test/widget/i18n_test.dart` — FR↔EN toggle for FND-09
- [ ] `apps/mobile/integration_test/sync_offline_test.dart` — offline capture + reconnect round-trip for FND-10
- [ ] `apps/api/test/chaos/sync-chaos.spec.ts` — 2 clients × same entity × concurrent edits per conflict strategy for FND-11
- [ ] `apps/api/test/setup/testcontainers.ts` — shared fixture (Postgres 18 + PostGIS + Keycloak)
- [ ] `apps/api/jest.config.ts` projects: `unit | integration | security | chaos`
- [ ] `apps/mobile/test/helpers/sync_harness.dart` — split-brain helper
- [ ] CI workflow `infra/.github/workflows/test.yml` runs all four tiers and blocks merge on any RED

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Keycloak admin UI exploration | FND-01 | Admin UX is configured, not coded — vérifier que les groupes par site sont créés dans le realm `gravel-dev` | Connecter `kcadm` ou ouvrir l'admin console ; vérifier groupes `tenant-X/country-CI/site-Y` |
| Grafana LGTM dashboards | (obs) | Visual verification of "Phase 1 Health" dashboard — traces, logs, métriques apparaissent | Ouvrir Grafana, charger dashboard, déclencher 5 requêtes ; vérifier que chaque requête produit trace+log+métrique |
| Object-storage immutability spike | D-29 (convention) | S3 object lock comportement à valider sur tenant bucket — bloque overwrite | Upload, retry overwrite avec PutObject ; doit échouer avec `403 ObjectLocked` |

*All other Phase-1 behaviours have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45 s (quick) / < 12 min (full)
- [ ] `nyquist_compliant: true` set in frontmatter (planner flips this once map is populated)

**Approval:** pending (planner to populate per-task IDs and flip `nyquist_compliant: true`).
