---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Phases
status: Executing Phase 08
last_updated: "2026-05-16T17:53:08.324Z"
last_activity: 2026-05-16
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 6
  completed_plans: 3
---

# STATE: Gravel Ivoire — ERP Carriere de Granite

## Project Reference

- **Core Value:** Donner a un groupe minier une visibilite temps reel consolidee sur la production, les couts a la tonne et la securite de chaque site/pays, avec saisie terrain mobile fiable meme en mode offline.
- **Current Focus:** Phase 08 — operational-alerts-closure
- **Domain:** Mining / Quarry ERP — multi-site, multi-country (West Africa / OHADA)
- **Stack:** NestJS 11 / Node 24, PostgreSQL 18 + PostGIS + TimescaleDB, Flutter + PowerSync + Drift, Angular 20, Keycloak 26

## Current Position

Phase: 08 (operational-alerts-closure) — EXECUTING
Plan: 1 of 3
**Milestone v1.1 EXECUTING — Phase 7 Plan 01 complete (FIN-R01/R02/R06).**

- **Goal:** Passer de v1.0 code-complete a v1.1 production-ready pour le premier client reel
- **Scope (80/20 cut):** Finance Real + Operational Alerts Closure + Notification Delivery
- **Phases:** 7 (Finance Real), 8 (Operational Alerts Closure), 9 (Notification Delivery)
- **REQ coverage:** 11/11 mapped (6 FIN-R + 2 ALT + 3 NTF)
- **Last activity:** 2026-05-16

### v1.0 (previous, complete)

- **Shipped:** 2026-05-16, archived to `.planning/milestones/v1.0-*`
- **Stats:** 5 phases, 23 plans, 237 commits, 107k LOC, 58/71 REQs satisfied

## Phase Map

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation | Complete (2026-05-12) |
| 2 | Vertical Slice Production | Complete (2026-05-13) |
| 3 | Operational Completeness | Complete (2026-05-13) |
| 4 | Analytics, Consolidation & Finance | Complete (2026-05-13) — backend services, partial UI |
| 5 | IoT Integration | Complete (2026-05-13) — 3-layer model, no MQTT infra |
| 6 | Hardening & Multi-Country Rollout | Deferred (v2) |
| 7 | Finance Real | In Progress (v1.1) — Plan 01 complete (cost writers + @Cron + alert seed) |
| 8 | Operational Alerts Closure | Planned (v1.1) — depends on Phase 7 alert_rule seed |
| 9 | Notification Delivery | Planned (v1.1) — depends on Phase 8 alerts firing |

## Known Tech Debt (v1.1 backlog)

See ROADMAP.md "Known Tech Debt" table for full list with Addressed-in mapping.

Tech debt addressed in v1.1: MNT-02 (Phase 8), MNT-04 (Phase 8), Phase 4 cost+seed+stubs (Phase 7 + Phase 9), DSH-05 (Phase 7).

Tech debt deferred to v1.2: FND-07 3-rep money, AR i18n, mobile MNT/VTE screens.

Tech debt deferred to v2: IOT MQTT pipeline (Phase 6).

## Accumulated Context

### Decisions

- 80/20 scope cut for v1.1: ship Finance UI + alerts firing + real notification delivery; defer architectural refactors.
- Phase numbering continues from v1.0 end (5) → 7, 8, 9 ; Phase 6 reserved v2.
- Phase 8 depends on Phase 7 because alert_rule seed migration must land before handlers can match rules.
- Phase 9 depends on Phase 8 because dispatchers need real alerts to dispatch.
- **Phase 7 Plan 01:** Aggregator pulls cost components from analytical_entry ledger (single source of truth). Writers emit per domain event. Idempotent via UNIQUE(tenant, source_table, source_id, cost_center).
- **Phase 7 Plan 01:** Bound to existing event name `production.extraction.cycle_recorded` (not the `cycle_created` suggested in plan — kept Phase 4 FIN-04 wiring).
- **Phase 7 Plan 01:** Amortissement stays 0n until production_equipment gains `purchase_cost_minor` + `useful_life_years` columns (deferred to FIN-07).
- [Phase 08]: 08-W1-P01: Event names hardcoded in @OnEvent decorators (no runtime fallback). Payload extensions are additive — existing consumers unaffected.
- [Phase 08]: 08-W1-P01: IF-HIGHER guard implemented in SQL WHERE clause (atomic, race-free) — not in application logic. All UPDATEs scope by tenant_id (RLS-safe).

### Todos

- [x] `/gsd:plan-phase 7` — derived 07-01 (cost writers + @Cron + alert seed)
- [x] Phase 7 Plan 01 execution — FIN-R01/R02/R06 shipped
- [ ] Phase 7 Plan 02+ — DSH-03/04/05 dashboard tiles (FIN-R03/R04/R05)
- [ ] `/gsd:plan-phase 8` — derive plans for Operational Alerts Closure
- [ ] `/gsd:plan-phase 9` — derive plans for Notification Delivery

### Blockers

None.

## Next Steps

1. Run `/gsd:plan-phase 7` to derive plans for Finance Real (cost writers DI + @Cron + dashboards + alert_rule seed)
2. Then `/gsd:plan-phase 8` (preventive maintenance scheduler + spare-part handler)
3. Then `/gsd:plan-phase 9` (BullMQ workers + Brevo + Twilio + in-app badge)

---
*State updated: 2026-05-16 — v1.1 roadmap drafted, ready for plan-phase 7*
