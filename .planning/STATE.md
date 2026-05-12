# STATE: Gravel Ivoire — ERP Carrière de Granite

## Project Reference

- **Core Value:** Donner à un groupe minier une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.
- **Current Focus:** Phase 1 — Foundation (tenancy, sync, master data, mobile shell)
- **Domain:** Mining / Quarry ERP — multi-site, multi-country (West Africa / OHADA)
- **Stack (recommended):** NestJS 11 / Node 24, PostgreSQL 18 + PostGIS + TimescaleDB, Flutter + PowerSync + Drift, Angular 20, Keycloak 26

## Current Position

- **Phase:** 1 — Foundation
- **Plan:** Not yet planned (run `/gsd:plan-phase 1`)
- **Status:** Not started
- **Progress:** [░░░░░░░░░░] 0% (0/5 phases complete in v1)

## Phase Map

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation | Not started |
| 2 | Vertical Slice Production | Not started |
| 3 | Operational Completeness | Not started |
| 4 | Analytics, Consolidation & Finance | Not started |
| 5 | IoT Integration | Not started |
| 6 | Hardening & Multi-Country Rollout | Deferred (v2) |

## Performance Metrics

- **Phases complete:** 0/5 (v1)
- **Plans complete:** 0
- **Requirements validated:** 0/71
- **Phases with success criteria:** 6/6

## Accumulated Context

### Key Decisions (from PROJECT.md)

| Decision | Status |
|----------|--------|
| Architecture monolithe modulaire (strangler vers microservices ciblés) | Pending validation Phase 1 |
| PostgreSQL + PostGIS + TimescaleDB | Pending install verification (TimescaleDB ↔ PG18) |
| Flutter + PowerSync + Drift pour mobile | Pending Phase 1 spike |
| Sync offline-first per-entity (append-only / event-sourced / pessimistic / LWW) | Pending Phase 1 |
| Transformation aval reportée hors MVP | Confirmed |
| Paie complète hors MVP (export SIRH) | Confirmed |
| OHADA: analytique uniquement, export vers Sage/Ciel/Odoo | Confirmed |

### Open TODOs

- [ ] Identifier 3 opérateurs terrain réels pour sprint co-design 2 semaines au kick-off Phase 2
- [ ] Engager cabinet expert-comptable OHADA avant travail finance Phase 3-4
- [ ] Capturer profil connectivité du premier site pilote (façonne budget payload sync) durant Phase 1
- [ ] Vérifier compatibilité TimescaleDB ↔ PostgreSQL 18 à l'install (fallback PG17 si besoin)
- [ ] Confirmer composition flotte OEM moteur (Caterpillar/Komatsu/Volvo/Liebherr) avant Phase 5
- [ ] Confirmer liste expansion pays au-delà UEMOA (ZAR/NGN/GHS éventuels)

### Blockers

- None

### Pitfalls to Address by Phase (from research)

- **Phase 1:** #3 (multi-devise discipline), #4 (frontière OHADA), #5 (RLS cross-tenant), #9 (OperationalDay)
- **Phase 2:** #2 (sync per-entity), #6 (sanity pesage), #7 (chain-of-custody HSE), #8 (adoption UX terrain)
- **Phase 3:** #1 (immuabilité tir/explosifs), #7 (validité temporelle habilitations)
- **Phase 4:** #4 patrouille anti-scope-creep, #5 BI via read-replicas RLS-aware
- **Phase 5:** #6 (modèle 3 couches dès jour 1)

## Session Continuity

- **Last action:** Roadmap created from REQUIREMENTS.md + research/SUMMARY.md
- **Next action:** `/gsd:plan-phase 1` to decompose Phase 1 into executable plans
- **Files:**
  - `.planning/PROJECT.md` — project vision + constraints
  - `.planning/REQUIREMENTS.md` — 71 v1 requirements + traceability
  - `.planning/ROADMAP.md` — 6 phases with success criteria
  - `.planning/research/` — STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY
  - `.planning/config.json` — granularity=standard, mode=yolo, ui_phase=true

---
*State initialized: 2026-05-12*
