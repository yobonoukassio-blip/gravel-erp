# Roadmap: Gravel Ivoire — ERP Carrière de Granite

**Defined:** 2026-05-12
**Granularity:** standard
**Phases:** 6
**Coverage:** 71/71 v1 requirements mapped

## Core Value

Donner à un groupe minier une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.

## Phases

- [ ] **Phase 1: Foundation** — Tenancy multi-tenant, sync offline-first, master data, audit, money model, mobile shell
- [ ] **Phase 2: Vertical Slice Production** — Foration → Extraction → Transport → Stockpile → Carburant → HSE → Dashboard site
- [ ] **Phase 3: Operational Completeness** — Tir/explosifs, Concassage, Criblage, Maintenance, RH, Ventes & Expédition
- [ ] **Phase 4: Analytics, Consolidation & Finance** — Coût/tonne, marge, budgets, export OHADA, dashboards groupe
- [ ] **Phase 5: IoT Integration** — Passerelle edge, télématique flotte, capteurs carburant, sanity 3 couches
- [ ] **Phase 6: Hardening, Scale & Multi-Country Rollout** — Pen-test, réplicas multi-région, realms par pays, drills restore (déféré v2)

## Phase Details

### Phase 1: Foundation
**Goal**: Les fondations multi-tenant load-bearing (identité, isolation, sync, master data, money, time) sont en place et testées, prêtes à porter chaque module métier sans rétrofit.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, FND-11
**Success Criteria** (what must be TRUE):
  1. Un administrateur tenant peut se connecter via Keycloak SSO (OIDC + MFA optionnelle) et créer un nouveau site avec timezone IANA, devise fonctionnelle, GPS et permis associés
  2. Un test cross-tenant en CI échoue immédiatement si un utilisateur du tenant A peut lire la moindre ligne du tenant B (RLS PostgreSQL appliqué sur chaque table)
  3. L'application mobile Android capture une donnée hors-ligne (journal d'activité quotidien), la persiste localement, puis la synchronise quand la connectivité revient — sans perte ni doublon
  4. Tout montant financier est stocké en bigint minor units avec sa devise (XOF=0 décimale, EUR=2) et un test DST-crossing sur OperationalDay passe en CI
  5. L'interface web et mobile basculent FR ↔ EN par utilisateur et chaque action utilisateur produit une entrée d'audit trail immuable (qui, quand, quoi, avant/après)
**Plans:** 6 plans across 4 waves (W0=P01, W1=P02, W2=P03+P04 parallel, W3=P05+P06 parallel)
  - [x] 01-W0-P01-PLAN.md (Wave 0) — Monorepo bootstrap, OpenTofu base infra, GitHub Actions CI 4-tier, Wave-0 test stubs covering FND-01..11
  - [x] 01-W1-P02-PLAN.md (Wave 1) — Data platform: RLS isolation, audit chain-of-hash, money helpers, OperationalDay + DST test (FND-02, FND-06, FND-07, FND-08)
  - [x] 01-W2-P03-PLAN.md (Wave 2) — Sync framework + mobile shell + journal activite round-trip + chaos harness (FND-10, FND-11)
  - [x] 01-W2-P04-PLAN.md (Wave 2) — Keycloak 26 realm-as-code + NestJS JWT/CLS guards + web/mobile auth + i18n FR/EN (FND-01, FND-03, FND-09)
  - [x] 01-W3-P05-PLAN.md (Wave 3) — Master Data CRUD UI: Site/Zone/Bench/Permit + activity-log read-only (FND-04, FND-05)
  - [x] 01-W3-P06-PLAN.md (Wave 3) — OTel + Grafana LGTM + CI gates BLOCKING + 5 ADRs (cross-cutting close-out)

### Phase 2: Vertical Slice Production
**Goal**: Une chaîne opérationnelle étroite mais réelle (foration → extraction → transport → stockpile → carburant → HSE) fonctionne en offline-first depuis le mobile terrain jusqu'au dashboard site, validant les patterns avant extension.
**Depends on**: Phase 1
**Requirements**: FOR-01, FOR-02, FOR-03, FOR-04, FOR-05, EXT-01, EXT-02, TRP-01, TRP-02, TRP-03, STK-01, STK-02, STK-03, CAR-01, CAR-02, CAR-03, CAR-04, HSE-01, HSE-02, HSE-03, HSE-04, HSE-05, HSE-06, DSH-01, DSH-02
**Success Criteria** (what must be TRUE):
  1. Un opérateur de foreuse saisit chaque trou foré sur mobile offline (GPS, profondeur, diamètre, opérateur, machine) et le rendement m/h apparaît dans le dashboard site une fois la sync passée
  2. Une rotation camion produit un ticket de pesée signé numériquement (génération offline supportée) qui crédite le stockpile event-sourced du calibre correspondant
  3. Le solde de chaque cuve carburant et de chaque stockpile est dérivé d'événements append-only, valorisé en devise site, avec alertes seuil bas/haut déclenchées automatiquement
  4. Un incident HSE est saisi en append-only avec photos en object storage immuable content-addressed (SHA-256), chaîne de hash vérifiable, et déclenche un workflow d'actions correctives suivi jusqu'à clôture
  5. Le KPI taux de fréquence accidents (TF) et les KPI production (tonnes jour/semaine/mois, rendement forage, temps d'arrêt) s'affichent en temps réel sur le dashboard Directeur Site et Chef Carrière
  6. Un ratio L/h anormal sur un engin déclenche une alerte exploitable (détection vol/fuite)
**Plans:** 8 plans across 4 waves (W0=P01, W1=P02+P03 parallel, W2=P04+P05 sequential, W3=P06+P07+P08 parallel)
  - [x] 02-W0-P01-PLAN.md (Wave 0) — Foundations: outbox + alerts + event-chain verifier + S3 Object Lock + Keycloak roles + i18n + 5 ADR drafts + co-design workshop (BLOCKING mobile)
  - [x] 02-W1-P02-PLAN.md (Wave 1) — Foration backend + web + mobile (FOR-01..05)
  - [x] 02-W1-P03-PLAN.md (Wave 1) — Extraction backend + web + mobile (EXT-01, EXT-02)
  - [x] 02-W2-P04-PLAN.md (Wave 2) — Transport + Pesage (TRP-01..03) + ADR-0009
  - [x] 02-W2-P05-PLAN.md (Wave 2) — Stockpile event-sourced + chain-of-hash + outbox consumer (STK-01..03) + ADR-0006
  - [x] 02-W3-P06-PLAN.md (Wave 3) — Carburant + Énergie (CAR-01..04) + ADR-0007
  - [x] 02-W3-P07-PLAN.md (Wave 3) — HSE (HSE-01, HSE-02, HSE-06 + deferred stubs HSE-03/04/05) + ADR-0008
  - [x] 02-W3-P08-PLAN.md (Wave 3) — Dashboards + Alertes + SSE (DSH-01, DSH-02) + ADR-0010
**UI hint**: yes

### Phase 3: Operational Completeness
**Goal**: La chaîne minière complète est couverte — tir de mine réglementé, traitement, maintenance, RH, ventes/expédition — incluant les exigences d'immuabilité réglementaire et les exports douane.
**Depends on**: Phase 2
**Requirements**: TIR-01, TIR-02, TIR-03, TIR-04, TIR-05, TIR-06, TIR-07, CON-01, CON-02, CRI-01, MNT-01, MNT-02, MNT-03, MNT-04, MNT-05, RH-01, RH-02, RH-03, RH-04, VTE-01, VTE-02, VTE-03, VTE-04, VTE-05, VTE-06
**Success Criteria** (what must be TRUE):
  1. Un plan de tir validé HSE est figé en événements append-only ; aucun chargement d'explosif n'est possible sans saga clearance HSE, et chaque détonateur est tracé par numéro de série de la réception à l'utilisation
  2. La clôture journalière échoue tant que la réconciliation explosifs entrée/sortie/stock présente le moindre écart, et le rapport de tir (fragmentation, vibration, incidents) est immuable
  3. Une intervention maintenance corrective ou préventive consomme des pièces de rechange (avec alerte seuil), enregistre temps d'arrêt et heures main d'œuvre, et la disponibilité MTBF/MTTR par équipement apparaît au dashboard maintenance
  4. Une habilitation employé (permis explosifs, conduite engin, formation HSE) est requêtable "as-of" à une date donnée et bloque l'affectation à un poste si expirée ; les sous-traitants sont gérés comme entités first-class avec leur personnel
  5. Un bon de livraison numérique signé client/chauffeur (généré offline si nécessaire) produit une facture multi-devise avec taux FX figé du jour, lié au contrat et au transporteur ; les ventes export attachent un dossier douane par pays
  6. Le tonnage entrant/sortant des concasseurs (primaire/secondaire) et la classification calibre + non-conformités au criblage alimentent automatiquement le stockpile event-sourced
**Plans:** 7 plans across 4 waves (W0=P01, W1=P02+P03 parallel, W2=P04+P05 parallel, W3=P06+P07 parallel)
  - [x] 03-W0-P01-PLAN.md (Wave 0) — RH module + habilitation as-of gate + operational_day.closure_blockers + i18n 6 namespaces + Keycloak 8 roles + EventChainVerifier +2 + 5 ADR drafts (RH-01..04, HSE-04) [BLOCKING]
  - [ ] 03-W1-P02-PLAN.md (Wave 1) — TIR module: explosives ledger append-only + detonator serial + blast plan saga + blast charge offline + reconciliation job (TIR-01..07)
  - [x] 03-W1-P03-PLAN.md (Wave 1) — Concassage + Criblage: crusher/screening sessions + outbox→stockpile consumers + web UI (CON-01, CON-02, CRI-01)
  - [ ] 03-W2-P04-PLAN.md (Wave 2) — Maintenance: equipment extension + PM plans + work orders + spare parts stock + MTBF/MTTR + mobile WO form (MNT-01..05)
  - [ ] 03-W2-P05-PLAN.md (Wave 2) — Ventes Part 1: customer + sale contract + BL offline dual-sign + STOCKPILE_OUTFLOW_SALE + customs dossier + FX snapshot (VTE-01..03, VTE-05, VTE-06)
  - [ ] 03-W3-P06-PLAN.md (Wave 3) — Ventes Part 2: invoice generation + FX freeze + dinero.js multi-currency + pre-flight validation + invoice UI (VTE-04)
  - [ ] 03-W3-P07-PLAN.md (Wave 3) — Dashboard extensions: MTBF/MTTR widget + TIR KPIs + VTE revenue widget + processing throughput + SSE +6 channels + ADR-0011..15 Accepted (MNT-05, DSH-02)
**UI hint**: yes

### Phase 4: Analytics, Consolidation & Finance
**Goal**: Le plan analytique consolidé groupe est en place — coût à la tonne, marge, budgets, exports OHADA vers comptabilité tierce — sans jamais devenir une comptabilité générale.
**Depends on**: Phase 3
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06, DSH-03, DSH-04, DSH-05, DSH-06
**Success Criteria** (what must be TRUE):
  1. La Direction Groupe consulte un dashboard consolidé multi-pays affichant P&L et marge en devise pivot (XOF ou EUR), avec drill-down jusqu'à un site, un contrat ou une matière
  2. Le coût direct par tonne par site et matière (extraction, transport, concassage, criblage, carburant, main d'œuvre, amortissement) se met à jour quotidiennement et se compare au budget annuel
  3. La marge par contrat / client / site est calculée en devise groupe avec conversion FX figée référencée par ID immuable
  4. Un export comptable analytique au format Sage / Ciel / Odoo CI (OHADA-conforme) est généré sur demande et accepté tel quel par l'expert-comptable
  5. Le moteur d'alertes notifie en temps réel (email/SMS/in-app) les seuils franchis, incidents critiques HSE et écarts explosifs, par profil et par site
  6. Les KPI Finance (coût/tonne, marge, conso carburant, coût maintenance) et HSE (incidents, TF, conformité audits) sont disponibles par profil utilisateur sur dashboard temps réel
**Plans**: TBD
**UI hint**: yes

### Phase 5: IoT Integration
**Goal**: Les flux IoT (télématique flotte, capteurs carburant, équipements) automatisent et fiabilisent la saisie manuelle sans jamais la remplacer aveuglément, via une couche sanity explicite.
**Depends on**: Phase 4
**Requirements**: IOT-01, IOT-02, IOT-03, IOT-04
**Success Criteria** (what must be TRUE):
  1. Une passerelle edge déployée par site reçoit les flux MQTT et bufferise jusqu'à 7 jours en cas de coupure WAN, puis livre sans perte au cluster central à la reconnexion
  2. La télématique flotte ingère position GPS, vitesse et état moteur des camions/engins ; la consommation capteur carburant est rapprochée automatiquement avec les saisies manuelles de ravitaillement
  3. Toute donnée IoT traverse un modèle 3 couches (raw → validated → business) avec data_quality_flag explicite ; les KPI production excluent les lectures invalides au lieu de les compter comme zéro
  4. Un dashboard santé capteurs est séparé des KPI production et signale clairement les capteurs en panne, dérive ou hors-tolérance
**Plans**: TBD
**UI hint**: yes

### Phase 6: Hardening, Scale & Multi-Country Rollout
**Goal**: Le système est prêt à scaler du premier pays production-tested vers un second pays/site, avec pen-test, drills, et capacités multi-région.
**Depends on**: Phase 5
**Requirements**: (v2 only — HRD-01 à HRD-08, EXP-01 à EXP-04, SST-01, SST-02 — non comptés dans v1)
**Success Criteria** (what must be TRUE):
  1. Un chemin d'upgrade DB-par-tenant pour clients VIP est documenté et testé end-to-end
  2. Des réplicas multi-région (Abidjan + Dakar) sont en place avec RPO/RTO mesurés
  3. Des realms Keycloak par pays supportent délégation et accès temporaire (vues régulateurs/auditeurs)
  4. Un pen-test annuel et des drills de restore mensuels sont documentés et passants
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/6 | Planned | - |
| 2. Vertical Slice Production | 0/8 | Planned | - |
| 3. Operational Completeness | 0/7 | Planned | - |
| 4. Analytics, Consolidation & Finance | 0/0 | Not started | - |
| 5. IoT Integration | 0/0 | Not started | - |
| 6. Hardening, Scale & Multi-Country Rollout | 0/0 | Deferred (v2) | - |

## Coverage Summary

- **v1 requirements:** 71 total
- **Mapped to phases:** 71 (Phases 1-5)
- **Phase 6:** v2 scope only (HRD/EXP/SST series)
- **Unmapped:** 0 ✓

## Research Flags (deferred deep research)

- **Phase 2:** protocole pont-bascule (RS232/RS485/Modbus), matrice Android rugged, co-design opérateurs réels
- **Phase 3:** réglementation explosifs par pays, vendeur détonateur (Davey Bickford vs Orica), templates douane OHADA
- **Phase 4:** formats export fiscal OHADA par pays, spec FEC-equivalent (avec expert-comptable Gravel Ivoire)
- **Phase 5:** vendeur télématique (Teltonika/Concox/Ruptela en CI), vendeur capteur carburant (Technoton/Eurosens), OEM moteur

---
*Roadmap created: 2026-05-12*
*Last updated: 2026-05-13 — Phase 3 plans defined (7 plans, 4 waves)*
