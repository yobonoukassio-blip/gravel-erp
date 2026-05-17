# Requirements: v1.1 polish-and-gaps

**Milestone:** v1.1
**Goal:** Passer de "v1.0 code-complete" a "v1.1 production-ready" pour le premier client reel.
**Created:** 2026-05-16

## Requirements

### Finance Real (DSH-03..06 + FIN cost writers + daily cron)

- [x] **FIN-R01**: Les 4 cost components manquants (extraction, transport, concassage, criblage) ecrivent dans `analytical_entry` via DI dans leur module respectif (plus de hardcoded `0n`)
- [x] **FIN-R02**: Un @Cron daily (`CostPerTonAggregatorJob`) materialise le cout/tonne par site x calibre a 04:00 UTC sans intervention manuelle
- [ ] **FIN-R03**: Le dashboard Finance Groupe (DSH-05) affiche P&L consolide multi-site avec drill-down par site/contrat/matiere
- [ ] **FIN-R04**: Les KPI Finance (DSH-03: cout/tonne, marge, conso carburant, cout maintenance) sont rendus en tiles sur le dashboard Directeur Site
- [ ] **FIN-R05**: Les KPI HSE (DSH-04: incidents, TF, conformite) sont rendus en tiles sur le dashboard HSE
- [x] **FIN-R06**: Le moteur d'alertes (DSH-06) est alimente par des `alert_rule` seedes en migration — au moins 5 regles par defaut (seuil stockpile, spare part, HSE severity>=4, explosifs gap, fuel anomaly)

### Operational Alerts Closure (MNT-02, MNT-04)

- [x] **ALT-01**: Un @Cron (`PreventiveMaintenanceSchedulerJob`) ouvre un WorkOrder automatiquement quand l'intervalle PM d'un equipement est franchi (heures, km, ou calendaire)
- [x] **ALT-02**: Un handler `maintenance.spare_part.threshold_crossed` ecoute les evenements de stock pieces et cree une alerte quand le seuil min est atteint

### Notification Delivery (email + SMS)

- [x] **NTF-01**: Un provider email (Brevo/SendGrid) est integre via BullMQ queue — les alertes `alert_rule` declenchent un email au(x) destinataire(s) configure(s)
- [x] **NTF-02**: Un provider SMS (Twilio/Vonage) est integre via BullMQ queue — les alertes severity >= `high` declenchent un SMS au responsable site
- [x] **NTF-03**: Les stubs `logger.log()` dans `AlertDispatcherService` sont remplaces par des appels reels au job queue (email + SMS)

### Hardening MVP (Section 6A)

Production-hardening requirements for the first paying customer go-live (Côte d'Ivoire). Each is bound to one or more plans under `phases/06-hardening-scale-multi-country-rollout/`.

- [x] **HRD-MVP-01**: Pen-test artifact set shipped — procedure runbook + ZAP/Caido automation + SCOPE/FINDINGS/REMEDIATION templates for 2026-Q2 internal red-team. Session itself tracked as non-blocking parallel track per `feedback_human_prereqs_non_blocking`.
- [x] **HRD-MVP-02**: Monthly backup-restore drill runs in CI and produces dated artifact under `.planning/drills/backup-YYYYMM.md` proving PITR works end-to-end.
- [x] **HRD-MVP-03**: DR runbook covers 4 named scenarios (DB loss, tenant compromise, region outage, deadletter pileup) with comms + post-mortem templates; first 2026 tabletop scheduled.
- [x] **HRD-MVP-04**: Secrets rotation runbook covers 6 secret families (JWT, DB, S3, Brevo, Twilio, Redis) with cadence + JWT dual-key window documented; `.env.example` cross-linked.
- [x] **HRD-MVP-05**: `GET /api/audit/export` endpoint returns chain-verified + S3-signed CSV; quarterly cron auto-emails compliance contact per tenant; `tenant.compliance_email` migration shipped.
- [x] **HRD-MVP-06**: 4 SLOs locked (API p95 < 500ms, sync > 99.5%, queue < 10min, dispatch < 60s) with Prometheus burn-rate alerts + 5 Grafana dashboards + custom metrics wired into emitters; Grafana OnCall paging configured.
- [x] **HRD-MVP-07**: Extended sync chaos spec (1000×100×30% load) passes with deadletter rate < 1%; triage SOP + manual replay endpoint shipped.
- [x] **HRD-MVP-08**: `v1.1-cutover.md` runbook + 4 master-data CSV templates (sites, users, equipment, suppliers) ready for first-customer onboarding. Employee/customer CSVs deferred to v1.1.1 if first-customer demand surfaces.

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| FIN-R01 | 07-finance-real | Done (Plan 01 — bed2baa, 6eb2da4) |
| FIN-R02 | 07-finance-real | Done (Plan 01 — b1246b1) |
| FIN-R03 | 07-finance-real | Pending |
| FIN-R04 | 07-finance-real | Pending |
| FIN-R05 | 07-finance-real | Pending |
| FIN-R06 | 07-finance-real | Done (Plan 01 — 3924856) |
| ALT-01 | 08-operational-alerts-closure | Complete |
| ALT-02 | 08-operational-alerts-closure | Complete |
| NTF-01 | 09-notification-delivery | Complete |
| NTF-02 | 09-notification-delivery | Complete |
| NTF-03 | 09-notification-delivery | Complete |
| HRD-MVP-01 | 06-hardening-scale-multi-country-rollout | Complete |
| HRD-MVP-02 | 06-hardening-scale-multi-country-rollout | Complete |
| HRD-MVP-03 | 06-hardening-scale-multi-country-rollout | Complete |
| HRD-MVP-04 | 06-hardening-scale-multi-country-rollout | Complete |
| HRD-MVP-05 | 06-hardening-scale-multi-country-rollout | Complete |
| HRD-MVP-06 | 06-hardening-scale-multi-country-rollout | Complete |
| HRD-MVP-07 | 06-hardening-scale-multi-country-rollout | Complete |
| HRD-MVP-08 | 06-hardening-scale-multi-country-rollout | Complete |

## Out of Scope (v1.2 / v2)

| Feature | Reason |
|---|---|
| FND-07 money 3-rep ledger | Architectural deep work, non bloquant client demo |
| AR i18n web + mobile | FR/EN couvre CI/BF/ML premiers clients |
| Mobile MNT/VTE real screens | Placeholder shells acceptables court-terme |
| IOT-01/02/03 MQTT pipeline | 3 semaines infra, v2 Hardening |
| DSH-05 full group consolidation UI | Backend ready, UI can wait v1.2 |

---
*Created: 2026-05-16*
*Traceability slugs aligned to phase dirs: 2026-05-16*
*HRD-MVP-01..08 added: 2026-05-17 (Section 6A planning)*
