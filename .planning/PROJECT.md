# Gravel Ivoire — ERP Carrière de Granite

## What This Is

Plateforme ERP spécialisée pour exploitants de carrières de granite, opérant en mode multi-site et multi-pays. L'application digitalise et pilote toute la chaîne opérationnelle d'une carrière — de l'exploration géologique à la vente/expédition — en passant par la foration, le tir de mine, l'extraction, le concassage, le criblage, le stockage, la maintenance des engins, le HSE, les RH et le contrôle de gestion. Destinée à la Direction Groupe, aux Directeurs de site, Chefs Carrière, équipes Maintenance, HSE et Finance.

## Core Value

Donner à un groupe minier (Gravel Ivoire) une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.

## Requirements

### Validated

- ✓ Gestion multi-site / multi-pays / multi-devise / multi-langue — Phase 1 (FND-01, FND-07, FND-09 ; RLS + Keycloak realm `gravel-dev` + dinero.js v2 + Transloco/ARB codegen)
- ✓ Référentiel sites (carrières, zones de production, bancs, GPS, permis) — Phase 1 (FND-04, FND-05 ; PostGIS GeoJSON + master-data CRUD + Leaflet pickers + soft-delete)
- ✓ Mode offline avec synchronisation différée — Phase 1 (FND-10, FND-11 ; PowerSync + Drift + ConflictRegistry + chaos spec GREEN)
- ✓ Gestion fine des rôles et permissions par profil / site — Phase 1 (FND-03 ; 7 rôles + SiteScopeGuard + groupScope + RBAC matrix tests)
- ✓ Application mobile Android pour saisie terrain — Phase 1 (Flutter 3.35 + Riverpod + flutter_appauth + Android Keystore)
- ✓ Audit trail immuable — Phase 1 (FND-02, FND-06 ; RLS forcée + chain-of-hash sha256 per-(tenant,table) + REVOKE UPDATE/DELETE)

### Active

- [ ] Module Foration (plans, GPS trous, profondeur/diamètre/inclinaison, conso gasoil, opérateurs, machines)
- [ ] Module Tir de mine (chargement explosifs, plans tir, validation HSE, historique, contrôle vibrations/fragmentation)
- [ ] Module Extraction / Excavation (rendement pelles/chargeuses, opérateurs, temps d'arrêt)
- [ ] Module Transport interne (tracking GPS flotte, rotations, pesage, temps de cycle, dispatching)
- [ ] Module Concassage (tonnages, performance, énergie, alarmes maintenance)
- [ ] Module Criblage / Classification (calibres, qualité, non-conformités)
- [ ] Module Stockage (inventaire temps réel, localisation, alertes seuils, valorisation)
- [ ] Module Vente & Expédition (CRM, contrats, BL, facturation multi-devise, transporteurs, export/douane)
- [ ] Module Maintenance équipements (préventive/corrective, pièces de rechange, disponibilité, historique pannes)
- [ ] Module Carburant & Énergie (cuves, ravitaillements, anomalies, conso électrique)
- [ ] Module HSE (incidents/accidents, EPI, audits, actions correctives, formations sécurité)
- [ ] Module RH (employés, pointage, rotations, sous-traitants, habilitations)
- [ ] Module Finance / Contrôle de gestion (coût/tonne, rentabilité par site, budget, consolidation multi-pays, comptabilité analytique)
- [ ] Dashboards temps réel + KPIs Production / Finance / HSE
- [ ] Reporting consolidé groupe
- [ ] Application mobile iOS pour saisie terrain (Android livré Phase 1)
- ✓ Alertes et notifications opérationnelles — Phase 9 (NTF-01, NTF-02, NTF-03 ; BullMQ queue + Brevo email + Twilio SMS + Angular badge)
- [ ] Intégration GPS/télématique flotte et capteurs carburant (IoT)

### Out of Scope

- Transformation aval avancée (découpe/polissage/pavés/dalles) — marqué optionnel dans le draft, non prioritaire pour Gravel Ivoire au lancement
- Maintenance prédictive IA, vision IA contrôle qualité, Digital Twin, analyse drone, cartographie 3D — listés comme évolutions futures, post-MVP
- Paie complète intégrée — optionnel dans le draft, sera externalisée à un SIRH dédié pour V1
- Comptabilité générale réglementaire complète — l'ERP fournit la comptabilité analytique et l'export vers les logiciels comptables locaux (Sage, etc.) plutôt que de remplacer un logiciel comptable certifié

## Context

- **Domaine** : industrie minière / carrière de granite (extraction, granulats, blocs). Opérations souvent en zones reculées avec connectivité intermittente — d'où l'exigence forte d'offline-first sur les modules terrain.
- **Géographie** : démarrage Côte d'Ivoire, conception multi-pays dès le départ (Afrique de l'Ouest probable : franc CFA, fiscalité OHADA, langues FR/EN).
- **Profils utilisateurs cibles** : Direction Groupe (vue consolidée), Directeur Site (pilotage opérationnel), Chef Carrière (forage/tir/extraction), Maintenance (interventions/pièces), HSE (sécurité/conformité), Finance (coûts/facturation/reporting).
- **Chaîne opérationnelle complète documentée** dans le draft initial : 14 étapes de l'exploration à l'expédition + maintenance + carburant + HSE + RH + finance.
- **Sources de données externes** envisagées : capteurs IoT carburant, GPS télématique flotte, balances de pesage, équipements de mesure de vibration de tir.

## Constraints

- **Architecture** : backend microservices multi-tenant ; obligation de synchronisation offline pour le mobile terrain.
- **Stack** : à arbitrer entre Node.js/NestJS et Java Spring Boot pour le backend ; React ou Angular pour le web ; Flutter privilégié pour le mobile (cohérence avec choix multi-plateformes).
- **Base de données** : PostgreSQL avec réplication multi-site, sauvegardes automatiques.
- **Infrastructure** : cloud hybride (AWS/Azure/GCP au choix), VPN sécurisé inter-sites.
- **Localisation** : multi-devise, multi-langue, fiscalité et réglementation locales — impact direct sur les modules Vente, Finance et HSE.
- **Sécurité** : données sensibles (explosifs, incidents accidents, financier consolidé) — RBAC fin, audit trail, chiffrement au repos et en transit.
- **Performance terrain** : saisie mobile doit rester fluide hors-ligne sur appareils Android d'entrée de gamme robustes.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Architecture modular monolith (NestJS 11) au lieu de microservices | Talent pool TS West Africa + ops simplifié ; split par bounded context quand la charge l'exige (ADR Phase 6) | ✓ Phase 1 |
| PostgreSQL 18 + PostGIS 3.5 + TimescaleDB | Géospatial (carrières, permits, GPS), time-series IoT, RLS pour multi-tenant | ✓ Phase 1 |
| Mobile Flutter 3.35 + PowerSync + Drift | Codebase unique, perf Impeller sur low-end Android, sync engine production-grade vs reinventing | ✓ Phase 1 |
| Sync offline-first via NestJS proxy (D-10) | RLS + validation + audit dans un seul funnel ; PowerSync = pull/replication uniquement | ✓ Phase 1 |
| Defense-in-depth multi-tenant 3-couches (D-07) | RLS DB + TenantAwareRepository ORM + JWT→CLS→GUC middleware ; chacune défaillit-fermée | ✓ Phase 1 (ADR-0001) |
| Audit chain-of-hash per-(tenant_id, table_name) | Évite global-lock pitfall ; tenants/tables concurrents ne contentent pas | ✓ Phase 1 (ADR-0004) |
| Money en bigint minor units + dinero.js v2 | XOF=0 / EUR=2 décimales ; banker's rounding ; aucun float ; lint + grep gates BLOCKING | ✓ Phase 1 (FND-07) |
| OperationalDay comme entité first-class | Reports interrogent `operational_day_id`, JAMAIS `created_at::date` (D-20 lint gate) | ✓ Phase 1 (ADR-0003) |
| Keycloak 26 single realm + groupes par site | Data residency OHADA self-host ; pas d'auth0 unit-economics ; realms par pays différé Phase 6 | ✓ Phase 1 (ADR-0005) |
| Angular 20 (pas React) | ERP forms-heavy + AG-Grid + Formly + grandes équipes plurianuelles : Angular = bonnes guardrails | ✓ Phase 1 |
| Soft-delete only sur master-data | Zero `@Delete` decorators ; PATCH /:id/archive partout ; visibilité opérationnelle préservée | ✓ Phase 1 |
| Transformation aval reportée hors MVP | Optionnelle dans le draft, complexité usine ≠ carrière, à isoler pour V2 | — Pending |
| Paie complète hors MVP | SIRH dédiés existent ; ERP fournira export vers paie tierce | — Pending |
| OTel + Grafana LGTM self-host (pas Datadog) | Coût IoT-heavy ingestion ; OSS souverain ; OTLP/HTTP unifié api/web/mobile | ✓ Phase 1 |

## Current State

Phases 8 and 9 complete (2026-05-17) — operational alerts now fire automatically (PM scheduler @Cron hourly + spare-part threshold subscribers writing to alert table), and notification delivery is fully wired (BullMQ → Brevo email + Twilio SMS + Angular in-app badge). All `logger.log()` stubs removed. Phase 8 + Phase 9 close the operational silence loop end-to-end. ALT-01, ALT-02, NTF-01, NTF-02, NTF-03 all satisfied. v1.1 milestone phases all complete (Phase 6 hardening/multi-country remains out-of-milestone next step).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

## Current State (v1.0 shipped)

**Version:** v1.0 tagged 2026-05-16
**Scope delivered:** Foundation + Production vertical slice + Operational completeness + Finance backend + IoT ingestion model
**Stats:** 5 phases, 23 plans, 237 commits, 828 files, 107k LOC
**Requirements:** 58/71 satisfied (13 deferred to v1.1 as known tech debt)
**Deploy:** Vercel (Angular web) + Railway (NestJS API) + Supabase (PostgreSQL)

## Current Milestone: v1.1 polish-and-gaps

**Goal:** Passer de "v1.0 code-complete" à "v1.1 production-ready" pour le premier client réel — Finance utilisable de bout en bout, alertes opérationnelles qui se déclenchent vraiment, et notifications email/SMS livrées (plus de `logger.log()` stubs).

**Started:** 2026-05-16
**Status:** Defining requirements

**Target features (80/20 — scope cut décidé) :**
- **Finance Real** — Finance UI utilisable (DSH-03/04/05/06) + 4/7 cost components avec vrais writers DI + @Cron daily aggregation. Sans ça, le dashboard Finance affiche `0` (déal-breaker démo client).
- **Operational Alerts Closure** — MNT-02 scheduler @Cron qui ouvre WorkOrder quand intervalle franchi, MNT-04 spare_part alert handler, alert_rule seed migration. Sans ça, les alertes ne se déclenchent jamais.
- **Notification Delivery** — BullMQ + provider email (Brevo) + provider SMS (Twilio), remplace les stubs `logger.log()`. Sans ça, les alertes sont silencieuses (invisible pour les ops).

**Explicitly deferred to v1.2/v2 :**
- FND-07 money 3-representation ledger (architectural, 1-2j refactor profond — non bloquant client)
- AR i18n web + mobile (FR/EN couvre les premiers clients CI/BF/ML)
- Mobile maintenance/ventes real screens (placeholder shells acceptables court terme)
- IoT MQTT pipeline IOT-01/02/03 (3 semaines infra — v2 Hardening)

**Key context:**
- v1.0 livré : 58/71 REQs satisfaits, 5 phases (1-5), 23 plans, 107k LOC
- Phase 6 réservée v2 Hardening
- v1.1 démarre à **phase 7** (continue numbering, preserve historique)

---
*Last updated: 2026-05-16 — v1.1 milestone started*
