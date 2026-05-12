# Feature Research

**Domain:** ERP carrière de granite / agrégats — chaîne opérationnelle complète, multi-site / multi-pays Afrique de l'Ouest
**Researched:** 2026-05-12
**Confidence:** MEDIUM-HIGH (HIGH sur le périmètre fonctionnel standard des ERP quarry/aggregate occidentaux ; MEDIUM sur la spécificité West Africa / OHADA, à valider terrain)

## Executive Snapshot

Le marché se scinde en deux familles produit :

1. **Suites minières spécialistes** (Maptek Vulcan, Micromine + Pitram, Deswik, Hexagon Mining, MineSight/Mintec) — fortes sur **géologie 3D, mine design, plans de tir, télémétrie flotte, réconciliation production**, faibles sur ventes/facturation/finance ; orientées grandes mines métalliques.
2. **ERP quarry/aggregate commerciaux** (Herbst, WeighPay, Fast-Weigh, SMSTurbo, BulkSource, QuarryLink, Access Weighsoft, SAZS, Looper) — forts sur **weighbridge, ticketing, dispatch, ventes, facturation, stocks**, faibles sur géologie/tir/HSE avancé ; ciblent carrières et centrales à béton.

Gravel Ivoire doit hybrider les deux, avec une couche West-Africa (OHADA, multi-devise CFA/EUR/USD, offline-first, FR/EN) qu'aucun produit occidental ne couvre nativement — c'est là le différentiateur structurel.

## Feature Landscape

### Table Stakes (Users Expect These)

Sans ces modules, ce n'est pas un ERP carrière crédible.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Référentiel multi-site / multi-pays** (carrières, zones, bancs, GPS, permis, devises, langues) | Hypothèse de base d'un groupe minier multi-pays | M | Tenancy logique par site + agrégation pays ; PostGIS pour zones |
| **Gestion utilisateurs, rôles, permissions par site** | RBAC fin attendu dès la V1 (données sensibles : explosifs, finance) | M | Permissions par module × site × action ; audit trail |
| **Module Foration** (plans de trous, GPS, profondeur, diamètre, inclinaison, opérateur, machine, conso gasoil) | Étape 1 du cycle de production granulats | M | Saisie mobile terrain, import plans CSV/CAD léger |
| **Module Tir de mine** (plan de tir, chargement explosifs, validation HSE, autorisations, historique, registre explosifs) | Étape critique réglementée — traçabilité obligatoire | L | Registre explosifs conforme réglementation locale, double validation HSE/Carrière |
| **Module Extraction / Excavation** (rendement pelles/chargeuses, opérateurs, temps d'arrêt, tonnage estimé) | Mesure de la production primaire | M | Tonnage estimé par godet × rotations ; lien maintenance pour arrêts |
| **Module Transport interne** (rotations dumpers, temps de cycle, dispatching, pesée embarquée optionnelle) | Cœur de la chaîne entre front de taille et concasseur | M | Saisie chauffeur mobile + GPS si disponible ; fallback manuel |
| **Module Concassage** (tonnages entrée/sortie, performance, conso énergie, alarmes) | Étape de transformation primaire | M | Saisie poste 8h/12h ; KPI t/h, dispo machine |
| **Module Criblage / Classification** (calibres 0/4, 4/10, 10/20, 20/40, granulats nobles, non-conformités) | Sortie produit fini commercialisable | M | Définir calibres par site, traçabilité qualité par lot |
| **Module Stockage / Stockpiles** (inventaire temps réel par calibre × site, alertes seuils min/max, valorisation) | Pivot entre production et vente | M | Mouvements : entrée production, sortie expédition, ajustements inventaire physique |
| **Pesage / Weighbridge** (intégration pont-bascule, ticket BL, double pesée entrée/sortie) | Cœur commercial de toute carrière — pas négociable | L | Standard universel des ERP aggregate ; intégration série/IP/manuelle ; gestion offline pont en panne |
| **Bons de livraison (BL) numériques + signature** | Document légal de toute expédition | M | PDF/print + signature mobile chauffeur ; offline-capable |
| **Module Ventes & Facturation** (CRM clients, contrats prix, commandes, factures multi-devise) | Génération du chiffre d'affaires | L | Prix par client × calibre × site × période ; remises ; multi-devise CFA/EUR/USD |
| **Module Maintenance équipements** (préventive par compteurs horaires/km, corrective, OT, pièces, historique pannes, dispo) | Indispensable pour TCO et disponibilité flotte | L | Plans préventifs par engin, alertes seuils, lien stock pièces |
| **Module Carburant / Gasoil** (cuves, ravitaillements engins, anomalies de conso) | Poste de coût #2 après main d'œuvre — fraude fréquente | M | Saisie ravitaillement par engin + heure-mètre = ratio L/h ; alertes |
| **Module HSE** (incidents/accidents, presqu'accidents, EPI, audits, actions correctives, formations) | Conformité réglementaire + assurance | L | Workflow déclaration → enquête → action ; KPI TRIFR, jours sans accident |
| **Module RH light** (employés, pointage, rotations 2x8/3x8, sous-traitants, habilitations expirantes) | Pointage et habilitations indispensables ; paie complète exclue (cf PROJECT.md) | M | Pointage mobile/badge ; alertes habilitations (CACES, tir, secourisme) |
| **Comptabilité analytique + coût/tonne** | KPI clé de pilotage d'une carrière | L | Allocation coûts (main d'œuvre, gasoil, explosifs, amort.) sur production t ; export Sage/SYSCOHADA |
| **Dashboards temps réel** (Production / Finance / HSE) par site et consolidés groupe | Direction Groupe et Directeur Site l'exigeront dès la démo | L | KPI : t/jour, t/h concasseur, coût/t, jours sans accident, dispo flotte |
| **Reporting périodique** (quotidien, hebdo, mensuel) export PDF/Excel | Reporting groupe et autorités | M | Templates par destinataire (DG, Mines, fisc) |
| **Application mobile Android** (saisie terrain : foration, rotations, pesage offline, BL, incidents, ravitaillement) | Connectivité intermittente sur sites — saisie papier inacceptable en 2026 | XL | Flutter privilégié (cf PROJECT.md) ; Android d'abord, iOS si demandé |
| **Mode offline + synchronisation différée** | Sites reculés Afrique de l'Ouest sans 4G stable | XL | CRDT ou last-write-wins par entité + résolution conflits côté serveur |
| **Alertes & notifications** (seuils stock, habilitations, maintenance préventive, incidents, dépassement budget) | Standard moderne | M | Push mobile + email + SMS pour critiques (incident HSE) |
| **Audit trail / journal d'activité** | Données sensibles (explosifs, finance) — exigence réglementaire et assurance | M | Immuable, requêtable, exportable |
| **Sauvegardes automatisées + point-in-time recovery** | Continuité d'activité | M | PostgreSQL PITR + backup S3/Azure Blob cross-région |

### Differentiators (Competitive Advantage)

Là où Gravel Ivoire se distingue des suites occidentales et des ERP indiens type SAZS.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Offline-first natif sur toute la chaîne terrain** (foration, transport, pesage, BL, incidents) | Aucun ERP quarry mainstream ne le fait sérieusement — ils supposent connectivité | XL | Vrai différentiateur structurel ; vente facile en Afrique de l'Ouest |
| **Multi-pays OHADA / multi-devise CFA + EUR + USD + NGN** avec consolidation groupe automatique | SYSCOHADA + plan comptable local non couvert par produits occidentaux/indiens | L | Plan comptable analytique mappable SYSCOHADA ; taux de change BCEAO |
| **FR + EN bilingue first-class** (UI, BL, factures, rapports, langue par utilisateur) | Marché Afrique de l'Ouest mixte francophone/anglophone | M | i18n bien fait ≠ traduction posthume |
| **Intégration douane / export multi-pays** (BL export, certificats origine, déclarations douanières inter-pays) | Export granulats inter-pays UEMOA/CEDEAO mal couvert | L | Templates douaniers par pays ; ECOWAS Trade Liberalization Scheme |
| **Mobile-first robuste sur Android entrée de gamme** (low-end, écran soleil, gants, poussière) | Réalité terrain africaine ; produits indiens type SAZS sont web-only, occidentaux supposent tablettes neuves | L | Tester sur appareils <150 USD ; gros boutons ; offline obligatoire |
| **Registre explosifs conforme réglementations locales** (CI, Sénégal, Mali, Burkina, Guinée…) avec déclarations automatisées | Réglementation explosifs change par pays — point de douleur direction site | L | Templates déclaratifs par pays ; double signature directeur + responsable tir |
| **Coût à la tonne instantané, par site, par produit, par client** | KPI Direction Groupe critique ; les ERP aggregate occidentaux le font après import compta — pas en temps réel | L | Pré-calcul allocations + recalcul nocturne ; explicabilité du coût (drill-down) |
| **Pesage offline avec sync différée** (ticket BL généré sans connexion, sync au retour) | Pont bascule en panne réseau = arrêt commercial chez les concurrents | M | File d'attente locale + résolution conflits numérotation BL |
| **Sous-traitants intégrés** (transporteurs externes, foration sous-traitée, gardiennage) avec contrats, facturation entrante, performance | Réalité ouest-africaine : forte sous-traitance ; ERP occidentaux pensent salariés directs | M | Module sous-traitants distinct du module RH employés |
| **Consolidation groupe multi-pays en temps quasi-réel** | Direction Groupe Gravel Ivoire ne peut pas attendre fin de mois — concurrents = consolidation Excel manuelle | L | Réplication PostgreSQL ou event sourcing vers entrepôt central |
| **Intégration IoT carburant + GPS télématique flotte ouverte** (pas vendor lock-in à Pitram/Hexagon) | Permet d'utiliser télématique low-cost (Teltonika, Concox) répandue en Afrique | M | API ingestion générique + connecteurs Teltonika, Ruptela, Concox |
| **Self-service rapports & exports** pour fisc/Mines/banques par pays | Évite ressaisie ; chaque ministère a son template | M | Templates configurables par autorité ; export PDF signé |

### Anti-Features (Deliberately NOT Build in V1)

Features que les utilisateurs vont demander, mais qu'il faut refuser explicitement.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Comptabilité générale réglementaire complète** (grand livre, balance, états financiers certifiés) | "On veut tout dans un seul outil" | Concurrence directe avec Sage/SAARI déjà installés ; certification SYSCOHADA = projet à part entière ; risque légal | Comptabilité **analytique** dans l'ERP + **export structuré** vers Sage/SAARI/Tompro (cf PROJECT.md Out of Scope) |
| **Paie complète intégrée** (bulletins, déclarations CNPS/IPRES, congés payés) | "On veut un seul outil RH" | Législation paie change par pays + réforme fréquente ; SIRH dédiés (Sage Paie, PayDay) bien meilleurs | Pointage + heures + export structuré vers SIRH (cf PROJECT.md Out of Scope) |
| **Transformation aval avancée** (découpe blocs, polissage, dalles, pavés) | Mentionné dans le draft initial | Logique usine (gammes opératoires, ordres de fabrication) ≠ logique carrière flow ; complexité × 3 | Sortir au stade granulat / bloc brut ; module usine en V2 dédié si Gravel Ivoire pivote (cf PROJECT.md Out of Scope) |
| **Maintenance prédictive IA / Digital Twin / vision IA qualité** | "Innovation", démos impressionnantes | Demande volumes de données qu'on n'a pas encore ; ROI non démontré en carrière granite ; cher à exploiter | Maintenance préventive solide par compteurs + analyse historique pannes simple (cf PROJECT.md Out of Scope) |
| **Drone / cartographie 3D / LIDAR stockpile auto** | Suites Maptek/Hexagon en font | Nécessite matériel + opérateur certifié + traitement photogrammétrie ; pas la priorité Gravel Ivoire V1 | Mesure stockpile manuelle (carré × hauteur × densité) ; intégration drone V2 si demande (cf PROJECT.md Out of Scope) |
| **Mine planning géologique 3D** (équivalent Vulcan/Deswik) | Concurrence visible des suites minières | Marché de niche, géologues exigeants, coût dev énorme ; pas le métier carrière granulat | Import plans CAD/DXF basiques + modélisation 2D bancs ; renvoyer vers Surpac/Vulcan si besoin avancé |
| **Marketplace clients / e-commerce public** | "Vendre en ligne nos granulats" | B2B granulat = négociation contrat-cadre, pas e-commerce ; complexité paiement + livraison | Portail client privé (consultation commandes, stock, factures) — pas marketplace ouverte |
| **Module trading / hedging matières** | "On veut couvrir nos coûts gasoil" | Domaine financier réglementé, expertise rare ; risque réputationnel | Suivi prix d'achat + alertes seuils ; trading via banque partenaire |
| **Notifications push tout-azimut, real-time tout-est-temps-réel** | "On veut être notifié de tout" | Fatigue alertes → utilisateurs désactivent tout → on rate l'important | Catégories alertes (critique/important/info) × canal (push/email/digest) × abonnement utilisateur |
| **Blockchain traçabilité granulats** | Buzzword | Aucun client granulat n'exige blockchain ; complexité × coût × 10 ; PostgreSQL audit trail couvre 100% du besoin | Audit trail immuable PostgreSQL + signatures électroniques BL |
| **Chat / messagerie interne intégrée** | "Comme Slack" | WhatsApp est déjà universel sur les sites ; on perdra cette bataille | Liens deep-link vers WhatsApp/email depuis l'app ; pas de messagerie maison |
| **Module formation HSE complet (LMS)** | "On veut former dans l'ERP" | LMS est un produit à part entière (Moodle, 360Learning) | Registre des habilitations + alertes expiration ; lien vers LMS externe |

## Feature Dependencies

```
[Référentiel sites + RBAC]
    └──requires──> tous les autres modules (foundation)

[Foration] ──feeds──> [Tir de mine]
                         └──feeds──> [Extraction]
                                         └──feeds──> [Transport interne]
                                                         └──feeds──> [Concassage]
                                                                         └──feeds──> [Criblage]
                                                                                         └──feeds──> [Stockage]
                                                                                                         └──feeds──> [Ventes + Pesage + BL]
                                                                                                                         └──feeds──> [Facturation]

[Mobile + Offline sync] ──enables──> [Foration, Transport, Pesage, BL, HSE, RH pointage, Ravitaillement carburant]

[Maintenance équipements] ──enhances──> [Extraction, Transport, Concassage, Criblage] (disponibilité flotte)
[Carburant] ──enhances──> [Maintenance] (anomalies conso = indicateur usure)
[HSE] ──cross-cuts──> [tous modules opérationnels] (incidents peuvent toucher chaque étape)
[RH habilitations] ──gates──> [Tir de mine, Foration, Conduite engins] (pas d'action si habilitation expirée)

[Comptabilité analytique + Coût/tonne]
    └──requires──> [Production tonnages] + [Carburant] + [RH heures] + [Maintenance pièces] + [Achats]

[Dashboards temps réel + Reporting consolidé]
    └──requires──> tous les modules opérationnels saisis

[Intégration weighbridge] ──conflicts──> [Saisie manuelle non contrôlée]
    (les deux flux doivent réconcilier sinon écart stock/facturation)
```

### Dependency Notes

- **Tir de mine require Foration** : les trous doivent être chargés explosifs ; pas de tir sans plan foration validé.
- **Stockage require Concassage + Criblage** : on stocke des produits finis calibrés, pas du tout-venant.
- **Facturation require Pesage + BL** : le tonnage facturé doit matcher le tonnage pesé ; gap = fraude ou erreur.
- **Coût/tonne require ~tout le reste** : c'est le KPI agrégateur final ; ne peut être livré qu'après les modules amont.
- **Offline sync est transverse** : ne peut être ajouté après — doit être conçu dès la première entité mobile (foration ou transport).
- **RBAC + audit trail** doivent précéder le module Tir de mine et Finance (sensibles).
- **Multi-devise + i18n** doivent être présents avant tout module financier ou avant déploiement second pays.

## MVP Definition

### Launch With (v1 — first carrière Gravel Ivoire en CI)

Objectif : remplacer le papier sur une carrière pilote, puis dupliquer.

- [ ] Référentiel multi-site + RBAC + audit trail + i18n FR/EN — **foundation, non négociable**
- [ ] Foration (saisie mobile offline) — **étape 1 du cycle**
- [ ] Tir de mine + registre explosifs CI — **étape critique réglementée**
- [ ] Extraction + Transport interne (rotations dumpers, saisie mobile) — **mesure de production**
- [ ] Concassage + Criblage (saisie poste) — **transformation**
- [ ] Stockage / stockpiles (mouvements + inventaire) — **pivot prod/vente**
- [ ] Pesage / weighbridge (intégration pont) + BL numérique + signature — **cœur commercial**
- [ ] Ventes : clients, commandes, contrats prix, facturation CFA — **revenu**
- [ ] Maintenance préventive + corrective + pièces (simple) — **dispo flotte**
- [ ] Carburant : cuves + ravitaillements + ratio L/h — **coût #2**
- [ ] HSE : déclaration incidents + EPI + habilitations — **conformité + assurance**
- [ ] RH light : employés + pointage + habilitations + sous-traitants — **pas de paie**
- [ ] Coût à la tonne (allocation simple ; raffiner ensuite) — **KPI direction**
- [ ] Dashboards site + dashboards groupe — **vue Direction**
- [ ] Reporting quotidien/hebdo/mensuel PDF/Excel — **diffusion**
- [ ] App mobile Android offline-first (Flutter) — **vraie clé de l'adoption**
- [ ] Alertes critiques (incident HSE, seuil stock, habilitation expirée, maintenance due)
- [ ] Sauvegardes auto + PITR

### Add After Validation (v1.x — deuxième site CI + premier site pays 2)

- [ ] Comptabilité analytique avancée + export Sage/SYSCOHADA — quand finance pousse
- [ ] Multi-devise complète + consolidation groupe — quand 2e pays signé
- [ ] Intégration GPS télématique flotte (Teltonika/Concox) — quand volume rotations le justifie
- [ ] Intégration IoT cuves carburant — quand fraude carburant prouvée
- [ ] Portail client privé (consultation stock + commandes + factures)
- [ ] Self-service rapports fisc/Mines par pays
- [ ] iOS app (si direction site exige)
- [ ] Module sous-traitants avancé (contrats + performance + facturation entrante)
- [ ] Workflow approbation budget / engagement dépenses
- [ ] SMS pour alertes critiques HSE

### Future Consideration (v2+ — post product-market fit)

- [ ] Maintenance prédictive (heuristique avant IA)
- [ ] Drone / photogrammétrie stockpile
- [ ] Vision IA contrôle qualité granulats
- [ ] Transformation aval (découpe/polissage) — si Gravel Ivoire diversifie
- [ ] Digital twin carrière
- [ ] Mine planning 3D (ou intégration Vulcan/Surpac via export)
- [ ] Marketplace / e-commerce B2B
- [ ] Module trading / hedging
- [ ] Module formation HSE (LMS) — ou intégration Moodle

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Référentiel + RBAC + audit + i18n | HIGH | MEDIUM | P1 |
| Mobile offline-first foundation | HIGH | HIGH | P1 |
| Foration, Tir, Extraction, Transport | HIGH | MEDIUM | P1 |
| Concassage, Criblage, Stockage | HIGH | MEDIUM | P1 |
| Pesage + BL + Ventes + Facturation | HIGH | HIGH | P1 |
| Maintenance + Carburant | HIGH | MEDIUM | P1 |
| HSE + RH light | HIGH | MEDIUM | P1 |
| Coût/tonne + Dashboards | HIGH | HIGH | P1 |
| Reporting consolidé multi-pays | HIGH | HIGH | P2 |
| Intégration IoT carburant + GPS | MEDIUM | MEDIUM | P2 |
| Export Sage / SYSCOHADA | HIGH | MEDIUM | P2 |
| Portail client | MEDIUM | MEDIUM | P2 |
| iOS app | LOW | MEDIUM | P3 |
| Maintenance prédictive | MEDIUM | HIGH | P3 |
| Drone stockpile | LOW | HIGH | P3 |
| Vision IA qualité | LOW | HIGH | P3 |
| Transformation aval | LOW (Gravel Ivoire) | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Suites minières (Maptek/Micromine/Deswik/Hexagon) | ERP aggregate (Herbst/WeighPay/Fast-Weigh/SAZS) | Gravel Ivoire (notre approche) |
|---------|---------------------------------------------------|--------------------------------------------------|--------------------------------|
| Géologie 3D + mine planning | **Très fort** (cœur produit) | Absent | Hors scope V1 ; import CAD basique |
| Drill & blast planning | Fort (modules dédiés) | Absent ou très basique | Couvert V1, focus traçabilité/conformité plutôt que optimisation algorithmique |
| Fleet telemetry (Pitram, Hexagon) | **Très fort** (intégrations OEM) | Faible | Intégration télématique open (Teltonika/Concox) — pas vendor lock-in |
| Weighbridge + ticketing | Faible/absent | **Très fort** (cœur produit) | Couvert V1, **avec offline** (différentiateur) |
| Ventes / facturation / contrats | Faible | Fort | Couvert V1, **multi-devise + OHADA** |
| Stockpile management | Photogrammétrie/drone | Inventaire transactionnel | Inventaire transactionnel V1 ; drone V2 |
| HSE | Modules optionnels chers | Faible | **First-class V1** (incidents, EPI, habilitations) |
| Multi-pays / multi-devise | Possible via groupes mais coût élevé | Limité (souvent mono-pays) | **First-class V1 (OHADA)** |
| Offline mobile | Limité (suppose réseau site) | Limité (web only en général) | **First-class V1 (différentiateur structurel)** |
| FR + EN bilingue | EN dominant ; FR partiel chez Maptek | Variable | **First-class V1** |
| Comptabilité réglementaire | Externe (SAP/Oracle) | Module léger ou externe | Analytique only + **export Sage/SYSCOHADA** |
| Prix (référence) | Très cher (>100k USD setup + licences) | Moyen (10-50k USD) | Modèle SaaS abordable West Africa (à arbitrer) |
| Cible | Grandes mines métalliques | PME aggregate occidentale / Inde (SAZS) | **PME/ETI minière West Africa multi-pays** |

## Open Questions for Phase Research

À approfondir lors des phases dédiées :

- Réglementation explosifs détaillée par pays cible (CI confirmé, Sénégal/Mali/Burkina/Guinée à valider)
- Templates exacts SYSCOHADA pour export comptable analytique → financier
- Standard douanier ECOWAS / UEMOA pour BL export inter-pays
- Choix exact protocole intégration ponts-bascule (série RS232/RS485, TCP, OPC-UA, Modbus selon marque)
- Choix télématique cible (Teltonika FMB920/FMC650, Concox, Ruptela) — disponibilité en CI
- Marques engins miniers dominantes Gravel Ivoire (Caterpillar / Komatsu / Volvo / Liebherr) — impact intégration télémétrie OEM
- Volumétrie attendue (tonnes/jour, BL/jour, utilisateurs concurrents) → dimensionnement infra

## Sources

- [Herbst Software — Quarry ERP modules](https://www.herbstsoftware.com/industries/quarry-software/)
- [WeighPay — Construction Aggregate & Quarry Software](https://www.weighpay.com/construction-aggregate-quarry-software)
- [Fast-Weigh — Cloud Software for Bulk Material Sales](https://www.fastweigh.com/)
- [SMSTurbo Fulcrum — Aggregates Scale Ticketing](https://www.creativeinfo.net/industries/aggregates-scale-ticketing/)
- [Access Weighsoft — Construction aggregate and quarry management software](https://www.theaccessgroup.com/en-gb/waste-management/software/construction-aggregate/)
- [QuarryLink — Complete Quarry Management Software](https://www.quarrylink.com.au/)
- [BulkSource](https://bulksource.com/)
- [SAZS Apps — Quarry, Crusher, RMC & Brick Plant Management](https://sazsapps.com/)
- [Looper — Aggregate hidden costs analysis](https://www.looperp.ai/lps-modules/aggregate-5-hidden-costs-of-manual-quarry-aggregate-operations)
- [Ceba Solutions — Essential Systems and Software for the Modern Quarry](https://www.cebasolutions.com/blog-posts/essential-systems-and-software-for-the-modern-quarry)
- [Agg-Net — Resource planning for the quarrying industry](https://www.agg-net.com/resources/articles/business-finance/resource-planning-for-the-quarrying-industry)
- [Pit & Quarry — Running a modern quarry with digital technology](https://www.pitandquarry.com/running-a-modern-quarry-with-digital-technology/)
- [Micromine Pitram — Mining Fleet Management](https://www.micromine.com/pitram/)
- [Micromine Pitram — Mining Technology profile](https://www.mining-technology.com/contractors/fleet-management-software/micromine-pitram/)
- [Mining Operations Management Software comparison — scmGalaxy](https://www.scmgalaxy.com/tutorials/top-10-mining-operations-management-software-features-pros-cons-comparison/)
- [Top 7 Mining Software Solutions 2026 — Highways Today](https://highways.today/2026/01/13/top-7-mining-software-solutions/)
- [Mine Planning Software Comparison 2026 — Indian Minerology](https://indianminerology.blogspot.com/2026/02/mine-planning-software-comparison-2026.html)
- [TEC — Best Mining & Quarrying ERP Software 2026](https://www3.technologyevaluation.com/c/erp/i/mining-quarrying)

---
*Feature research for: ERP carrière de granite multi-site / multi-pays West Africa*
*Researched: 2026-05-12*
