---
phase: 02
slug: vertical-slice-production
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed test strategy lives in `02-RESEARCH.md` §"Validation Architecture".
> This file is the operational contract — what the executor runs, when, and what proves done.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (api)** | jest 29.x (NestJS preset) — already installed Phase 1 |
| **Framework (web)** | jest + Angular Testing Library + Playwright (e2e) — already installed Phase 1 |
| **Framework (mobile)** | flutter_test + integration_test + patrol (e2e on device) — Phase 1 base + patrol added W0 |
| **Config file (api)** | `apps/api/jest.config.ts`, `apps/api/test/jest-e2e.json` |
| **Config file (web)** | `apps/web/jest.config.ts`, `apps/web/playwright.config.ts` |
| **Config file (mobile)** | `apps/mobile/dart_test.yaml`, `apps/mobile/integration_test/` |
| **Quick run command** | `pnpm -r --filter=...[HEAD] test:quick` (changed packages only) |
| **Full suite command** | `pnpm -r test && (cd apps/mobile && flutter test)` |
| **Chain-of-hash integrity check** | `pnpm --filter=@gravel/api test:integrity` (asserts chain on stockpile_event, fuel_tank_event, hse_incident over 100-event fixture with injected corruption) |
| **RLS cross-tenant check** | `pnpm --filter=@gravel/api test:rls` (iterates pg_catalog, runs per-table cross-tenant probe — Phase 1 harness extended Phase 2) |
| **Sync chaos check** | `pnpm --filter=@gravel/api test:sync-chaos` (2 offline clients, conflict resolution per strategy registry) |
| **Estimated runtime (quick)** | ~25 seconds per affected package |
| **Estimated runtime (full)** | ~6 minutes (api + web), ~4 minutes (mobile) |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter=<package-touched> test:quick`
- **After every plan completion:** Full suite for that package + integration tests for new entities
- **After every wave completion:** Full suite all packages + chain-of-hash + RLS + sync chaos
- **Before `/gsd:verify-work`:** Full suite green + manual UAT on pilot device matrix (XCover Pro 6 + Tab Active 3)
- **Max feedback latency (quick):** 30 seconds
- **Max feedback latency (full):** 10 minutes

---

## Per-Task Verification Map

> Detailed mapping populated by the planner. Below is the wave-level scaffolding the planner MUST honor.
> Every REQ-ID listed in Phase 2 (25 REQs) MUST appear in this table by end of planning.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| W0-* | 02-W0-P01 | 0 | (infra) | jest unit | `pnpm --filter=@gravel/api test src/modules/alerts` | ❌ W0 creates | ⬜ pending |
| W0-* | 02-W0-P01 | 0 | (infra) | terraform plan | `cd infra && tofu plan` | ❌ W0 creates | ⬜ pending |
| W1-* | 02-W1-P02 | 1 | FOR-01, FOR-05 | jest integration | `pnpm --filter=@gravel/api test foration` | ❌ W1 creates | ⬜ pending |
| W1-* | 02-W1-P02 | 1 | FOR-03 | jest unit | `pnpm --filter=@gravel/api test drilling-yield` | ❌ W1 creates | ⬜ pending |
| W1-* | 02-W1-P03 | 1 | FOR-02, FOR-04 | flutter integration | `cd apps/mobile && flutter test integration_test/foration_test.dart` | ❌ W1 creates | ⬜ pending |
| W1-* | 02-W1-P03 | 1 | FOR-02 (sync) | sync chaos | `pnpm --filter=@gravel/api test:sync-chaos --suite=drilled_hole` | ❌ W1 creates | ⬜ pending |
| W1-* | 02-W1-P04 | 1 | EXT-01, EXT-02 | jest integration | `pnpm --filter=@gravel/api test extraction` | ❌ W1 creates | ⬜ pending |
| W2-* | 02-W2-P05 | 2 | TRP-01, TRP-02, TRP-03 | jest integration | `pnpm --filter=@gravel/api test transport` | ❌ W2 creates | ⬜ pending |
| W2-* | 02-W2-P05 | 2 | TRP-02 (offline) | flutter integration | `cd apps/mobile && flutter test integration_test/weighing_ticket_offline_test.dart` | ❌ W2 creates | ⬜ pending |
| W2-* | 02-W2-P06 | 2 | STK-01, STK-02, STK-03 | jest integration + chain-of-hash | `pnpm --filter=@gravel/api test stockpile && pnpm --filter=@gravel/api test:integrity --table=stockpile_event` | ❌ W2 creates | ⬜ pending |
| W2-* | 02-W2-P06 | 2 | STK-01 (outbox) | jest integration | `pnpm --filter=@gravel/api test outbox-stockpile-inflow` | ❌ W2 creates | ⬜ pending |
| W3-* | 02-W3-P07 | 3 | CAR-01, CAR-02, CAR-04 | jest integration + chain-of-hash | `pnpm --filter=@gravel/api test fuel && pnpm --filter=@gravel/api test:integrity --table=fuel_tank_event` | ❌ W3 creates | ⬜ pending |
| W3-* | 02-W3-P07 | 3 | CAR-03 | jest unit | `pnpm --filter=@gravel/api test fuel-anomaly-detection` | ❌ W3 creates | ⬜ pending |
| W3-* | 02-W3-P08 | 3 | HSE-01, HSE-02, HSE-06 | jest integration + chain-of-hash | `pnpm --filter=@gravel/api test hse && pnpm --filter=@gravel/api test:integrity --table=hse_incident` | ❌ W3 creates | ⬜ pending |
| W3-* | 02-W3-P08 | 3 | HSE-01 (photos) | s3 e2e | `pnpm --filter=@gravel/api test:s3-objectlock` | ❌ W3 creates | ⬜ pending |
| W3-* | 02-W3-P09 | 3 | DSH-01, DSH-02 | playwright e2e | `pnpm --filter=@gravel/web playwright test dashboard` | ❌ W3 creates | ⬜ pending |
| W3-* | 02-W3-P09 | 3 | DSH-01 (SSE) | jest integration | `pnpm --filter=@gravel/api test sse-dashboard` | ❌ W3 creates | ⬜ pending |
| W3-* | 02-W3-P09 | 3 | DSH-02 (provisional cost) | jest unit | `pnpm --filter=@gravel/api test cost-per-ton-provisional` | ❌ W3 creates | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**REQ coverage check (planner MUST satisfy):** FOR-01..05, EXT-01..02, TRP-01..03, STK-01..03, CAR-01..04, HSE-01..06, DSH-01..02 = 25 REQs each appearing ≥ 1 row above by end of plan-checker verification. **HSE-03, HSE-04, HSE-05 are partially deferred Phase 3** per CONTEXT.md D2-63/D2-64 — but a verification row MUST still exist (testing that the "deferred — Phase 3" behavior is correctly stubbed, e.g., no UI surface, schema absent, comment/ADR present).

---

## Wave 0 Requirements

- [ ] `apps/api/src/modules/alerts/alerts.module.ts` + `alerts.controller.ts` + `alert.entity.ts` + `tests/alerts.e2e-spec.ts` — module scaffolding
- [ ] `apps/api/src/modules/outbox/outbox.module.ts` + `outbox-worker.processor.ts` (BullMQ) + `tests/outbox-roundtrip.spec.ts` — transactional outbox
- [ ] `apps/api/src/modules/sync/strategies/append-only-event.ts` (Phase 1 — verify exists; extend if not) + Phase 2 entity registrations stubs
- [ ] `apps/api/src/modules/master-data/production-equipment.entity.ts` + CRUD + `tests/production-equipment.spec.ts`
- [ ] `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` — generic chain verifier reused by 3 tables (Phase 1 audit verifier extended)
- [ ] `apps/api/src/common/chain-of-hash/event-chain.verifier.spec.ts` — 100-event fixture + injected corruption test
- [ ] `apps/mobile/integration_test/_fixtures/` — fixtures terrain (mock GPS, mock photo blobs, mock OperationalDay)
- [ ] `apps/mobile/lib/core/sync/append_only_repository.dart` (Phase 1 sync scaffold extended for 6+ new entities)
- [ ] `apps/web/src/app/core/sse/sse-client.service.ts` + `sse-client.service.spec.ts` — SSE wrapper with Last-Event-ID retry
- [ ] `infra/modules/s3-objectlock/` (OpenTofu) — HSE attachments bucket Governance 7y + tests `infra/modules/s3-objectlock/tests/`
- [ ] `infra/keycloak/realms/gravel/roles/phase-02.json` — 7 new roles (OPERATOR_DRILLING, OPERATOR_EXCAVATOR, TRUCK_DRIVER, WEIGHING_OPERATOR, HSE_OFFICER, SITE_MANAGER, QUARRY_CHIEF)
- [ ] `docs/design/phase-02/provisional-wireframes.md` — 6 screen specs derived from CONTEXT.md (co-design workshop = parallel non-blocking track, decision 2026-05-12)
- [ ] `docs/operations/parallel-tracks.md`, `docs/operations/legal-review-queue.md`, `docs/operations/procurement-queue.md` — operational prerequisites register (none block code execution)
- [ ] i18n locales = exactly 3 languages (fr/en/ar) × 8 namespaces = 24 JSON files. No Dioula/Baoulé/Wolof/Bambara directories.
- [ ] `docs/adr/ADR-0006-stockpile-event-sourcing.md` (drafted W0, refined W2)
- [ ] `docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md` (drafted W0, refined W3)
- [ ] `docs/adr/ADR-0008-hse-incident-immutability-capa.md` (drafted W0, refined W3)
- [ ] `docs/adr/ADR-0009-weighing-ticket-offline-numbering.md` (drafted W0, refined W2)
- [ ] `docs/adr/ADR-0010-sse-dashboard-push.md` (drafted W0, refined W3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plein soleil readability + glove tap target (mobile foration form) | FOR-02 D2-81 | Cannot automate ergonomic UX validation under bright outdoor sunlight with gloved hands | UAT script `docs/uat/phase-02/foration-mobile-ergonomics.md`: 3 operators on XCover Pro 6 outdoor, ≥ 95% successful hole submission first try |
| Signature pad legibility client/chauffeur on Tab Active 3 | TRP-02 D2-33 | Hardware-specific touch sensitivity + stylus calibration | UAT script `docs/uat/phase-02/weighing-ticket-signature.md`: capture 10 sample signatures, OCR-readable & content-hash verified |
| GPS accuracy under foliage / bench wall occlusion | FOR-02 D2-11 | Site-specific RF environment | Field test on pilot site, 50 holes, ≥ 80% with `accuracy_m < 10` |
| Photo upload over 2G/EDGE intermittent connection | HSE-01 D2-61 | Network condition specific to remote site | Field test: HSE officer creates 5 incidents with 3 photos each on 2G/EDGE; all eventually arrive content-addressed |
| Alert delivery to Directeur Site SES email | D2-74 | Depends on tenant SES domain verification + spam reputation | Inject 1 threshold crossing, verify email delivered < 60 s |
| Workforce headcount entry friction at daily close | HSE-06 D2-65 + D2-100 | UX-driven — does Directeur Site actually fill it? | UAT pilot 2 weeks: track % of OperationalDay closures with headcount filled (target ≥ 95 %) |
| Co-design wireframe validation | D2-83 | Inherently user-research | Workshop deliverable `docs/design/phase-02/co-design-workshop-readout.md` signed by 5 participants |

---

## Validation Sign-Off

- [ ] All tasks have automated verify OR Wave 0 dependency OR explicit Manual-Only entry
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING test infrastructure references
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 30 s (quick) / < 10 min (full)
- [ ] All 25 phase REQs appear in Per-Task Verification Map
- [ ] Chain-of-hash integrity test created and green for 3 new tables
- [ ] RLS cross-tenant test extended to cover all Phase 2 tables
- [ ] Sync chaos test covers each new `append_only_event` entity
- [ ] `nyquist_compliant: true` set in frontmatter after planner + checker passes

**Approval:** pending
