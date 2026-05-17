# Roadmap: Gravel Ivoire — ERP Carriere de Granite

**Current version:** v1.0 shipped
**Next milestone:** v1.1 polish-and-gaps (in progress)

## Core Value

Donner a un groupe minier une visibilite temps reel consolidee sur la production, les couts a la tonne et la securite de chaque site/pays, avec saisie terrain mobile fiable meme en mode offline.

## Shipped Milestones

- **v1.0** (2026-05-12 → 2026-05-16) — Foundation + Production vertical slice + Operational completeness + Finance backend + IoT ingestion model. 5 phases, 23 plans, 237 commits, 107k LOC. [Full archive](milestones/v1.0-ROADMAP.md)

## v1.1 Phases

- [x] **Phase 7: Finance Real** — Cost writers + @Cron aggregator + alert_rule seed + Finance/HSE UI tiles (complete 2026-05-16)
- [x] **Phase 8: Operational Alerts Closure** — Preventive-maintenance scheduler + spare-part threshold handler firing real alerts (complete 2026-05-17)
- [x] **Phase 9: Notification Delivery** — BullMQ + Brevo email + Twilio SMS + in-app notification badge replacing logger.log stubs (complete 2026-05-17)

## Phase Details

### Phase 7: Finance Real
**Goal**: Le dashboard Finance affiche des chiffres reels (pas des 0) — cost writers DI dans chaque module producteur, @Cron daily aggregation, UI tiles DSH-03/04/05/06, alert_rule seedes en migration.
**Depends on**: v1.0 (Phase 4 backend services already shipped — extend, do not rewrite)
**Requirements**: FIN-R01, FIN-R02, FIN-R03, FIN-R04, FIN-R05, FIN-R06
**Success Criteria** (what must be TRUE):
  1. Un operateur sur le dashboard Finance Directeur Site voit un cout/tonne non-zero avec les 7/7 composantes contribuant (extraction, transport, concassage, criblage, foration, tir, maintenance) — plus aucun `0n` hardcode dans le code.
  2. Le job `CostPerTonAggregatorJob` tourne automatiquement chaque jour a 04:00 UTC et materialise `cost_per_ton_daily` par site × calibre, visible sans intervention manuelle.
  3. Le dashboard Finance Groupe (DSH-05) affiche un P&L consolide multi-site avec drill-down par site/contrat/matiere depuis l'UI Angular.
  4. Le dashboard HSE (DSH-04) affiche les KPI incidents, taux frequence, conformite en tiles temps reel.
  5. Au moins 5 `alert_rule` rows existent en base apres migration (stockpile threshold, spare part low, HSE severity≥4, explosifs gap, fuel anomaly) et le moteur d'alertes les evalue sans config manuelle.
**Plans**: 2 plans
Plans:
- [x] 07-01-PLAN.md --- Backend: cost writers + @Cron aggregator + alert_rule seed (2026-05-16)
- [x] 07-02-PLAN.md --- Frontend: Finance/HSE tiles + Group consolidation page
**UI hint**: yes

### Phase 8: Operational Alerts Closure
**Goal**: Les alertes preventive-maintenance et spare-parts se declenchent automatiquement — fin du silence operationnel. Wiring closure seulement, les entites et services existent deja depuis Phase 3.
**Depends on**: Phase 7 (alert_rule seed migration must land first so handlers have rules to match)
**Requirements**: ALT-01, ALT-02
**Success Criteria** (what must be TRUE):
  1. Quand l'intervalle PM d'un equipement est franchi (heures moteur, km, ou date calendaire), un `WorkOrder` apparait automatiquement dans l'inbox maintenance sans action humaine — verifiable en avancant l'horloge ou en forcant un compteur.
  2. Quand un mouvement de stock fait passer une `spare_part` sous son seuil min, une alerte `maintenance.spare_part.threshold_crossed` est emise et visible dans l'inbox alertes du Chef Maintenance.
  3. Les deux jobs s'executent sur le scheduler @Cron NestJS sans crash sur 24h continues (observable dans Grafana / logs).
**Plans**: 3 plans
Plans:
- [x] 08-W1-P01-PLAN.md --- Equipment meter denormalization + event-driven updaters (hour/km columns, backfill, MeterUpdateHandler)
- [x] 08-W1-P02-PLAN.md --- Spare-part threshold event flow (payload enrichment, recovery event, AlertsEventHandler subscribers)
- [x] 08-W2-P01-PLAN.md --- PreventiveMaintenanceSchedulerJob @Cron + findOpen idempotency + alert_rule seed

### Phase 9: Notification Delivery
**Goal**: Les alertes arrivent aux bons destinataires par email et SMS, avec retry/backoff et badge in-app — fin des stubs `logger.log()` dans `AlertDispatcherService`.
**Depends on**: Phase 8 (alerts must fire before delivery matters — otherwise nothing to dispatch)
**Requirements**: NTF-01, NTF-02, NTF-03
**Success Criteria** (what must be TRUE):
  1. Toute alerte declenchee par `alert_rule` envoie un email reel via Brevo au(x) destinataire(s) configure(s) — verifiable dans la Brevo dashboard ou la boite de reception du destinataire de test.
  2. Une alerte de severity ≥ `high` declenche un SMS reel via Twilio au responsable site — verifiable dans Twilio logs ou sur le telephone de test.
  3. `AlertDispatcherService` n'appelle plus aucun `logger.log()` stub pour la livraison : tous les envois passent par BullMQ avec retry exponentiel (3 tentatives min) et dead-letter queue.
  4. Un utilisateur connecte voit un badge de notifications non-lues dans le header Angular qui decrement quand il clique l'alerte.
**Plans**: 1 plan
Plans:
- [x] 09-W1-P01-PLAN.md --- NotificationModule + BullMQ + Brevo + Twilio + AlertDispatcher refactor + in-app badge (2026-05-17)
**UI hint**: yes

## Deferred (v2)

### Phase 6: Hardening, Scale & Multi-Country Rollout
**Goal**: Le systeme est pret a scaler du premier pays production-tested vers un second pays/site, avec pen-test, drills, et capacites multi-region.
**Requirements**: HRD-01..08, EXP-01..04, SST-01..02 (v2 only)
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Finance Real | 2/2 | Complete   | 2026-05-16 |
| 8. Operational Alerts Closure | 3/3 | Complete | 2026-05-17 |
| 9. Notification Delivery | 1/1 | Complete | 2026-05-17 |

**v1.1 status:** all 3 phases complete. Ready for milestone close + v1.2 planning.

## Known Tech Debt (from v1.0 audit, deferred to v1.1)

| ID | Gap | Effort | Priority | Addressed in |
|---|---|---|---|---|
| FND-07 | Money 3-representation ledger (amount_original / site_functional / group) | 1-2d | P2 | Deferred v1.2 |
| MNT-02 | Preventive maintenance @Cron scheduler | 3h | P2 | Phase 8 (ALT-01) |
| MNT-04 | spare_part.threshold_crossed alert handler | 2h | P2 | Phase 8 (ALT-02) |
| Phase 4 | 4/7 cost components hardcoded to 0n, alert_rule not seeded, email/SMS stubs | 1-2d | P2 | Phase 7 + Phase 9 |
| i18n AR | Arabic locale absent from web + mobile (backend ready) | 4h | P3 | Deferred v1.2 |
| IOT-01/02/03 | MQTT broker + edge gateway + Teltonika adapter (backend only today) | 2-3w | DEFER v2 | Phase 6 |
| DSH-05 | Dashboard groupe consolidé (Finance group-level) | 1d | P2 | Phase 7 (FIN-R03) |
| Mobile | Maintenance + Ventes screens are 19-line placeholder shells | 2d | P2 | Deferred v1.2 |

---
*Roadmap created: 2026-05-12*
*v1.0 archived: 2026-05-16*
*v1.1 phases drafted: 2026-05-16*
