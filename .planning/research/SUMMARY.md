# Project Research Summary

**Project:** Gravel Ivoire — ERP Carrière de Granite
**Domain:** Mining / Quarry ERP — multi-site, multi-country (West Africa / OHADA), offline-first mobile, IoT-enabled
**Researched:** 2026-05-12
**Confidence:** HIGH on stack, architecture and pitfalls; MEDIUM on West-Africa-specific operational/regulatory specifics that must be validated with real Gravel Ivoire stakeholders.

## Executive Summary

Gravel Ivoire is a hybrid product: il doit combiner la profondeur opérationnelle des suites minières (Maptek/Micromine/Hexagon pour drill/blast/extraction/télémétrie) avec l'épine commerciale des ERP aggregate (Herbst/Fast-Weigh/SAZS pour pesage, BL, facturation, stockpile), et superposer une expérience native Afrique de l'Ouest (comptabilité analytique OHADA, multi-devise XOF/EUR/USD, bilingue FR+EN, traçabilité explosifs conforme par pays, offline-first mobile qui survit à la connectivité réelle des sites reculés). Aucun produit existant ne couvre nativement cette combinaison — ce trou est le différenciateur structurel.

L'approche recommandée est un **monolithe modulaire** en **NestJS 11 / Node 24 / PostgreSQL 18 (PostGIS + TimescaleDB)** avec un client mobile **Flutter + PowerSync + Drift**, un web **Angular 20**, et l'identité **Keycloak 26** — en extrayant des microservices uniquement le long des bounded contexts qui prouvent des profils de scaling différents (ingestion IoT, sync, finance/analytics). Le multi-tenant est appliqué au niveau base via **PostgreSQL Row-Level Security** avec RBAC site-scopé propagé depuis le JWT, jamais via filtres applicatifs seuls. Les domaines terrain (tirs de mine, incidents HSE, BL pesage, ravitaillements) sont modélisés en événements append-only ; stockpile et carburant en grands livres event-sourced ; la résolution de conflit sync est par-entité, pas globale.

Les risques majeurs sont **réglementaires** (immuabilité des plans de tir et registre explosifs au numéro de série ; discipline OHADA — analytique uniquement, jamais comptabilité générale), **intégrité données** (arrondi multi-devise avec XOF sans décimale ; perte silencieuse de données via LWW offline ; fuites cross-tenant ; lectures IoT prises pour vérité sans couche sanity), et **adoption** (opérateurs terrain faiblement lettrés exigent UX icône-first, gants/soleil, co-conçue avec vrais utilisateurs — pas formulaires texte FR). Tous adressables si conçus dès le jour 1 de la phase concernée ; les rétrofiter est un rewrite.

## Key Findings

### Recommended Stack
Voir [STACK.md](./STACK.md). Opinionated, biais TypeScript over JVM, OSS auto-hébergé over SaaS-lock, composants commerciaux uniquement où le risque de réinvention est inacceptable.

**Core technologies:**
- **NestJS 11 (Node 24 LTS)** — DI modulaire mappe proprement les bounded contexts ERP ; pool de talents TS > Spring Boot en Afrique de l'Ouest
- **PostgreSQL 18 + PostGIS 3.5 + TimescaleDB** — une seule famille Postgres couvre OLTP + geospatial + IoT time-series, pas de double ops DB
- **Flutter 3.35+ + PowerSync + Drift + Riverpod** — offline-first sur Android rugged bon marché ; PowerSync préféré à Electric (maturité) et au sync maison (>6 mois ingénierie gaspillés)
- **Angular 20 + Material + AG Grid Enterprise + Formly + Transloco** — forme ERP (forms-heavy, large grids, longue vie) où la structure Angular est un atout
- **Keycloak 26** — OIDC auto-hébergé, realm par pays, group-claim pour RBAC site ; évite l'économie d'unité Auth0 et les problèmes data-residency
- **EMQX 5 → Redpanda → TimescaleDB** — pipeline IoT lambda standard ; passerelle edge buffer quand WAN tombe
- **Grafana LGTM + OpenTelemetry + OpenTofu + ArgoCD sur EKS** — observabilité et GitOps auto-hébergés ; OpenTofu pour raison de licence
- **dinero.js + date-fns-tz** — minor units entiers (XOF=0, EUR=2), IANA timezone par site — non-négociable pour intégrité OHADA

### Expected Features
Voir [FEATURES.md](./FEATURES.md). Chaîne granulats complète (foration → tir → extraction → transport → concassage → criblage → stockage → pesage → BL → facturation) + maintenance, carburant, HSE, RH light, finance analytique. Les anti-features doivent être explicitement refusées, pas poliment reportées.

**Must have (table stakes):**
- Foundation multi-site/multi-pays/multi-devise/RBAC/audit/i18n FR-EN
- Foration + Tir de mine (registre explosifs régulé) + Extraction + Transport
- Concassage + Criblage + Stockpile (event-sourced)
- Pesage + BL numérique + signature + Ventes + Facturation
- Maintenance préventive/corrective + Carburant (ratio L/h)
- HSE (incidents, EPI, habilitations) + RH light (pointage, habilitations, sous-traitants)
- Coût/tonne + Dashboards site + groupe consolidés
- Mobile Android offline-first + sync + alertes

**Should have (différenciateurs compétitifs):**
- Offline-first natif sur toute la chaîne — aucun concurrent ne le fait sérieusement
- Multi-pays OHADA + multi-devise CFA/EUR/USD + consolidation quasi-temps réel
- Registre explosifs conforme réglementations locales par pays
- Pesage offline avec génération BL hors connexion
- Intégration télématique ouverte (Teltonika/Concox/Ruptela) — pas de vendor lock-in
- Sous-traitants first-class
- Mobile robuste sur Android entrée de gamme (gants, soleil, poussière)

**Defer (v2+):**
- Comptabilité générale réglementaire (export Sage/SYSCOHADA uniquement)
- Paie complète (export vers SIRH)
- Transformation aval (découpe, polissage, dalles)
- Maintenance prédictive IA / vision IA / digital twin / drone / mine planning 3D
- Marketplace B2B, blockchain, chat interne, LMS HSE

### Architecture Approach
Voir [ARCHITECTURE.md](./ARCHITECTURE.md). Monolithe modulaire autour de bounded contexts avec chemin strangler clair ; API gateway avec JWT-driven tenant+site context ; schemas Postgres par contexte avec RLS ; bus d'événements Kafka/Redpanda ; passerelle MQTT edge par carrière ; plan analytique CDC-driven (Debezium → S3 → ClickHouse → dbt → BI) jamais requêté depuis services opérationnels. La résolution conflit sync est par-entité (append-only pour captures terrain, livres event-sourced pour stockpile/carburant, check-out pessimiste pour plans, LWW uniquement pour master data non critique).

**Major components:**
1. API Gateway + Identity (Kong/Traefik + Keycloak)
2. Master Data service (sites, équipements, matériaux, permis, GPS) — PostGIS-backed, load-bearing
3. Production bounded contexts (foration, tir, extraction, transport, concassage, criblage)
4. Inventory & Stockpile (event-sourced ledger) — point d'intégration extraction ↔ ventes
5. Sales & Shipping (pesage, BL, contrats, facturation, export douanes)
6. Maintenance, Fuel & Energy, HSE, HR/Time
7. Finance / Cost-to-tonne — analytique uniquement ; adaptateurs d'export
8. Sync service — détient la politique de conflit par-entité
9. IoT ingestion (EMQX edge → Kafka → TimescaleDB + S3 cold)
10. Analytics plane (Debezium CDC → S3 → ClickHouse → dbt → Metabase/Superset)

### Critical Pitfalls
Voir [PITFALLS.md](./PITFALLS.md).

1. **Plans de tir et registre explosifs modelés en rows mutables** — doivent être événements append-only avec snapshots PDF signés HSE, content-hashed en object storage ; détonateurs trackés au numéro de série ; réconciliation quotidienne bloquante.
2. **Sync offline LWW naïf** — entity-type-aware : append-only pour captures terrain, deltas event-sourced pour stockpile/carburant, locks pessimistes pour plans, LWW uniquement pour préférences UI. Pas de `device.now()` dans l'ordering. Chaos test en CI.
3. **Multi-devise sans discipline FX & arrondi** — money en `bigint` minor units avec scale par devise ; trois montants par transaction (origine/site-functional/group-reporting) ; taux FX immuables référencés par ID.
4. **Scope creep vers SYSCOHADA complet** — codifier la frontière analytique-uniquement dans le data model ; construire adaptateurs d'export certifiés (Sage 100/X3, Ciel, Odoo CI) ; engager expert-comptable OHADA tôt ; page "non-objectifs" visible.
5. **Fuites cross-tenant** — défense en profondeur : RLS PostgreSQL au niveau DB, scoping ORM app, JWT-driven context gateway ; test d'isolation cross-tenant en CI pour chaque table ; accès BI uniquement via read-replicas RLS-aware.
6. **Données IoT prises pour vérité** — modèle 3 couches (raw/validated/business) ; règles sanity par capteur ; dashboard santé capteurs séparé des KPI production ; données manquantes explicites, jamais zéro silencieux ; réconciliation quotidienne pesage ↔ cycles camions ↔ stockpile.
7. **Défauts chain-of-custody HSE** — append-only avec chaîne de hash ; photos en object storage immuable content-addressed SHA-256 ; queries "as-of" temporel pour habilitations et maintenance ; export PDF avec timestamp RFC-3161.
8. **Échec d'adoption opérateurs terrain faiblement lettrés** — UI icône-first, testée gants/soleil, voice prompts FR + lingua franca locale, co-design avec 3 opérateurs réels avant production code ; field champion par site pilote 90 jours post-launch.
9. **Modèle jour/shift** — `OperationalDay` entité first-class par site (`shift_start_local`, IANA TZ) ; reports queryent par `operational_day_id`, jamais `created_at` brut ; test DST-crossing en CI.

## Implications for Roadmap

Six phases, ordonnées de sorte que les fondations load-bearing précèdent les modules métier, qu'une tranche verticale étroite valide le modèle avant que le scope ne s'étende, et que analytics + IoT + consolidation soient déférés jusqu'à stabilité des schémas opérationnels.

### Phase 1 — Foundation (Tenancy, Sync, Master Data, Mobile Shell)
**Rationale:** RLS multi-tenant, framework sync, audit trail, money model, operational-day, identité Keycloak sont load-bearing pour chaque module aval. Rétrofiter l'un d'eux est un rewrite. Pitfalls #3, #5, #9 doivent être résolus ici.
**Delivers:** Squelette monolithe modulaire ; realm Keycloak + JWT tenant/site context ; PostgreSQL RLS avec test cross-tenant en CI sur chaque table ; squelette service sync (PowerSync + Drift) avec framework conflict-policy et chaos harness ; Master Data avec PostGIS ; money model ; `OperationalDay`/`Shift` ; framework audit ; i18n FR/EN ; shell mobile + une feature round-trip (journal activité quotidien) ; observabilité OTel → Grafana LGTM.
**Avoids:** Pitfalls #3, #4, #5, #9 ; sème la discipline pour #1, #6, #7.

### Phase 2 — Narrow Vertical Slice (Foration → Extraction → Transport → Stockpile → Carburant → HSE → Dashboard Site)
**Rationale:** Valide sync offline, bus d'événements, pattern dashboard, et tenancy sur sous-ensemble gérable mais réel. Tire la chaîne opérationnelle de plus haute valeur (capture → stockpile → visibilité coût) + pilier HSE. Diffère tir/explosifs, sales complet, finance, IoT.
**Delivers:** Foration (mobile offline), Extraction, Transport avec intégration pesage (offline-capable), grand livre Stockpile event-sourced, Carburant & Énergie, incidents HSE avec log événements append-only et chain-of-custody photos, dashboard site temps réel.
**Implements:** Patterns 1 (monolithe modulaire), 2 (sync per-entity), 4 (RLS), 5 (stockpile event-sourced).
**Avoids:** Pitfalls #2, #6 (sanity pesage dès jour 1), #7, #8.

### Phase 3 — Operational Completeness (Tir, Concassage/Criblage, Maintenance, RH, Ventes & Expédition)
**Rationale:** Extension à la chaîne complète. Tir/explosifs reçoit focus dédié pour immuabilité réglementaire. Sales/shipping en fin de phase car douanes + OHADA-export bénéficient de données opérationnelles déjà flowing.
**Delivers:** Tir de mine + registre explosifs (append-only, détonateurs au numéro de série, réconciliation quotidienne bloquante, export réglementaire par pays) ; saga HSE clearance pour gate tir ; Concassage + Criblage ; CMMS Maintenance ; RH light (pointage, validité temporelle habilitations, sous-traitants) ; Ventes & Expédition (clients, contrats, BL multi-devise, adaptateurs douane par pays).
**Avoids:** Pitfall #1 (immuabilité tir), #7 (validité temporelle habilitations).

### Phase 4 — Analytics, Consolidation & Export Finance
**Rationale:** Construire le plan analytique uniquement une fois les schémas opérationnels stabilisés — dbt contre schémas instables est gaspillage.
**Delivers:** Debezium CDC ; data lake S3 Parquet ; warehouse ClickHouse ; dbt models incluant coût-par-tonne ; conversion multi-devise au niveau sémantique ; dashboard exec groupe ; adaptateurs export vers Sage 100/X3 / Ciel / Odoo CI ; frontière OHADA analytique-vs-statutaire explicitement appliquée ; rapports fisc/Mines self-service par pays.
**Avoids:** Pitfall #4 à la consolidation, #5 (BI cross-tenant via read-replicas RLS-aware), patrouille continue #4 anti-scope-creep.

### Phase 5 — Intégration IoT
**Rationale:** Déféré jusqu'à baseline manuel capturé et schémas opérationnels stables.
**Delivers:** Passerelle edge (Docker sur NUC rugged/CM4 par site) ; EMQX + Redpanda Edge + MirrorMaker ; Kafka central + stream processors ; TimescaleDB hot + S3 cold ; ingestion télématique (Teltonika/Concox/Ruptela) ; automatisation capteurs carburant ; monitoring vibration/tir ; dashboard santé capteurs ; rapports réconciliation quotidiens.
**Avoids:** Pitfall #6 (modèle sanity 3 couches dès jour 1).

### Phase 6 — Hardening, Scale & Rollout Multi-Pays
**Rationale:** Un pays en prod, hardenir pour scale et rollout au second pays/site.
**Delivers:** Chemin d'upgrade DB par tenant pour clients VIP ; réplicas multi-région (Abidjan + Dakar) ; realms Keycloak par pays ; RBAC avancé (délégation, accès temporaire) ; pen-test et SOC2-readiness ; drills restore ; SMS multi-fournisseur (Africa's Talking) ; app iOS si demandée ; sous-traitants avancé ; portail client privé.

### Phase Ordering Rationale
- **Ordering Phase 1 → 2 dicté par dépendances :** RLS, sync, money, operational-day, master data sont référencés par chaque module.
- **Tranche verticale (Phase 2) avant breadth (Phase 3) dé-risque le modèle :** expose les défauts archi quand surface est petite.
- **Sales/finance fin de Phase 3** bénéficie de données opérationnelles flowing + feedback expert-comptable.
- **Analytics (Phase 4) déféré** car dbt contre schémas instables est rework.
- **IoT (Phase 5) déféré** car saisie manuelle doit fonctionner comme fallback de toute façon ; logistique field-install est lente.
- **Phase 6 last** — multi-pays et upgrade DB bénéficient d'un pays production-tested d'abord.

### Research Flags
**Needs research (`/gsd:research-phase`):**
- **Phase 2:** protocole intégration pont-bascule (RS232/RS485/TCP/Modbus varie par site) ; matrice test devices Android rugged ; protocole co-design avec opérateurs réels.
- **Phase 3:** réglementation explosifs par pays (CI confirmé ; Sénégal/Mali/Burkina/Guinée par-country at onboarding) ; intégration vendeur détonateur (Davey Bickford vs Orica) ; templates export douanes OHADA (UEMOA/ECOWAS/TradeNet).
- **Phase 4:** formats export fiscal OHADA par pays (Sage 100 vs X3 vs Ciel vs Odoo CI — valider avec expert-comptable Gravel Ivoire) ; specs FEC-equivalent.
- **Phase 5:** vendeur télématique (disponibilité Teltonika/Concox/Ruptela en CI) ; vendeur capteur carburant (Technoton/Eurosens/Veeder-Root) ; télémétrie OEM moteur (Caterpillar/Komatsu/Volvo/Liebherr) selon flotte réelle.

**Standard patterns (lighter research):**
- **Phase 1:** RLS multi-tenancy, OIDC/Keycloak, OTel→LGTM — patterns manuel avec strong refs.
- **Phase 6:** Postgres logical replication, ArgoCD GitOps, upgrades DB per-tenant — bien battus.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions à jour 2025-26. MEDIUM sur TimescaleDB-sur-PG18 (vérifier à install) ; LOW sur OSS OHADA accounting (pas de lib OSS largement adoptée). |
| Features | MEDIUM-HIGH | HIGH sur périmètre quarry/aggregate standard ; MEDIUM sur nuance West-Africa — valider terrain avec direction Gravel Ivoire. |
| Architecture | HIGH | Patterns bien documentés (monolithe modulaire → strangler, sync offline per-entity, lambda IoT, RLS multi-tenancy, analytics CDC). |
| Pitfalls | HIGH sur technical pitfalls (modes échec bien documentés) ; MEDIUM sur traps fiscaux OHADA (régulation évolue par pays) ; LOW sur UX langue locale (besoin recherche opérateur réel). |

**Overall confidence:** HIGH pour procéder à la création du roadmap.

### Gaps to Address
- **Co-design utilisateur réel avec 3 opérateurs terrain** avant production code Phase 2 — sprint co-design 2 semaines au kick-off Phase 2.
- **Cible export OHADA par pays** — résoudre avec cabinet expert-comptable Gravel Ivoire avant travail sales/finance Phase 3 ; engager advisor tôt.
- **Sélection vendeur télématique en CI** — pinner durant planning Phase 5, pas avant.
- **Intégration vendeur détonateur électronique** — résoudre durant recherche tir Phase 3.
- **Profil connectivité par site pilote** — capturer durant onboarding du premier site en Phase 1 ; façonne budget payload sync et sizing passerelle edge.
- **Compatibilité TimescaleDB ↔ PG18** — vérifier à install ; fallback PG17 si Timescale lag.
- **Composition flotte OEM moteur** — drive choix télémétrie-OEM Phase 5.
- **Cibles multi-devise au-delà UEMOA** (ZAR/NGN/GHS) — confirmer liste réaliste expansion pays.

## Sources

### Primary (HIGH)
- PostgreSQL 18 release notes ; Crunchy Data PostGIS 2025 ; AWS prescriptive guidance Postgres RLS
- NestJS 11 release (Trilon) ; Node.js endoflife schedule
- Flutter 3.27+ blog ; PowerSync + Drift docs ; Keycloak 26 docs
- EMQX → TimescaleDB integration ; Grafana LGTM observability guide
- Hexagon Mining / Sandvik / MICROMINE white papers ; Pitram profile
- Herbst, Fast-Weigh, WeighPay, Access Weighsoft, QuarryLink, SMSTurbo, BulkSource, SAZS — docs features
- OHADA Acte uniforme Plan Comptable révisé (2017) ; Code minier CI (Loi 2014-138)
- BCEAO regulations on XOF ; ISO 45001 HSE record integrity
- Kleppmann, "Designing Data-Intensive Applications"

### Secondary (MEDIUM)
- PowerSync vs ElectricSQL vs Zero (vendor + indépendant)
- Benchmarks local-DB Flutter (Drift vs Isar)
- Keycloak vs Ory vs Auth0 2026 ; React vs Angular enterprise ; OpenTofu vs Terraform vs Pulumi 2026
- Vendor docs : Mettler Toledo IND, Technoton, Davey Bickford DaveyTronic, Orica i-kon
- Pit & Quarry, Agg-Net, scmGalaxy, Highways Today — reporting domaine
- SAP Mining, Pitram, MineSight post-mortems rollout

### Tertiary (LOW — valider au moment de la phase)
- Specifics OHADA fiscal export par pays
- Hypothèses voice-UX langue locale (Dioula / Baoulé)
- Quirks intégration vendeur IoT (dépend matériel réellement acheté)
