# Phase 2: Vertical Slice Production - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** `--auto` (gray areas auto-resolved using recommended options; carries Phase 1 decisions forward)

<domain>
## Phase Boundary

Phase 2 livre une **chaîne opérationnelle étroite mais réelle** de bout en bout : Foration → Extraction → Transport (rotations + pesage) → Stockpile event-sourced → Carburant (cuves + ravitaillements) → HSE (incidents + CAPA) → Dashboard site temps réel. L'objectif est de **valider sur un seul site pilote** que les patterns Phase 1 (sync offline, RLS, audit chain-of-hash, money, OperationalDay) tiennent sous charge métier réelle avant extension Phase 3.

**Requirements couverts:** FOR-01..05, EXT-01..02, TRP-01..03, STK-01..03, CAR-01..04, HSE-01..06, DSH-01..02 (25 REQs).

**Out of phase scope** (relève des phases suivantes, ne pas discuter ici) :
- Tir de mine / explosifs, Concassage, Criblage, Maintenance, RH light, Ventes & Expédition → Phase 3
- Coût/tonne, marge, consolidation, exports OHADA, KPI Finance → Phase 4
- Intégration matérielle pont-bascule, télématique flotte, capteurs carburant, sanity 3 couches → Phase 5
- Multi-pays Keycloak realms, drills restore, pen-test → Phase 6
- Co-design opérateurs terrain pour les modules **non-Phase-2** → Phase 3+

</domain>

<decisions>
## Implementation Decisions

Toutes les décisions Phase 1 (D-01..D-46) restent **load-bearing** et ne sont pas réinterrogées. Phase 2 applique ces patterns au premier vrai métier.

### Architecture & bounded contexts (nouveaux modules NestJS)
- **D2-01 (Modules)** : 7 nouveaux modules dans le monolithe modulaire — `foration`, `extraction`, `transport`, `stockpile`, `fuel`, `hse`, `production-dashboard`. Chacun expose ses propres entités, sync registrations, controllers, et événements internes via `EventEmitter2` (in-process, pas de bus externe en Phase 2 — décision Phase 1 reconfirmée).
- **D2-02 (Cross-module integration)** : Les modules métier communiquent uniquement via **événements de domaine** publiés sur l'EventEmitter NestJS (`production.foration.hole_drilled`, `production.transport.rotation_completed`, `production.stockpile.event_appended`, `hse.incident.created`). Aucune dépendance directe Module-A → ServiceB. Le dashboard module est consommateur en read-only.
- **D2-03 (Strangler-readiness)** : Chaque module reste extractible en microservice plus tard. Aucune jointure SQL cross-module obligatoire ; les vues consolidées (dashboard) utilisent des projections matérialisées rafraîchies par event handlers.

### Foration (FOR-01..05)
- **D2-10 (Plan de forage — entité & cycle de vie)** : Entité `DrillingPlan` avec statuts `draft → active → closed → archived`. Stratégie sync : **`pessimistic_lock`** (D-11 c). Champs : `id`, `tenant_id`, `site_id`, `zone_id`, `bench_id`, `planned_hole_count`, `target_depth_m`, `diameter_mm`, `assigned_operator_id`, `assigned_machine_id`, `valid_from`, `valid_to`, `status`, `created_by`, `closed_by`, `closed_at_utc`. Validation côté serveur uniquement (le plan se gère sur web, pas en mobile offline).
- **D2-11 (Trou foré — capture mobile)** : Entité `DrilledHole` append-only, stratégie sync `append_only_event`. Champs : `id`, `plan_id`, `hole_index_in_plan` (séquence locale, pas global), `gps_point` (PostGIS, capturé auto par device avec `accuracy_m` stocké), `actual_depth_m`, `actual_diameter_mm`, `inclination_deg` (optionnel, slider 0–90), `started_at_local` + `ended_at_local` + `iana_timezone` (durée dérivée), `operational_day_id` (FK obligatoire — D-19), `operator_id`, `machine_id`, `fuel_liters_consumed` (optionnel, lié à CAR-02 si saisi simultanément), `notes_text`, `photo_blob_sha256` (optionnel). Aucune édition après création — corrections via événement `DRILLED_HOLE_CORRECTED` avec lien `corrects_hole_id`.
- **D2-12 (Validation hors-tolérance)** : Si `|actual_depth - target_depth| > 10%` OU `|actual_diameter - target_diameter| > 5%`, l'app mobile demande **confirmation explicite + raison libre** mais N'EMPÊCHE PAS la saisie (l'opérateur a toujours raison sur le terrain ; les écarts deviennent KPI qualité).
- **D2-13 (Rendement m/h)** : Calcul matérialisé `MaterializedView drilling_yield_per_machine_day` rafraîchi sur événement `hole_drilled` (debounced 30s) : `sum(actual_depth_m) / sum(hours_machine)` par `(operational_day_id, machine_id, operator_id)`. Exposé via API dashboard.
- **D2-14 (Foreuse en panne)** : Statut `machine.status` (`active|maintenance|out_of_service`) — mais le **registre machines** vit dans le module `maintenance` qui est Phase 3. **Décision intérimaire Phase 2** : table légère `production_equipment` (id, code, label, type ∈ {drill, excavator, truck, generator}, status, site_id) gérée par master-data UI, sans plan de maintenance préventive (qui arrive Phase 3). La règle "panne bloque affectation plan" est appliquée au niveau du service `DrillingPlanService.assignMachine()` qui rejette si `status != active`.

### Extraction (EXT-01..02)
- **D2-20 (Cycle d'extraction — capture mobile)** : Entité `ExtractionCycle` append-only. Champs : `id`, `tenant_id`, `site_id`, `operational_day_id`, `bench_id`, `equipment_id` (pelle/chargeuse), `operator_id`, `material_type` (référentiel léger : `granite_brut`, `tout_venant`, `sterile`), `estimated_tonnage_t` (decimal 1 dec), `cycle_started_at_local`, `cycle_ended_at_local`, `iana_timezone`, `downtime_minutes` (optionnel), `downtime_reason_code` (optionnel, enum court : `meal_break`, `fuel`, `mechanical`, `weather`, `safety`, `other`), `notes`.
- **D2-21 (Tonnage estimé vs pesé)** : Le tonnage saisi en extraction est explicitement **estimé** ; le tonnage faisant foi pour la valorisation stockpile est celui du **pesage transport** (TRP-02). Le rendement extraction = `sum(estimated_tonnage_t) / (cycle_time - downtime)` par engin/opérateur/jour, KPI séparé du KPI production réel (qui s'appuie sur pesage).

### Transport, pesage & ticket (TRP-01..03)
- **D2-30 (Rotation camion)** : Entité `TruckRotation` append-only. Champs : `id`, `tenant_id`, `site_id`, `operational_day_id`, `truck_equipment_id`, `driver_id`, `loaded_at_bench_id` (origine), `unloaded_at_zone_id` (stockpile cible), `material_type`, `loaded_tonnage_t` (decimal 2 dec, source = ticket pesée), `weighing_ticket_id` (FK vers `WeighingTicket`, NOT NULL), `loaded_at_utc`, `unloaded_at_utc`, `cycle_time_minutes` (dérivé).
- **D2-31 (Pesage — source du tonnage Phase 2)** : **Saisie manuelle obligatoire** par opérateur pont-bascule sur web ou mobile (Phase 2 ne tente PAS l'intégration matérielle RS232/Modbus — flag de recherche roadmap explicitement reporté Phase 5 IoT). Champs `WeighingTicket` : `id`, `ticket_number` (séquence par site, **générée offline** via préfixe device + compteur local + reconciliation serveur, voir D2-32), `gross_kg`, `tare_kg`, `net_kg` (dérivé, le système recalcule serveur-side), `truck_equipment_id`, `driver_id`, `material_type`, `weighed_at_local` + tz, `operator_user_id`, `weighing_station_code`, `client_signature_blob_sha256` (optionnel — pour BL ventes Phase 3, en Phase 2 c'est rotation interne uniquement), `driver_signature_blob_sha256` (optionnel), `notes`, `is_offline_generated` (bool), `content_hash` (SHA-256 du payload canonique, signe le ticket).
- **D2-32 (Numérotation offline)** : Format `<SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>` ex. `CIV01-20260615-MOB42-0007`. Garanti unique par device + jour. Serveur réordonne pour rapports mais ne renumérote pas.
- **D2-33 (Signature)** : Capture trace via plugin `signature` Flutter, stockée comme PNG compressé → S3 content-addressed (SHA-256). Le `WeighingTicket.content_hash` couvre les SHA des deux signatures.
- **D2-34 (Dispatching TRP-03)** : Phase 2 livre une vue web **read-only** "Rotations en cours" + une affectation manuelle (chef carrière clique "assigner camion T-12 à rotation X"). PAS d'algorithme d'optimisation. Auto-dispatch reporté backlog.
- **D2-35 (Lien rotation → stockpile)** : Chaque `TruckRotation` validée (`unloaded_at_utc` non NULL) publie l'événement `production.transport.rotation_completed` qui matérialise un événement stockpile `STOCKPILE_INFLOW` (D2-40) dans la même transaction (outbox pattern : ligne `outbox_event` insérée en même tx, dispatchée par worker BullMQ).

### Stockpile event-sourced (STK-01..03)
- **D2-40 (Schéma événementiel)** : Table `stockpile_event` append-only, **partitionnée par mois sur `occurred_at_utc`**. Types : `STOCKPILE_INFLOW` (rotation arrivée), `STOCKPILE_OUTFLOW_SALE` (consommé Phase 3 ventes), `STOCKPILE_ADJUSTMENT` (inventaire physique, requiert rôle Directeur Site + raison + photo), `STOCKPILE_TRANSFER` (inter-pile même site). Champs communs : `id`, `tenant_id`, `site_id`, `stockpile_id` (FK), `event_type`, `tonnage_delta_kg` (signé : +inflow, −outflow), `material_type`, `calibre_code` (en Phase 2 = même valeur que material_type, le criblage Phase 3 viendra raffiner), `operational_day_id`, `source_reference` (JSONB : `{rotation_id, sale_id, adjustment_id, ...}`), `occurred_at_utc`, `created_by`, `prev_hash`, `row_hash` (chain-of-hash D-28 obligatoire).
- **D2-41 (Calcul du solde)** : Projection matérialisée `stockpile_balance` rafraîchie par event handler : `(tenant_id, site_id, stockpile_id, calibre_code) → balance_kg, last_event_id, last_refresh_utc`. Recalcul complet de la projection en background nightly job (BullMQ cron 03:00 site-tz) pour détecter dérive. Si dérive > 1 kg, alerte ops envoyée.
- **D2-42 (Valorisation moyenne pondérée — STK-03)** : Coût unitaire dérivé par `weighted_average_cost_per_ton_minor_units` recalculé sur chaque `INFLOW` : `new_avg = (old_avg * old_qty + inflow_cost * inflow_qty) / (old_qty + inflow_qty)`. **Phase 2 stocke un coût d'inflow conservateur** = somme(carburant alloué heure machine de la chaîne extraction+transport contributrice pour la fenêtre OperationalDay) au prorata du tonnage. La formule complète (incluant main-d'œuvre, amortissement) arrive Phase 4. Documenté comme `cost_model_version = 1` sur chaque event ; Phase 4 introduira `version = 2` et un job de re-valorisation rétroactive optionnel.
- **D2-43 (Seuils — STK-02)** : Table `stockpile_threshold` par `(stockpile_id, calibre_code)` avec `low_kg`, `critical_low_kg`, `high_kg`. Mise à jour gérée par Directeur Site (UI web). Évaluation à chaque mutation du `stockpile_balance` → publication événement `production.stockpile.threshold_crossed` consommé par module `alerts` (voir D2-70).

### Carburant & Énergie (CAR-01..04)
- **D2-50 (Cuve event-sourced — CAR-01)** : Symétrique stockpile. Table `fuel_tank_event` append-only partitionnée mois. Types : `FUEL_DELIVERY_IN` (livraison fournisseur, requiert BL fournisseur scanné), `FUEL_DISPENSE_OUT` (ravitaillement engin, lié 1-1 à `EquipmentRefuel`), `FUEL_ADJUSTMENT` (jauge physique, rôle Directeur Site, requiert photo jauge, append-only avec raison). Champs : `id`, `tenant_id`, `site_id`, `tank_id`, `event_type`, `liters_delta` (signé), `operational_day_id`, `source_reference`, `occurred_at_utc`, `created_by`, `prev_hash`, `row_hash`, `cost_per_liter_minor_units` + `currency` (pour FUEL_DELIVERY_IN, propagé au coût engin via dispense).
- **D2-51 (Ravitaillement engin — CAR-02)** : Entité `EquipmentRefuel` append-only capturée mobile offline. Champs : `id`, `tank_id`, `equipment_id`, `operator_id` (peut différer du chauffeur engin), `liters`, `equipment_hour_meter_reading` (compteur heures lu sur engin), `gauge_photo_blob_sha256` (optionnel mais recommandé), `operational_day_id`, `created_at_local` + tz, `notes`. À la sync, génère atomiquement (1) `fuel_tank_event` `FUEL_DISPENSE_OUT` et (2) `EquipmentFuelConsumption` ligne (consommée par stockpile valuation D2-42 et alerte L/h D2-52).
- **D2-52 (Alerte ratio L/h — CAR-03)** : Calcul rolling 7 jours par `equipment_id` du `liters / hours_machine` (heures = delta `hour_meter_reading` entre ravitaillements). Si `ratio > 1.5 × median_30j` OU `ratio < 0.4 × median_30j` → événement `production.fuel.anomaly_detected` (canal in-app + email Directeur Site). Tuning du multiplicateur configurable par site ; valeurs initiales par défaut.
- **D2-53 (Réconciliation quotidienne)** : Job nightly (03:30 site-tz) qui pour chaque cuve : recalcule solde théorique = sum(events), compare au solde projeté, et **insère un événement `FUEL_RECONCILIATION` informationnel** (ne corrige pas — corrections requièrent FUEL_ADJUSTMENT manuel). Si écart > 0.5 % du volume cuve, alerte Directeur Site.
- **D2-54 (Énergie site — CAR-04)** : Phase 2 livre **uniquement la table `energy_consumption_reading`** (relevé manuel mensuel par usage : `concassage`, `criblage`, `ateliers`, `bureaux`) en lecture/écriture web. Les KPI dérivés et l'intégration compteurs arrivent Phase 5. Justification : EXT/TRP/FOR consomment du gasoil pas de l'électricité ; le concassage Phase 3 est le premier vrai consommateur électrique.

### HSE (HSE-01..06)
- **D2-60 (Incident — entité)** : `HseIncident` append-only avec **chain-of-hash D-28 obligatoire** (au-delà de l'audit log standard, l'incident lui-même est une ligne chained). Champs : `id`, `tenant_id`, `site_id`, `occurred_at_local` + tz, `operational_day_id`, `category` (enum : `accident_personnel`, `accident_materiel`, `near_miss`, `environnement`, `securite`, `autre`), `severity` (1–5, échelle légale CI à valider avec HSE — défaut DSI : 1=mineur 5=fatal/catastrophique), `reporter_user_id`, `location_text`, `gps_point` (optionnel), `people_impacted` (JSONB : `[{employee_id, injury_type, body_part, lost_time_h}]`), `equipment_impacted_ids` (UUID[]), `chronology_md` (markdown libre), `prev_hash`, `row_hash`, `content_addressed_attachments` (TEXT[] de SHA-256 vers S3).
- **D2-61 (Photos & pièces jointes)** : Toutes les photos uploadées (mobile ou web) sont **content-addressed S3** (D-29) avec **Object Lock = Governance mode, retention 7 ans** (alignement audit OHADA). Le client mobile compresse à max 2 Mo / 1920px côté long avant upload. Métadonnées EXIF préservées (GPS, timestamp device).
- **D2-62 (CAPA — actions correctives, HSE-02)** : Entité `CorrectiveAction` (non-append-only mais audit trail complet via triggers — D-27). Statuts `open → in_progress → done → verified → closed`. Champs : `id`, `incident_id`, `description`, `assigned_to_user_id`, `due_date_local` + tz, `priority` (low/med/high/critical), `closed_evidence_attachments` (TEXT[] SHA-256), `closed_at_utc`, `closed_by`, `verification_user_id`, `verified_at_utc`. **Règle** : un incident `severity ≥ 4` ne peut pas être marqué `closed` tant que toutes ses CAPA ne sont pas `verified`.
- **D2-63 (Habilitations & EPI — HSE-03/04)** : Hors scope Phase 2 — relèvent du module RH (Phase 3). Une carcasse minimale (table `employee_certification` avec `valid_from`, `valid_to`, requête `as_of`) est créée en Phase 2 **uniquement** si la règle "opérateur foreuse doit avoir habilitation conduite engin valide" devient bloquante en pilote. **Décision auto** : reporter Phase 3, en Phase 2 l'identité opérateur suffit. **Si le pilote remonte un besoin** → escalader en gap.
- **D2-64 (Audit sécurité HSE-05)** : Reporté Phase 3 (couplage RH/checklist + planification récurrente).
- **D2-65 (Taux de fréquence accidents — TF, HSE-06)** : Calcul **TF = (nombre d'accidents avec arrêt × 1 000 000) / heures travaillées**. Heures travaillées Phase 2 = **proxy** = `sum(OperationalDay.workforce_headcount × 8h)` (headcount déclaré par Directeur Site dans le formulaire de clôture journalière). Phase 3 RH remplacera par les pointages réels.

### Dashboards (DSH-01..02 — scope Phase 2)
- **D2-70 (Personas Phase 2)** : 2 dashboards en Phase 2 — **Directeur Site** et **Chef Carrière** (les 4 autres personas — Direction Groupe, Maintenance, HSE, Finance — sont délivrés en Phase 3/4). Le persona Direction Groupe (consolidation multi-sites) arrive **explicitement Phase 4** ; en Phase 2 le pilote = un seul site.
- **D2-71 (Push real-time)** : **Server-Sent Events (SSE)** depuis NestJS, abonnement par `(tenant_id, site_id, dashboard_key)`. Pas de WebSocket en Phase 2. Fallback polling 30 s si SSE échoue. Le client web Angular utilise `EventSource` natif avec retry exponentiel.
- **D2-72 (KPIs Directeur Site)** : Tonnage produit J/J-1, J/S, J/M (depuis stockpile `INFLOW`), rendement forage m/h moyen pondéré jour, rendement extraction t/h, **TF accident** (rolling 12 mois), nombre incidents ouverts par sévérité, niveau cuves carburant + alertes ratio L/h ouvertes, soldes stockpile vs seuils, équipements en panne.
- **D2-73 (KPIs Chef Carrière)** : Plans forage actifs + progression % (trous forés / planifiés), équipages affectés, anomalies hors-tolérance jour, rotations camions jour, file d'attente pesage. Plus opérationnel, moins de KPIs financiers/HSE consolidés.
- **D2-74 (Moteur d'alertes — module `alerts`)** : Nouveau module NestJS `alerts` consommant les événements de domaine. Canaux Phase 2 : **in-app (badge dashboard + drawer)** obligatoire, **email** best-effort (SES côté AWS), **SMS reporté Phase 6** (multi-provider Africa's Talking, déjà décidé). Persistance : table `alert` (entity, severity, status `open|acked|resolved`, recipients[], created_at, acked_at, resolved_at, resolved_by). Politique : 1 incident = 1 alerte ; threshold crossing = 1 alerte par franchissement (pas spam toutes les heures).

### Mobile (Flutter) — extensions Phase 2
- **D2-80 (Nouveaux écrans)** : Foration (saisie trou — formulaire long auto-savedrafted toutes les 5 s en SQLite local), Extraction (cycle simplifié), Transport (création rotation + lien ticket pesage), Pesage (formulaire pont-bascule manuel), Ravitaillement engin, Incident HSE (form long + photos + chronology MD). Tous **offline-first**, syncés via PowerSync sur stratégie `append_only_event` (D-11 a).
- **D2-81 (UX terrain)** : Boutons cible 56 dp min (gants), contraste haut (luminosité plein soleil), confirmations explicites pour append-only ("Une fois envoyé, non modifiable. Confirmer."), photos compressées avant upload, captures GPS avec accuracy affichée (rouge si > 30 m, ambre si > 10 m, vert sinon). **Aucune navigation perdue offline** : tous les écrans accessibles depuis cache local.
- **D2-82 (Tablette pesage)** : L'écran pesage est optimisé pour **Samsung Galaxy Tab Active 3** (rugged 8", Android 11+) en orientation paysage ; les autres écrans sont smartphone-first (Samsung XCover Pro 6, Android 12+). Cible test device matrix : minimum 1 phone rugged + 1 tablette rugged ; toleré : phones Android 11+ génériques 5–6.5".
- **D2-83 (Co-design — piste parallèle non bloquante)** : Une session de co-design 2 jours est planifiée comme **piste parallèle** (`docs/operations/parallel-tracks.md`), **mais ne bloque PAS** la livraison du code mobile métier. Le code mobile Phase 2 utilise des **wireframes provisoires dérivés directement de CONTEXT.md** (champs D2-11, D2-20, D2-30, D2-51, D2-60, ergonomie D2-81). Chaque écran terrain doit contenir un commentaire `// TODO(co-design): valider en atelier` aux endroits où l'ergonomie reste hypothétique. La session co-design, quand elle aura lieu, génère des PR d'ajustement (pas une réécriture). *Décision utilisateur 2026-05-12 : prérequis humains = pistes parallèles, jamais bloquants.*

### Web (Angular) — extensions Phase 2
- **D2-90 (Modules)** : 7 modules Angular feature lazy-loaded miroirs des modules backend + 1 module `dashboard-site` + 1 module `alerts-inbox`. **AG Grid Community** (gratuit, Apache-2.0) pour listes (rotations, incidents, ravitaillements, événements stockpile/carburant) — perte des pivots/group rows acceptée, remplaçables par tables natives Material/Angular CDK si besoin. Formly pour formulaires CRUD (plans forage, seuils stockpile, configuration alertes). *Décision utilisateur 2026-05-12 : outils gratuits/OSS uniquement, AG Grid Enterprise reporté hors-roadmap.*
- **D2-91 (Carte site — Leaflet)** : Vue carte centrée sur le polygone du site avec marqueurs : zones d'extraction, bancs, stockpiles, cuves carburant, position dernière des engins (Phase 2 = manuelle / mock ; Phase 5 IoT = télématique réelle). **Tiles OSM gratuites** uniquement (tile.openstreetmap.org via politique de fair-use ; auto-hébergement TileServer-GL en option Phase 6 si volume justifie). Fallback offline cache via `leaflet.offline`. Pas de MapTiler/Mapbox payant.

- **D2-92 (i18n — 3 langues exactes)** : Toutes les locales i18n créées Phase 2 doivent contenir **exactement 3 fichiers** : `fr.json`, `en.json`, `ar.json`. Pas de Dioula, Baoulé, Wolof, Bambara ou autres langues locales — décision utilisateur. RTL (right-to-left) doit être supporté côté Angular (CSS `dir="rtl"` + Tailwind RTL plugin si présent) et Flutter (`Directionality` widget) dès qu'AR est ajouté. *Décision utilisateur 2026-05-12.*

### Coût-tonne — guardrail Phase 2 vs Phase 4
- **D2-100** : Phase 2 **ne livre PAS** de KPI coût/tonne final. Elle livre la **plomberie** : carburant alloué par engin, heures machine, tonnage par calibre, OperationalDay attachment partout. Le calcul de coût direct par tonne (FIN-01) et la marge (FIN-02) sont **Phase 4**. Le dashboard Directeur Site Phase 2 expose `cost_per_ton_provisional` calculé sur carburant seul, **étiqueté "provisoire" en UI** pour éviter qu'il devienne référence Finance.

### Sécurité & rôles
- **D2-110 (Nouveaux rôles Phase 2)** : `OPERATOR_DRILLING`, `OPERATOR_EXCAVATOR`, `TRUCK_DRIVER`, `WEIGHING_OPERATOR`, `HSE_OFFICER`, `SITE_MANAGER`, `QUARRY_CHIEF` (mappés Keycloak groupes — D-04). Ajout au matrice RBAC. Granularité par `(role, site_id)` (D-04 inchangé).
- **D2-111 (Règles d'accès loadées)** : `STOCKPILE_ADJUSTMENT` réservé `SITE_MANAGER`. `FUEL_ADJUSTMENT` réservé `SITE_MANAGER`. `HseIncident.create` ouvert à tous rôles avec site_scope ; modifications de chronology après création = nouvel événement append-only `HSE_INCIDENT_CHRONOLOGY_APPENDED` (jamais d'édition). CAPA assignée par `HSE_OFFICER` ou `SITE_MANAGER`.

### Performance & charge
- **D2-120 (Cible Phase 2)** : 1 site pilote, ~50 utilisateurs concurrents (mobile + web), ~2 000 événements `DrilledHole`/jour, ~500 rotations/jour, ~10 incidents/mois. Pas de partitionnement custom au-delà de ce qui est natif Postgres (mois sur event tables). Pas de read replicas Phase 2.

### Claude's Discretion (laissé au planner / executor)
- Schéma exact des migrations SQL (TypeORM CLI natif, format Phase 1).
- Découpage exact des composants Angular (modules feature, components, services).
- Structure exacte des écrans Flutter (utilisation de `Riverpod` notifiers vs `AsyncNotifier`, choix de routing nested vs flat).
- Choix entre `BullMQ` vs `pg-boss` pour les jobs Phase 2 (recalcul stockpile, recon carburant, anomaly detection) — recommandation Claude : BullMQ (Redis déjà présent Phase 1 pour cache).
- Stratégie de seeding données démo (1 site fictif, 2 stockpiles, 1 cuve, 5 engins, 3 mois de données simulées pour tester le dashboard).
- Choix exact des bibliothèques de signature et compression photo Flutter (parmi celles listées en Phase 1 STACK.md).

### Folded Todos
Aucun (aucun todo backlog matché par `gsd-tools todo match-phase 2`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Vision, contraintes, key decisions stack
- `.planning/REQUIREMENTS.md` §"Production — Foration", §"Production — Extraction, Transport, Concassage, Criblage, Stockage" (Phase 2 subset : FOR-01..05, EXT-01..02, TRP-01..03, STK-01..03), §"Carburant & Énergie" (CAR-01..04), §"HSE" (HSE-01..06), §"Dashboards, Reporting & Alertes" (DSH-01..02)
- `.planning/ROADMAP.md` §"Phase 2: Vertical Slice Production" — Goal + Success Criteria officiels + research flags Phase 2 (pont-bascule différé, Android rugged matrix, co-design)
- `.planning/STATE.md` — Statut Phase 1 closed, Phase 2 ready

### Phase 1 baseline (load-bearing — ne pas réinterroger)
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01..D-46 décisions fondations (identity, RLS, sync, money, OperationalDay, audit, i18n, mobile shell, observability, infra, codebase shape)
- `.planning/phases/01-foundation/01-RESEARCH.md` — recherches Phase 1
- `.planning/phases/01-foundation/01-VALIDATION.md` — preuves Phase 1
- `.planning/phases/01-foundation/01-UAT.md` — UAT Phase 1 (6 bloqués sur local-env, CI = source of truth)

### ADRs Phase 1 (à appliquer Phase 2)
- `docs/adr/ADR-0001-rls-multi-tenancy.md` — RLS pattern (chaque nouvelle table Phase 2 hérite)
- `docs/adr/ADR-0002-powersync-sync-engine.md` — Sync strategies registry (chaque entité Phase 2 doit déclarer sa stratégie)
- `docs/adr/ADR-0003-operational-day-model.md` — OperationalDay FK sur toute table opérationnelle Phase 2 (obligatoire)
- `docs/adr/ADR-0004-audit-chain-of-hash.md` — Pattern chain-of-hash réutilisé pour stockpile_event, fuel_tank_event, hse_incident
- `docs/adr/ADR-0005-db-per-tenant-upgrade-path.md` — pas d'impact direct Phase 2

### Research artifacts (project-wide)
- `.planning/research/STACK.md` — versions (NestJS 11, Postgres 18, Flutter 3.35, AG Grid, Formly, Leaflet, BullMQ)
- `.planning/research/ARCHITECTURE.md` §"Bounded contexts", §"Event sourcing patterns", §"Sync per-entity"
- `.planning/research/PITFALLS.md` §1 (audit hash), §2 (sync ordering — pertinent partout Phase 2), §3 (multi-currency, valorisation stockpile), §9 (operational day)
- `.planning/research/FEATURES.md` §"Foration", §"Transport & Pesage", §"Stockpile event-sourced", §"HSE incident immutable"
- `.planning/research/SUMMARY.md` §"Phase 2 implications"

### Nouveaux ADRs attendus Phase 2 (à produire par le planner)
- ADR-0006 : Stockpile event-sourced schema & valuation model (Phase 2 version 1, Phase 4 version 2)
- ADR-0007 : Fuel tank event-sourced schema & reconciliation strategy
- ADR-0008 : HSE incident immutability + CAPA workflow
- ADR-0009 : Weighing ticket offline numbering & content-hash signing
- ADR-0010 : Dashboard push strategy (SSE Phase 2, WebSocket revisited Phase 4+)

### External docs
- PostgreSQL 18 partitioning by range (monthly partitions pour event tables)
- PostgreSQL 18 generated columns (pour `net_kg = gross_kg - tare_kg`)
- TypeORM 0.3 entity inheritance + custom repositories
- NestJS 11 EventEmitter2 + outbox pattern (Apache Kafka deferred Phase 5)
- BullMQ delayed jobs + cron (recalc stockpile, reconciliation carburant, anomaly detection)
- Angular 20 + AG Grid Community/Enterprise pricing decision (Phase 1 STACK.md a recommandé Enterprise — confirmer budget Phase 2)
- Leaflet + ngx-leaflet, fallback offline tiles
- Flutter `signature` package, `image_picker` + compression `flutter_image_compress`
- AWS S3 Object Lock Governance mode (HSE attachments)
- Server-Sent Events HTML5 spec + Angular `EventSource` wrapper patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (livrés Phase 1)
- `apps/api/src/modules/tenancy/` — TenantGuard + CLS injection + GUC binding (utiliser tel quel sur chaque nouveau module Phase 2)
- `apps/api/src/modules/master-data/` — Site, Zone, Bench entities + CRUD (Phase 2 ajoute FK depuis nouvelles entités, ne refait pas)
- `apps/api/src/modules/sync/` — PowerSync registry + 4 conflict strategies (Phase 2 enregistre ses 13+ entités append-only)
- `apps/api/src/modules/audit/` — Triggers + chain-of-hash (Phase 2 réutilise pour stockpile_event, fuel_tank_event, hse_incident)
- `apps/api/src/modules/identity/` — Keycloak JWT validation, role guards (Phase 2 ajoute rôles D2-110)
- `apps/api/src/modules/i18n/` — Transloco / `nestjs-i18n` (Phase 2 ajoute namespaces `foration`, `extraction`, `transport`, `stockpile`, `fuel`, `hse`, `dashboard`, `alerts`)
- `apps/api/src/common/money/` — dinero.js helpers (Phase 2 utilise pour valorisation stockpile et cost_per_liter)
- `apps/api/src/common/operational-day/` — OperationalDay resolver (Phase 2 FK obligatoire partout)
- `apps/api/src/otel/` — OpenTelemetry tracing (Phase 2 instrumente nouveaux modules)
- `apps/web/` — shell Angular 20 avec routing + sidebar + locale switcher + auth Keycloak (Phase 2 ajoute lazy modules)
- `apps/mobile/` — shell Flutter avec login OIDC + journal d'activité + Drift + PowerSync (Phase 2 ajoute écrans métier)
- `infra/` — OpenTofu modules EKS + RDS + ArgoCD (Phase 2 ajoute S3 bucket Object Lock pour HSE attachments)

### Established Patterns (Phase 1 → Phase 2 doit suivre)
- **Tenant scoping** : tout repository étend `TenantScopedRepository<T>` (wrapper Phase 1)
- **Sync registration** : `@SyncEntity({ strategy: 'append_only_event' | 'event_sourced_ledger' | 'pessimistic_lock' | 'last_write_wins' })` sur chaque entité mobile-syncable
- **Audit generation** : `@Auditable()` sur les entités mute-able, chain-of-hash custom pour les event tables
- **Money columns** : tuple `{amount_minor: bigint, currency: char(3), fx_rate_id: uuid?}` partout
- **OperationalDay FK** : obligatoire sur toute table opérationnelle ; lint CI custom Phase 1 alerte si manquant
- **I18n keys** : namespace `<module>.<feature>.<key>`
- **Migrations** : TypeORM CLI natives, format `<timestamp>__<verb>_<entity>.sql`

### Integration Points (à créer Phase 2)
- 7 nouveaux modules NestJS dans `apps/api/src/modules/` (`foration`, `extraction`, `transport`, `stockpile`, `fuel`, `hse`, `production-dashboard`) + module transverse `alerts`
- 8 nouveaux modules feature Angular dans `apps/web/src/app/features/` + 1 module `dashboard-site` + 1 `alerts-inbox`
- Nouveaux écrans Flutter dans `apps/mobile/lib/features/`
- Nouveau bucket S3 `gravel-{env}-hse-attachments-{region}` avec Object Lock Governance 7 ans
- EventEmitter wiring : déclarer un fichier `apps/api/src/modules/production-dashboard/event-handlers.ts` qui s'abonne aux 6+ topics et matérialise les projections
- Outbox table `outbox_event` + worker BullMQ qui réémet les événements non-acknowledgés (idempotence)

</code_context>

<specifics>
## Specific Ideas

- **Co-design opérateurs (D2-83)** : Bloque la prod code mobile métier. Le planner doit séquencer une "Wave 0" = co-design + wireframes validés AVANT toute production de code mobile Foration/Extraction/Transport/HSE. Le web peut commencer en parallèle car les personas web (Chef Carrière, Directeur Site) sont déjà documentés Phase 1.
- **Pilote sur 1 seul site** : Tous les KPIs, alertes, dashboards sont conçus mono-site Phase 2. La consolidation multi-sites = Phase 4. Si pression commerciale pour pilote 2 sites simultanés → escalader en gap (pas de couture multi-site cachée).
- **`cost_per_ton_provisional`** explicitement marqué "provisoire" dans le dashboard pour éviter qu'il devienne référence Finance avant Phase 4. Étiquette UI obligatoire.
- **Object Lock S3** : à activer dès la création du bucket Phase 2. Ne pas reporter — le mode Governance permet override par compte root mais empêche les opérateurs de supprimer ; mode Compliance Phase 6 si pen-test l'exige.
- **Chain-of-hash sur 3 tables** : `stockpile_event`, `fuel_tank_event`, `hse_incident` (en plus de l'audit log standard Phase 1). Un test CI custom doit vérifier l'intégrité de la chaîne sur ces 3 tables sur chaque PR (mock 100 events, vérifier hashes, détecter une corruption injectée).
- **Outbox pattern** : indispensable pour matérialiser `STOCKPILE_INFLOW` à partir de `TruckRotation` dans la même tx que la rotation. Documenter dans ADR-0006 ou un ADR dédié si le planner préfère.
- **`workforce_headcount` Phase 2 = saisie manuelle clôture journalière** par Directeur Site. Champ ajouté à `OperationalDay.metadata.workforce_headcount`. Phase 3 RH remplace par pointages.
- **TF (taux fréquence)** : la fenêtre rolling 12 mois est partielle Phase 2 (pas 12 mois de données) → afficher "TF (depuis lancement)" tant que < 12 mois d'historique, puis basculer auto à rolling 12 mois.

</specifics>

<deferred>
## Deferred Ideas

Inclues / mentionnées en analyse mais hors scope Phase 2 :

- **Intégration matérielle pont-bascule** (RS232/RS485/Modbus) — Phase 5 IoT (research flag roadmap honoré). Phase 2 = saisie manuelle uniquement.
- **Dispatching automatique camions** (algo d'optimisation) — Backlog. Phase 2 = affectation manuelle.
- **Habilitations & EPI** (HSE-03, HSE-04) — Phase 3 RH (carcasse minimale Phase 2 uniquement si bloquant pilote).
- **Audit sécurité périodique** (HSE-05) — Phase 3.
- **TF par site consolidé groupe** — Phase 4 (Phase 2 mono-site uniquement).
- **Concassage, Criblage, Maintenance, RH, Ventes** — Phase 3.
- **Coût direct/tonne final, marge, budgets, exports OHADA** — Phase 4 (Phase 2 livre la plomberie + `cost_per_ton_provisional`).
- **Télématique flotte, capteurs cuve carburant, sanity 3 couches** — Phase 5.
- **Realms Keycloak par pays, drills restore, pen-test** — Phase 6.
- **Re-valorisation rétroactive stockpile cost_model_version=2** — Phase 4 (job optionnel).
- **WebSocket bidirectionnel dashboard** — Phase 4+ (Phase 2 = SSE one-way).
- **SMS notifications** — Phase 6 (Africa's Talking multi-provider).
- **iOS native app** — Phase 6.
- **Portail client privé / suivi BL externe** — v2 (HRD-08).

### Reviewed Todos (not folded)
Aucun (aucun todo backlog matché par `gsd-tools todo match-phase 2`).

</deferred>

---

*Phase: 02-vertical-slice-production*
*Context gathered: 2026-05-12*
*Auto mode: 25 requirements analyzed, ~50 gray areas identified and resolved using recommended defaults grounded in Phase 1 ADRs + research artifacts. No user gray-area selection performed.*
