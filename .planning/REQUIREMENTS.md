# Requirements: Gravel Ivoire — ERP Carrière de Granite

**Defined:** 2026-05-12
**Core Value:** Donner à un groupe minier une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.

## v1 Requirements

Requirements pour la première release. Chaque exigence est mappée à une phase du roadmap.

### Foundation (Tenant, Identity, Master Data, Mobile Shell)

- [x] **FND-01**: Direction Groupe et opérateurs site s'authentifient via Keycloak (SSO OIDC) avec MFA optionnelle
- [x] **FND-02**: Le système isole strictement les données par tenant via PostgreSQL Row-Level Security, avec un test cross-tenant qui échoue au moindre leak
- [x] **FND-03**: Un utilisateur a un rôle (Direction Groupe, Directeur Site, Chef Carrière, Maintenance, HSE, Finance, Opérateur Terrain) scopé à un ou plusieurs sites
- [x] **FND-04**: Un administrateur tenant crée et gère le référentiel des sites (carrière, pays, fuseau horaire, devise fonctionnelle, GPS, responsable, statut)
- [x] **FND-05**: Un administrateur site définit les zones de production, bancs d'exploitation, et permis/licences associés
- [x] **FND-06**: Le système enregistre toutes les opérations dans un audit trail immuable (utilisateur, timestamp, action, valeurs avant/après)
- [ ] **FND-07**: Chaque montant financier est stocké en unités mineures entières avec sa devise (XOF=0 décimale, EUR=2) et trois représentations (origine / site-fonctionnel / groupe-reporting)
- [x] **FND-08**: Chaque transaction opérationnelle est rattachée à un OperationalDay (shift_start_local + IANA timezone du site) et non au created_at brut
- [x] **FND-09**: L'interface web et mobile sont disponibles en français et anglais, avec sélection par utilisateur
- [x] **FND-10**: L'application mobile Android fonctionne en mode offline-first ; les captures sont persistées localement et synchronisées dès que la connectivité revient
- [x] **FND-11**: Le service de sync applique une politique de conflit par-entité (append-only pour captures terrain, event-sourced pour livres, lock pessimiste pour plans, LWW pour préférences)

### Production — Foration

- [x] **FOR-01**: Un Chef Carrière crée un plan de forage (zone, banc, nombre de trous prévu, profondeur cible, diamètre, opérateur, machine)
- [x] **FOR-02**: Un opérateur de foreuse saisit chaque trou foré sur mobile offline (GPS, profondeur réelle, diamètre, inclinaison, durée, opérateur, machine)
- [x] **FOR-03**: Le système calcule le rendement de forage (mètres forés / heure machine) par campagne, opérateur et machine
- [x] **FOR-04**: Le système enregistre la consommation gasoil par foreuse et par session de forage
- [x] **FOR-05**: Une foreuse en panne ou maintenance bloque l'affectation à un nouveau plan de forage

### Production — Tir de mine & Explosifs

- [ ] **TIR-01**: Le registre des explosifs entrants/sortants est append-only avec snapshot PDF signé et hash de contenu pour chaque mouvement
- [ ] **TIR-02**: Chaque détonateur est tracé individuellement par numéro de série depuis réception jusqu'à utilisation
- [ ] **TIR-03**: Un plan de tir est créé, validé HSE, et figé (event append-only) avant chargement des explosifs
- [ ] **TIR-04**: Le chargement des explosifs est saisi par trou avec contrôle d'écart vs plan
- [ ] **TIR-05**: Un tir ne peut être déclenché que si la zone de sécurité a été validée par HSE (saga clearance)
- [ ] **TIR-06**: Le rapport de tir consigne fragmentation observée, vibration mesurée, incidents éventuels, et reste immuable
- [ ] **TIR-07**: Une réconciliation quotidienne explosifs entrée/sortie/stock bloque la clôture journalière si écart détecté

### Production — Extraction, Transport, Concassage, Criblage, Stockage

- [x] **EXT-01**: Un opérateur de pelle/chargeuse saisit ses cycles d'extraction (tonnage estimé, banc, type matériau) sur mobile offline
- [x] **EXT-02**: Le système calcule le rendement par engin d'extraction et par opérateur, avec temps d'arrêt
- [ ] **TRP-01**: Chaque rotation camion est enregistrée avec point de chargement, point de déchargement, tonnage pesé, temps de cycle
- [ ] **TRP-02**: Le pesage produit un ticket de pesée numérique avec signature ; le ticket peut être généré offline et synchronisé après
- [ ] **TRP-03**: Le dispatching affecte les camions disponibles aux rotations selon priorités définies
- [ ] **CON-01**: Le tonnage entrant et sortant de chaque concasseur est suivi (primaire, secondaire), avec performance et heures de fonctionnement
- [ ] **CON-02**: La consommation énergétique des concasseurs est suivie par session
- [ ] **CRI-01**: Le criblage classe la production en calibres avec contrôle qualité et déclaration de non-conformités
- [x] **STK-01**: Chaque stock (par calibre, par site, par zone) est un grand livre event-sourced ; le solde est dérivé d'événements append-only (entrée production, sortie vente, ajustement inventaire)
- [x] **STK-02**: Des alertes se déclenchent automatiquement quand un stock franchit un seuil bas/haut configuré
- [ ] **STK-03**: Le système valorise les stocks au coût de production (moyenne pondérée) avec conversion devise

### Maintenance équipements

- [ ] **MNT-01**: Un parc équipements (foreuses, pelles, chargeuses, camions, concasseurs, groupes électrogènes) est maintenu avec spécifications, compteurs heures, et statut
- [ ] **MNT-02**: Un plan de maintenance préventive est défini par équipement (intervalle horaire, kilométrique ou temporel)
- [ ] **MNT-03**: Une intervention corrective est saisie avec diagnostic, pièces consommées, heures main d'œuvre, durée d'arrêt
- [ ] **MNT-04**: Le stock de pièces de rechange déclenche des alertes quand le seuil est franchi
- [ ] **MNT-05**: La disponibilité par équipement (MTBF / MTTR) est calculée et exposée au dashboard

### Carburant & Énergie

- [x] **CAR-01**: Les cuves de carburant ont un solde event-sourced (entrées livraisons, sorties ravitaillements) avec rapprochement quotidien
- [ ] **CAR-02**: Chaque ravitaillement engin est saisi sur mobile offline (engin, opérateur, litres, compteur heures, photo jauge optionnelle)
- [ ] **CAR-03**: Un ratio L/h ou L/tonne anormal par engin déclenche une alerte (détection vol / fuite)
- [ ] **CAR-04**: La consommation électrique site est suivie par usage (concassage, criblage, ateliers)

### HSE (Hygiène Sécurité Environnement)

- [x] **HSE-01**: Tout incident/accident est saisi en append-only avec chaîne de hash, photos en object storage immuable, chronologie, gravité, personnes/équipements impactés
- [x] **HSE-02**: Un workflow d'actions correctives est créé pour chaque incident et suivi jusqu'à clôture
- [ ] **HSE-03**: Les EPI sont gérés par employé (attributions, états, retours) avec contrôle de validité
- [ ] **HSE-04**: Les habilitations (formation sécurité, permis explosifs, conduite engins) sont temporelles ("as-of") avec date d'obtention et date d'expiration
- [ ] **HSE-05**: Un audit sécurité périodique est planifié, exécuté avec checklist, et clôturé avec rapport
- [ ] **HSE-06**: Le KPI taux de fréquence des accidents (TF) est calculé en temps réel par site et consolidé groupe

### RH (light)

- [ ] **RH-01**: Le référentiel employés contient identité, contrat, site d'affectation, rôle métier, habilitations rattachées
- [ ] **RH-02**: Le pointage entrée/sortie de poste est saisi par superviseur ou opérateur sur mobile offline
- [ ] **RH-03**: Les rotations d'équipes (shifts) sont planifiées par site avec affectation aux postes
- [ ] **RH-04**: Les sous-traitants sont gérés comme entités first-class avec personnel rattaché, contrats, et habilitations

### Ventes & Expédition

- [ ] **VTE-01**: Un référentiel clients (CRM léger) contient identité, devise contractuelle, conditions de paiement, contacts
- [ ] **VTE-02**: Un contrat de vente précise produit, calibre, prix, devise, quantités prévues, période, transporteurs autorisés
- [ ] **VTE-03**: Un bon de livraison numérique est généré sur pesage (sur site ou offline) avec signature client/chauffeur
- [ ] **VTE-04**: Une facture multi-devise est générée à partir des BL avec conversion taux du jour figé
- [ ] **VTE-05**: Le suivi transporteur (interne ou externe) lie BL, camion, chauffeur, et destination
- [ ] **VTE-06**: Pour les ventes export, un dossier douane (déclaration, certificats, transit) est rattaché au BL

### Finance & Contrôle de gestion

- [ ] **FIN-01**: Le coût direct par tonne est calculé par site et matière (extraction, transport, concassage, criblage, carburant alloué, main d'œuvre, amortissement engins)
- [ ] **FIN-02**: La marge par contrat / par client / par site est calculée en devise groupe avec conversion FX figée
- [ ] **FIN-03**: Un budget annuel est saisi par site avec catégories de coûts ; le réalisé est confronté quotidiennement
- [ ] **FIN-04**: La comptabilité analytique (par centre de coût, par activité, par site) génère des écritures exportables
- [ ] **FIN-05**: Un export vers Sage / Ciel / Odoo localisé est généré au format attendu par l'expert-comptable (OHADA analytique)
- [ ] **FIN-06**: La consolidation multi-pays produit P&L et marge groupe en devise pivot (XOF ou EUR au choix)

### Dashboards, Reporting & Alertes

- [x] **DSH-01**: Chaque profil (Direction Groupe, Directeur Site, Chef Carrière, Maintenance, HSE, Finance) dispose d'un dashboard temps réel adapté à son rôle
- [ ] **DSH-02**: KPI Production : tonnes produites jour/semaine/mois, rendement forage, rendement concassage, disponibilité équipements, temps d'arrêt
- [ ] **DSH-03**: KPI Finance : coût/tonne, marge, consommation carburant, coût maintenance
- [ ] **DSH-04**: KPI HSE : nombre d'incidents, taux fréquence accidents, conformité audits
- [ ] **DSH-05**: Reporting consolidé groupe avec comparaison sites et drill-down vers détail
- [ ] **DSH-06**: Le moteur d'alertes notifie les utilisateurs concernés (email/SMS/in-app) sur seuils franchis, incidents critiques, écarts explosifs

### Intégrations IoT

- [ ] **IOT-01**: Une passerelle edge déployée par site reçoit les flux MQTT des capteurs et bufferise jusqu'à 7 jours en cas de coupure WAN
- [ ] **IOT-02**: La télématique flotte (Teltonika ou équivalent) ingère position GPS, vitesse, état moteur des camions et engins
- [ ] **IOT-03**: Les capteurs carburant en cuve et sur engins ingèrent niveau et consommation pour rapprochement automatique avec les saisies manuelles
- [ ] **IOT-04**: Les données IoT passent un modèle sanity 3 couches (raw / validated / business) avec data_quality_flag explicite ; les KPI production excluent les lectures invalides

## v2 Requirements

Reportées à une release ultérieure. Conscientes mais hors roadmap initial.

### Hardening & Multi-pays scale

- **HRD-01**: Chemin d'upgrade DB-par-tenant pour clients VIP
- **HRD-02**: Réplicas multi-région (Abidjan + Dakar)
- **HRD-03**: Realms Keycloak par pays avec délégation et accès temporaire
- **HRD-04**: Pen-test annuel et SOC2-readiness
- **HRD-05**: Drills restore mensuels documentés
- **HRD-06**: SMS multi-fournisseur (Africa's Talking et alternative)
- **HRD-07**: App iOS native (si demande client)
- **HRD-08**: Portail client privé pour suivi commandes/BL

### Études amont avancées

- **EXP-01**: Gestion campagnes d'exploration géologique avec carottages
- **EXP-02**: Analyses qualité granite et stockage rapports laboratoire
- **EXP-03**: Cartographie SIG/GPS des zones avec couches géologiques
- **EXP-04**: Estimation réserves et études topographiques

### Sous-traitants avancé

- **SST-01**: Facturation et règlement sous-traitants intégrés
- **SST-02**: Évaluation performance sous-traitants

## Out of Scope

Explicitement exclus. Documentés pour prévenir le scope creep.

| Feature | Reason |
|---------|--------|
| Comptabilité générale réglementaire (SYSCOHADA complet) | Hors mission ERP minier — export vers logiciel comptable certifié (Sage/Ciel/Odoo) à la place. Anti-feature critique : tout glissement génère dette technique majeure. |
| Paie complète intégrée | SIRH dédiés existent (PayFit, Sage Paie). L'ERP exporte heures/primes vers paie tierce. |
| Transformation aval (découpe, polissage, pavés, dalles) | Métier différent (usine vs carrière). Reporté post-MVP, peut faire l'objet d'un module séparé en v2+. |
| Maintenance prédictive IA | Volume données insuffisant en v1 ; ML après IoT stabilisé et 12+ mois historique. |
| Vision IA contrôle qualité granite | R&D avancée hors scope ERP. |
| Drone et cartographie 3D | Outils spécialisés tiers ; intégration éventuelle, pas développement maison. |
| Digital Twin de la carrière | Concept marketing — pas de valeur opérationnelle prouvée en v1. |
| Marketplace B2B granulats | Hors scope ERP, pivot business distinct. |
| Blockchain pour traçabilité | Audit trail PostgreSQL + hash chain suffit ; blockchain ajoute complexité sans bénéfice. |
| Chat interne / messagerie | Slack/WhatsApp existent ; ne pas réinventer. |
| LMS HSE (e-learning formations) | Outils dédiés (Moodle, 360Learning). L'ERP gère habilitations, pas la formation. |

## Traceability

Mapping requirement ↔ phase (validé après création du roadmap).

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 — Foundation | Complete |
| FND-02 | Phase 1 — Foundation | Complete |
| FND-03 | Phase 1 — Foundation | Complete |
| FND-04 | Phase 1 — Foundation | Complete |
| FND-05 | Phase 1 — Foundation | Complete |
| FND-06 | Phase 1 — Foundation | Complete |
| FND-07 | Phase 1 — Foundation | Pending |
| FND-08 | Phase 1 — Foundation | Complete |
| FND-09 | Phase 1 — Foundation | Complete |
| FND-10 | Phase 1 — Foundation | Complete |
| FND-11 | Phase 1 — Foundation | Complete |
| FOR-01 | Phase 2 — Vertical Slice Production | Complete |
| FOR-02 | Phase 2 — Vertical Slice Production | Complete |
| FOR-03 | Phase 2 — Vertical Slice Production | Complete |
| FOR-04 | Phase 2 — Vertical Slice Production | Complete |
| FOR-05 | Phase 2 — Vertical Slice Production | Complete |
| EXT-01 | Phase 2 — Vertical Slice Production | Complete |
| EXT-02 | Phase 2 — Vertical Slice Production | Complete |
| TRP-01 | Phase 2 — Vertical Slice Production | Pending |
| TRP-02 | Phase 2 — Vertical Slice Production | Pending |
| TRP-03 | Phase 2 — Vertical Slice Production | Pending |
| STK-01 | Phase 2 — Vertical Slice Production | Complete |
| STK-02 | Phase 2 — Vertical Slice Production | Complete |
| STK-03 | Phase 2 — Vertical Slice Production | Pending |
| CAR-01 | Phase 2 — Vertical Slice Production | Complete |
| CAR-02 | Phase 2 — Vertical Slice Production | Pending |
| CAR-03 | Phase 2 — Vertical Slice Production | Pending |
| CAR-04 | Phase 2 — Vertical Slice Production | Pending |
| HSE-01 | Phase 2 — Vertical Slice Production | Complete |
| HSE-02 | Phase 2 — Vertical Slice Production | Complete |
| HSE-03 | Phase 2 — Vertical Slice Production | Pending |
| HSE-04 | Phase 2 — Vertical Slice Production | Pending |
| HSE-05 | Phase 2 — Vertical Slice Production | Pending |
| HSE-06 | Phase 2 — Vertical Slice Production | Pending |
| DSH-01 | Phase 2 — Vertical Slice Production | Complete |
| DSH-02 | Phase 2 — Vertical Slice Production | Pending |
| TIR-01 | Phase 3 — Operational Completeness | Pending |
| TIR-02 | Phase 3 — Operational Completeness | Pending |
| TIR-03 | Phase 3 — Operational Completeness | Pending |
| TIR-04 | Phase 3 — Operational Completeness | Pending |
| TIR-05 | Phase 3 — Operational Completeness | Pending |
| TIR-06 | Phase 3 — Operational Completeness | Pending |
| TIR-07 | Phase 3 — Operational Completeness | Pending |
| CON-01 | Phase 3 — Operational Completeness | Pending |
| CON-02 | Phase 3 — Operational Completeness | Pending |
| CRI-01 | Phase 3 — Operational Completeness | Pending |
| MNT-01 | Phase 3 — Operational Completeness | Pending |
| MNT-02 | Phase 3 — Operational Completeness | Pending |
| MNT-03 | Phase 3 — Operational Completeness | Pending |
| MNT-04 | Phase 3 — Operational Completeness | Pending |
| MNT-05 | Phase 3 — Operational Completeness | Pending |
| RH-01 | Phase 3 — Operational Completeness | Pending |
| RH-02 | Phase 3 — Operational Completeness | Pending |
| RH-03 | Phase 3 — Operational Completeness | Pending |
| RH-04 | Phase 3 — Operational Completeness | Pending |
| VTE-01 | Phase 3 — Operational Completeness | Pending |
| VTE-02 | Phase 3 — Operational Completeness | Pending |
| VTE-03 | Phase 3 — Operational Completeness | Pending |
| VTE-04 | Phase 3 — Operational Completeness | Pending |
| VTE-05 | Phase 3 — Operational Completeness | Pending |
| VTE-06 | Phase 3 — Operational Completeness | Pending |
| FIN-01 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| FIN-02 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| FIN-03 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| FIN-04 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| FIN-05 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| FIN-06 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| DSH-03 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| DSH-04 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| DSH-05 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| DSH-06 | Phase 4 — Analytics, Consolidation & Finance | Pending |
| IOT-01 | Phase 5 — IoT Integration | Pending |
| IOT-02 | Phase 5 — IoT Integration | Pending |
| IOT-03 | Phase 5 — IoT Integration | Pending |
| IOT-04 | Phase 5 — IoT Integration | Pending |

**Coverage:**
- v1 requirements: 71 total
- Mapped to phases: 71
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-12 after roadmap creation*
