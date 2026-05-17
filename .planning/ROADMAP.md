# Roadmap: Gravel Ivoire — ERP Carrière de Granite

**Current version:** v1.1 shipped (2026-05-17)
**Next milestone:** v1.2 (not yet planned — run `/gsd:new-milestone`)

## Core Value

Donner à un groupe minier une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-05-16) — Foundation + vertical slice + operational completeness + Finance backend + IoT model
- ✅ **v1.1 Polish & Production-Hardening** — Phases 6-9 (shipped 2026-05-17) — Real dashboard numbers + alert closure + email/SMS delivery + production-hardening MVP for first-customer cutover
- 📋 **v1.2** — Not yet planned

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-05-16</summary>

- [x] Phase 1: Foundation (6/6 plans)
- [x] Phase 2: Vertical Slice Production (8/8 plans)
- [x] Phase 3: Operational Completeness (7/7 plans)
- [x] Phase 4: Analytics Consolidation & Finance Backend (partial — 4/6, FIN UI tiles deferred)
- [x] Phase 5: IoT Ingestion Model (backend model only — broker stack deferred to v2)

Full detail: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
</details>

<details>
<summary>✅ v1.1 Polish & Production-Hardening (Phases 6-9) — SHIPPED 2026-05-17</summary>

- [x] Phase 6: Hardening MVP — Section 6A (8/8 plans, 3 waves) — pen-test artifacts, backup/PITR drill, DR runbook, secrets rotation, audit export, SLO observability, sync chaos extension, cutover runbook
- [x] Phase 7: Finance Real (2/2 plans) — cost writers, @Cron aggregator, alert_rule seed, Finance/HSE tiles (FIN-R03/R04/R05 UI tiles deferred to v1.2 known gaps)
- [x] Phase 8: Operational Alerts Closure (3/3 plans) — equipment meter denormalization, PreventiveMaintenanceScheduler @Cron, spare-part threshold handler
- [x] Phase 9: Notification Delivery (1/1 plan) — BullMQ + Brevo + Twilio + Angular badge

Section 6B (multi-country, multi-region, IoT broker, service mesh, DB-per-tenant, third-party pen-test, AWS infra pen-test) deferred to v2 — full scope in archived CONTEXT.md.

Full detail: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
</details>

### 📋 v1.2 (Planned)

Not yet defined. Run `/gsd:new-milestone` to plan. Known carry-over from v1.1:

- **FIN-R03** Dashboard Finance Groupe (DSH-05) P&L drill-down UI (backend ready)
- **FIN-R04** KPI Finance tiles (DSH-03) Directeur Site dashboard (backend ready)
- **FIN-R05** KPI HSE tiles (DSH-04) HSE dashboard (backend ready)
- Mobile MNT + VTE real screens (currently 19-line placeholders)
- FND-07 Money 3-representation ledger (amount_original / site_functional / group)
- AR locale i18n (web + mobile — backend ready)

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation | v1.0 | 6/6 | Complete | 2026-05-13 |
| 2. Vertical Slice Production | v1.0 | 8/8 | Complete | 2026-05-14 |
| 3. Operational Completeness | v1.0 | 7/7 | Complete | 2026-05-15 |
| 4. Analytics & Finance Backend | v1.0 | 4/6 | Partial (carry to v1.2) | 2026-05-16 |
| 5. IoT Ingestion Model | v1.0 | partial | Backend-only (broker → v2) | 2026-05-16 |
| 6. Hardening MVP (Section 6A) | v1.1 | 8/8 | Complete | 2026-05-17 |
| 7. Finance Real | v1.1 | 2/2 | Complete | 2026-05-16 |
| 8. Operational Alerts Closure | v1.1 | 3/3 | Complete | 2026-05-17 |
| 9. Notification Delivery | v1.1 | 1/1 | Complete | 2026-05-17 |

---
*Roadmap created: 2026-05-12*
*v1.0 archived: 2026-05-16*
*v1.1 archived: 2026-05-17*
