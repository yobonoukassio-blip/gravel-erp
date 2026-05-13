---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: v1.0 milestone — Phases 1-5 complete; Phase 6 deferred to v2
last_updated: "2026-05-13T19:00:00.000Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 23
  completed_plans: 23
  percent: 100
---

# STATE: Gravel Ivoire — ERP Carrière de Granite

## Project Reference

- **Core Value:** Donner à un groupe minier une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.
- **Current Focus:** Phase 03 — operational-completeness
- **Domain:** Mining / Quarry ERP — multi-site, multi-country (West Africa / OHADA)
- **Stack (recommended):** NestJS 11 / Node 24, PostgreSQL 18 + PostGIS + TimescaleDB, Flutter + PowerSync + Drift, Angular 20, Keycloak 26

## Current Position

Phase: v1.0 MILESTONE COMPLETE
Plan: all 23 plans

- **Phase:** v1.0 complete; Phase 6 (Hardening, Scale, Multi-Country) deferred to v2
- **Plan:** —
- **Status:** v1.0 milestone delivered (Phases 1-5)
- **Progress:** [██████████] 100% v1.0
- **All phases:** Foundation ✓ ; Vertical Slice ✓ ; Operational Completeness ✓ ; Analytics & Finance ✓ ; IoT Integration ✓

## Phase Map

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation | ✓ Complete (2026-05-12) |
| 2 | Vertical Slice Production | ✓ Complete (2026-05-13) |
| 3 | Operational Completeness | ✓ Complete (2026-05-13) |
| 4 | Analytics, Consolidation & Finance | ✓ Complete (2026-05-13) |
| 5 | IoT Integration | ✓ Complete (2026-05-13) |
| 6 | Hardening & Multi-Country Rollout | Deferred (v2) |

## Performance Metrics

- **Phases complete:** 1/5 (v1)
- **Plans complete:** 7 (Phase 1: 6 + Phase 2: 1)
- **Requirements validated:** 11/71 (FND-01..FND-11)
- **Phases with success criteria:** 6/6

## Accumulated Context

### Key Decisions (from PROJECT.md)

| Decision | Status |
|----------|--------|
| CON/CRI sessions publish outbox event post same-tx; energy upsert post-commit (non-blocking) | ✓ Validated Phase 3 (CON-02) |
| Compound idempotency key session_id_calibre_code for screening calibres (Pitfall 3, ADR-0013) | ✓ Validated Phase 3 (CRI-01) |
| crusher_session_status enum reused for screening_session | ✓ Validated Phase 3 |
| blast_plan mutable state machine — NO append-only trigger (ADR-0012 Pitfall 1) | ✓ Validated Phase 3 (TIR-03) |
| Habilitation gate uses shiftStartLocal — never new Date() (ADR-0012 Pitfall 2) | ✓ Validated Phase 3 (TIR-03, TIR-05) |
| PDF snapshot published via OutboxService AFTER append commits (ADR-0012 Pitfall 7) | ✓ Validated Phase 3 (TIR-01) |
| ExplosivesReconciliationJob calls blockClosure via OperationalDayService (not direct write) | ✓ Validated Phase 3 (TIR-07) |
| Modular monolith NestJS 11 + Node 24 | ✓ Validated Phase 1 |
| PostgreSQL 18 + PostGIS 3.5 + TimescaleDB (en image postgis/postgis:18-3.5) | ✓ Validated Phase 1 |
| Flutter 3.35 + PowerSync 1.9 + Drift 2.20 mobile | ✓ Validated Phase 1 |
| Sync per-entity via ConflictRegistry (4 strategies, 2 wired Phase 1) | ✓ Validated Phase 1 |
| Defense-in-depth tenant: RLS + TenantAwareRepo + JWT→CLS→GUC | ✓ Validated Phase 1 (ADR-0001) |
| Audit chain-of-hash sha256 per (tenant_id, table_name) | ✓ Validated Phase 1 (ADR-0004) |
| Money bigint minor units + dinero.js v2 + banker's rounding | ✓ Validated Phase 1 |
| Keycloak 26 single realm + groupes par site (realms par pays Phase 6) | ✓ Validated Phase 1 (ADR-0005) |
| Angular 20 + Material + AG-Grid + Formly + Transloco | ✓ Validated Phase 1 |
| OTel + Grafana LGTM self-host (api/web/mobile OTLP/HTTP) | ✓ Validated Phase 1 |
| CI BLOCKING gates via `gate` aggregator job | ✓ Validated Phase 1 |
| RhHabilitationService.isValidAt(id, code, asOfDate) — explicit date, never new Date() internally | ✓ Validated Phase 3 (ADR-0011) |
| OperationalDay.closure_blockers JSONB — idempotent append via @> containment | ✓ Validated Phase 3 (ADR-0012) |
| EventChainVerifier pre-registered for explosives_event + blast_report with frozen canonical payload | ✓ Validated Phase 3 (ADR-0012) |
| Unified employee table (direct-hire + subcontractor): CHECK (site_id IS NOT NULL OR subcontractor_id IS NOT NULL) | ✓ Validated Phase 3 (RH-01) |
| Transformation aval reportée hors MVP | Confirmed |
| Paie complète hors MVP (export SIRH) | Confirmed |
| OHADA: analytique uniquement, export vers Sage/Ciel/Odoo | Confirmed |
| Phase 01 P05 | 25 | 3 tasks | 30 files |
| Phase 01-foundation P06 | 1.3h | 4 tasks | 16 files |
| Phase 02 PW0-P01 | 807s | 8 tasks | 62 files |
| Phase 02 PW1-P03 | 720 | 2 tasks | 17 files |
| Phase 02 PW1-P02 | 0 | 4 tasks | 33 files |
| Phase 02 PW2-P04 | 45min | 5 tasks | 28 files |
| Phase 02 P04 | 92m | 5 tasks | 29 files |
| Phase 02 PW2-P05 | 60min | 5 tasks | 30 files |
| Phase 02 PW3-P07 | 45min | 6 tasks | 35 files |
| Phase 03 PW0-P01 | ~90min | 4 tasks | 65 files |
| Phase 03 PW1-P03 | ~60min | 3 tasks | 25 files |
| Phase 03 PW1-P02 | ~90min | 4 tasks | 45 files |

### Open TODOs

- [ ] Identifier 3 opérateurs terrain réels pour sprint co-design 2 semaines au kick-off Phase 2
- [ ] Engager cabinet expert-comptable OHADA avant travail finance Phase 3-4
- [ ] Capturer profil connectivité du premier site pilote (façonne budget payload sync) durant Phase 1
- [ ] Vérifier compatibilité TimescaleDB ↔ PostgreSQL 18 à l'install (fallback PG17 si besoin)
- [ ] Confirmer composition flotte OEM moteur (Caterpillar/Komatsu/Volvo/Liebherr) avant Phase 5
- [ ] Confirmer liste expansion pays au-delà UEMOA (ZAR/NGN/GHS éventuels)

### Blockers

- ⚠️ [Phase 1 carry-over] Local-env tooling absent (pnpm, docker, flutter, tofu non installés sur le host Windows). UAT live impossible localement ; CI = source of truth. Installer la toolchain avant Phase 2 ou prévoir preview env CI déployable.
- ⚠️ [Phase 2 prep] Confirmer compatibilité TimescaleDB ↔ PostgreSQL 18 (fallback PG17 si Timescale retarde). Risque hypertables IoT Phase 5.

### Pitfalls to Address by Phase (from research)

- **Phase 1:** #3 (multi-devise discipline), #4 (frontière OHADA), #5 (RLS cross-tenant), #9 (OperationalDay)
- **Phase 2:** #2 (sync per-entity), #6 (sanity pesage), #7 (chain-of-custody HSE), #8 (adoption UX terrain)
- **Phase 3:** #1 (immuabilité tir/explosifs), #7 (validité temporelle habilitations)
- **Phase 4:** #4 patrouille anti-scope-creep, #5 BI via read-replicas RLS-aware
- **Phase 5:** #6 (modèle 3 couches dès jour 1)

## Session Continuity

- **Last session:** 2026-05-13T16:00:00.000Z
- **Stopped at:** Completed 03-W1-P02-PLAN.md (TIR — Tir de Mine & Explosifs — TIR-01..07)
- **Next action:** `/gsd:execute-phase 3` to continue with Wave 2 plans (W2-P04 Maintenance + W2-P05 Ventes Part 1 in parallel)
- **Resume file:** None
- **Files:**
  - `.planning/PROJECT.md` — project vision + constraints
  - `.planning/REQUIREMENTS.md` — 71 v1 requirements + traceability
  - `.planning/ROADMAP.md` — 6 phases with success criteria
  - `.planning/research/` — STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY
  - `.planning/config.json` — granularity=standard, mode=yolo, ui_phase=true

---
*State updated: 2026-05-12 — after Phase 1 transition*
