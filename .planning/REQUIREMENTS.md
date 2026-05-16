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

- [ ] **ALT-01**: Un @Cron (`PreventiveMaintenanceSchedulerJob`) ouvre un WorkOrder automatiquement quand l'intervalle PM d'un equipement est franchi (heures, km, ou calendaire)
- [ ] **ALT-02**: Un handler `maintenance.spare_part.threshold_crossed` ecoute les evenements de stock pieces et cree une alerte quand le seuil min est atteint

### Notification Delivery (email + SMS)

- [ ] **NTF-01**: Un provider email (Brevo/SendGrid) est integre via BullMQ queue — les alertes `alert_rule` declenchent un email au(x) destinataire(s) configure(s)
- [ ] **NTF-02**: Un provider SMS (Twilio/Vonage) est integre via BullMQ queue — les alertes severity >= `high` declenchent un SMS au responsable site
- [ ] **NTF-03**: Les stubs `logger.log()` dans `AlertDispatcherService` sont remplaces par des appels reels au job queue (email + SMS)

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| FIN-R01 | 07-finance-real | Done (Plan 01 — bed2baa, 6eb2da4) |
| FIN-R02 | 07-finance-real | Done (Plan 01 — b1246b1) |
| FIN-R03 | 07-finance-real | Pending |
| FIN-R04 | 07-finance-real | Pending |
| FIN-R05 | 07-finance-real | Pending |
| FIN-R06 | 07-finance-real | Done (Plan 01 — 3924856) |
| ALT-01 | 08-operational-alerts-closure | Pending |
| ALT-02 | 08-operational-alerts-closure | Pending |
| NTF-01 | 09-notification-delivery | Pending |
| NTF-02 | 09-notification-delivery | Pending |
| NTF-03 | 09-notification-delivery | Pending |

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
