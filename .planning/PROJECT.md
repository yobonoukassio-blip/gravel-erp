# Gravel Ivoire — ERP Carrière de Granite

## What This Is

Plateforme ERP spécialisée pour exploitants de carrières de granite, opérant en mode multi-site et multi-pays. L'application digitalise et pilote toute la chaîne opérationnelle d'une carrière — de l'exploration géologique à la vente/expédition — en passant par la foration, le tir de mine, l'extraction, le concassage, le criblage, le stockage, la maintenance des engins, le HSE, les RH et le contrôle de gestion. Destinée à la Direction Groupe, aux Directeurs de site, Chefs Carrière, équipes Maintenance, HSE et Finance.

## Core Value

Donner à un groupe minier (Gravel Ivoire) une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Gestion multi-site / multi-pays / multi-devise / multi-langue
- [ ] Référentiel sites (carrières, zones de production, bancs, GPS, permis)
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
- [ ] Application mobile Android/iOS pour saisie terrain
- [ ] Mode offline avec synchronisation différée
- [ ] Gestion fine des rôles et permissions par profil / site
- [ ] Alertes et notifications opérationnelles
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
| Architecture microservices multi-tenant | Multi-site/multi-pays exige isolation logique forte + scalabilité indépendante par module | — Pending |
| PostgreSQL comme SGBD principal | Open-source mature, géospatial (PostGIS) pour cartographie carrières, réplication éprouvée | — Pending |
| Mobile Flutter | Cible Android/iOS depuis un codebase unique ; perf native acceptable pour saisie terrain | — Pending |
| Synchronisation offline-first sur mobile | Connectivité non garantie sur sites miniers reculés | — Pending |
| Transformation aval reportée hors MVP | Optionnelle dans le draft, complexité usine ≠ carrière, à isoler pour V2 | — Pending |
| Paie complète hors MVP | SIRH dédiés existent ; ERP fournira export vers paie tierce | — Pending |

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

---
*Last updated: 2026-05-12 after initialization*
