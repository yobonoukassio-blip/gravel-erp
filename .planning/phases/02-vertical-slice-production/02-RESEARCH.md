# Phase 2: Vertical Slice Production — Research

**Researched:** 2026-05-12
**Domain:** Mining/Quarry ERP — Production chain (Foration → Extraction → Transport → Stockpile → Carburant → HSE → Dashboard) offline-first, multi-tenant, single-site pilot
**Confidence:** HIGH (Phase 1 baseline locked, decisions pre-resolved in CONTEXT D2-01..D2-120)

## Summary

Phase 2 délivre une **chaîne opérationnelle verticale réelle** sur un seul site pilote, en réutilisant les fondations Phase 1 (RLS, sync registry 4 stratégies, chain-of-hash audit, OperationalDay FK, money minor units, Keycloak roles, dinero.js, OpenTelemetry). 7 modules NestJS + 1 transverse `alerts` + 7 modules Angular feature + 6 écrans Flutter offline-first sont à produire, avec **session co-design opérateurs en Wave 0 BLOQUANTE** avant tout code mobile métier. Les patterns techniques sont arrêtés dans CONTEXT : `append_only_event` pour captures terrain, `event_sourced_ledger` pour stockpile/fuel/HSE, chain-of-hash sur 3 nouvelles tables, outbox + EventEmitter2 pour cross-module, SSE pour dashboard.

**Primary recommendation:** Le planner doit séquencer **4 waves** : W0 (co-design + master-data extensions + bucket S3 + outbox + alerts scaffolding) → W1 (foration + extraction backend + mobile capture) → W2 (transport + stockpile event-sourced + pesage manuel) → W3 (fuel + HSE chain-of-hash + dashboard SSE + alertes in-app/email). Cible : **8 plans**, ~6–10 tasks chacun, sur 7–10 semaines calendaires.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Architecture & bounded contexts**
- **D2-01** — 7 nouveaux modules NestJS (`foration`, `extraction`, `transport`, `stockpile`, `fuel`, `hse`, `production-dashboard`) + module transverse `alerts`. Monolithe modulaire conservé. Communication intra-process via `EventEmitter2`.
- **D2-02** — Communication cross-module uniquement par événements de domaine (`production.foration.hole_drilled`, `production.transport.rotation_completed`, `production.stockpile.event_appended`, `hse.incident.created`). Aucune dépendance directe Service-A → Service-B.
- **D2-03** — Strangler-readiness : pas de jointure SQL cross-module obligatoire ; vues dashboard via projections matérialisées.

**Foration (FOR-01..05)**
- **D2-10** — `DrillingPlan` (`draft → active → closed → archived`), sync `pessimistic_lock`, gestion web uniquement.
- **D2-11** — `DrilledHole` append-only, sync `append_only_event`, FK `operational_day_id` obligatoire, photo SHA-256, correction via événement `DRILLED_HOLE_CORRECTED` lié.
- **D2-12** — Hors-tolérance (>10% profondeur, >5% diamètre) = confirmation + raison libre, **PAS de blocage saisie**.
- **D2-13** — Rendement m/h via `MaterializedView drilling_yield_per_machine_day` (rafraîchi sur événement, debounced 30s).
- **D2-14** — Table légère `production_equipment` (id, code, label, type, status, site_id). Règle "panne bloque affectation" au niveau service.

**Extraction (EXT-01..02)**
- **D2-20** — `ExtractionCycle` append-only avec downtime + reason_code.
- **D2-21** — Tonnage extraction explicitement **estimé** ; le tonnage faisant foi vient du pesage transport.

**Transport, pesage, ticket (TRP-01..03)**
- **D2-30** — `TruckRotation` append-only, `weighing_ticket_id` NOT NULL, `cycle_time_minutes` dérivé.
- **D2-31** — Pesage = **saisie manuelle obligatoire** (intégration matérielle reportée Phase 5). `WeighingTicket` avec `gross_kg`, `tare_kg`, `net_kg` (colonne générée Postgres 18), signatures SHA-256, `content_hash` SHA-256 du payload canonique, `is_offline_generated` bool.
- **D2-32** — Numérotation offline : `<SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>` (ex. `CIV01-20260615-MOB42-0007`). Serveur réordonne mais ne renumérote pas.
- **D2-33** — Signatures via plugin `signature` Flutter → PNG compressé → S3 content-addressed.
- **D2-34** — Dispatching = vue web read-only + affectation manuelle. Pas d'algorithme. Auto reporté.
- **D2-35** — `TruckRotation` validée publie `rotation_completed` qui matérialise `STOCKPILE_INFLOW` dans la **même transaction** via outbox pattern (worker BullMQ).

**Stockpile event-sourced (STK-01..03)**
- **D2-40** — `stockpile_event` append-only **partitionné par mois sur `occurred_at_utc`**. Types : `STOCKPILE_INFLOW`, `STOCKPILE_OUTFLOW_SALE`, `STOCKPILE_ADJUSTMENT`, `STOCKPILE_TRANSFER`. `tonnage_delta_kg` signé. `prev_hash`/`row_hash` obligatoires (chain-of-hash D-28).
- **D2-41** — Projection `stockpile_balance` rafraîchie sur event + recalcul nightly 03:00 site-tz (BullMQ cron). Dérive > 1 kg → alerte.
- **D2-42** — Coût moyen pondéré : `cost_model_version = 1` Phase 2 = carburant alloué pro-rata tonnage. Version 2 Phase 4.
- **D2-43** — `stockpile_threshold` par `(stockpile_id, calibre_code)` avec `low_kg`, `critical_low_kg`, `high_kg`. Évaluation à chaque mutation balance → événement `threshold_crossed`.

**Carburant (CAR-01..04)**
- **D2-50** — `fuel_tank_event` append-only mensuel partitionné, chain-of-hash, types `FUEL_DELIVERY_IN`, `FUEL_DISPENSE_OUT`, `FUEL_ADJUSTMENT`. `cost_per_liter_minor_units` + currency sur livraisons.
- **D2-51** — `EquipmentRefuel` append-only mobile offline, à la sync génère atomiquement `FUEL_DISPENSE_OUT` + `EquipmentFuelConsumption`.
- **D2-52** — Alerte L/h : rolling 7j vs median 30j ; > 1.5× ou < 0.4× → événement `production.fuel.anomaly_detected` (canal in-app + email).
- **D2-53** — Job nightly 03:30 site-tz : événement informationnel `FUEL_RECONCILIATION` (ne corrige pas). Écart > 0.5% volume cuve → alerte.
- **D2-54** — Phase 2 livre `energy_consumption_reading` (relevé manuel mensuel, web uniquement). KPI dérivés Phase 5.

**HSE (HSE-01..06)**
- **D2-60** — `HseIncident` append-only **avec chain-of-hash D-28 obligatoire** (en plus de l'audit standard). Catégorie enum, sévérité 1–5, `people_impacted` JSONB, `equipment_impacted_ids` UUID[], `chronology_md`, `content_addressed_attachments` TEXT[].
- **D2-61** — Photos content-addressed S3 + **Object Lock Governance, retention 7 ans**. Compression mobile 2 Mo / 1920px, EXIF préservé.
- **D2-62** — `CorrectiveAction` (non-append-only, audit triggers), statuts `open → in_progress → done → verified → closed`. Incident sévérité ≥ 4 ne peut être `closed` qu'une fois toutes CAPA `verified`.
- **D2-63** — Habilitations/EPI **reportés Phase 3**. Pas de carcasse `employee_certification` sauf si pilote remonte besoin.
- **D2-64** — Audit sécurité périodique reporté Phase 3.
- **D2-65** — `TF = (accidents avec arrêt × 1 000 000) / heures travaillées`. Heures = proxy `sum(OperationalDay.workforce_headcount × 8h)`.

**Dashboard (DSH-01..02)**
- **D2-70** — 2 personas Phase 2 : Directeur Site + Chef Carrière. Direction Groupe = Phase 4.
- **D2-71** — **SSE** depuis NestJS, subscription `(tenant_id, site_id, dashboard_key)`. Pas de WebSocket. Fallback polling 30s. Angular `EventSource` natif retry exponentiel.
- **D2-72/73** — KPIs définis par persona dans CONTEXT (tonnage J/J-1/J/S/J/M, rendements, TF, niveaux cuves, etc.).
- **D2-74** — Module `alerts` consommant événements. Canaux : **in-app obligatoire**, **email best-effort SES**, SMS reporté Phase 6. Table `alert` (status `open|acked|resolved`).

**Mobile (Flutter)**
- **D2-80** — 6 nouveaux écrans (Foration, Extraction, Transport, Pesage, Ravitaillement, Incident HSE) offline-first via PowerSync `append_only_event`.
- **D2-81** — UX terrain : boutons ≥ 56 dp, contraste haut, confirmations explicites append-only, photos compressées, GPS avec `accuracy` affichée (rouge >30m, ambre >10m, vert sinon).
- **D2-82** — Device matrix : Samsung Galaxy Tab Active 3 (pesage, 8" rugged, Android 11+) + Samsung XCover Pro 6 (smartphone rugged, Android 12+).
- **D2-83** — **Co-design 2 jours BLOQUANT** avant prod code mobile métier. 2 opérateurs foreuse + 1 chauffeur + 1 chef de quart + 1 HSE. Livrable wireframes archivés `docs/design/phase-02/`.

**Web (Angular)**
- **D2-90** — 7 modules feature lazy + `dashboard-site` + `alerts-inbox`. AG Grid pour listes, Formly pour formulaires CRUD.
- **D2-91** — Carte Leaflet site (zones, bancs, stockpiles, cuves, engins). Tiles OSM/MapTiler auto-hébergées avec fallback offline.

**Coût-tonne**
- **D2-100** — Phase 2 livre la plomberie, pas le KPI final. Dashboard expose `cost_per_ton_provisional` étiqueté "provisoire" en UI (obligatoire).

**Sécurité & rôles**
- **D2-110** — Nouveaux rôles Keycloak : `OPERATOR_DRILLING`, `OPERATOR_EXCAVATOR`, `TRUCK_DRIVER`, `WEIGHING_OPERATOR`, `HSE_OFFICER`, `SITE_MANAGER`, `QUARRY_CHIEF`. Granularité `(role, site_id)`.
- **D2-111** — `STOCKPILE_ADJUSTMENT` + `FUEL_ADJUSTMENT` réservés `SITE_MANAGER`. Modification chronology incident = nouvel événement `HSE_INCIDENT_CHRONOLOGY_APPENDED`.

**Performance**
- **D2-120** — Cible : 1 site pilote, ~50 users concurrents, ~2 000 `DrilledHole`/jour, ~500 rotations/jour, ~10 incidents/mois. Partitionnement mois natif Postgres uniquement. Pas de read replica.

### Claude's Discretion
- Schéma exact migrations SQL (TypeORM CLI Phase 1 format)
- Découpage composants Angular (modules feature, components, services)
- Structure écrans Flutter (Riverpod notifiers vs AsyncNotifier, nested vs flat routing)
- BullMQ vs pg-boss (**recommandation Claude : BullMQ** — Redis déjà présent Phase 1)
- Stratégie seeding démo (1 site, 2 stockpiles, 1 cuve, 5 engins, 3 mois données)
- Choix exact bibliothèques signature et compression photo Flutter

### Deferred Ideas (OUT OF SCOPE)
- Intégration matérielle pont-bascule (RS232/Modbus) → Phase 5
- Dispatching automatique camions → backlog
- Habilitations/EPI HSE-03/04 → Phase 3
- Audit sécurité périodique HSE-05 → Phase 3
- TF consolidé groupe → Phase 4
- Concassage, Criblage, Maintenance, RH, Ventes → Phase 3
- Coût/tonne final, marge, OHADA → Phase 4
- Télématique flotte, capteurs cuve, sanity 3 couches → Phase 5
- Realms Keycloak par pays, drills restore, pen-test → Phase 6
- Re-valorisation rétroactive `cost_model_version=2` → Phase 4
- WebSocket bidirectionnel dashboard → Phase 4+
- SMS notifications → Phase 6
- iOS native → Phase 6
- Portail client privé → v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOR-01 | Plan de forage (Chef Carrière) | D2-10 `DrillingPlan` + sync pessimistic_lock + FSM ; web Angular Formly + AG Grid |
| FOR-02 | Saisie trou foré mobile offline | D2-11 `DrilledHole` append-only + PowerSync `append_only_event` + Drift local + GPS accuracy |
| FOR-03 | Rendement m/h | D2-13 MaterializedView refresh debounced + exposition API dashboard |
| FOR-04 | Conso gasoil par foreuse/session | Lien optionnel `fuel_liters_consumed` sur DrilledHole + corrélation CAR-02 |
| FOR-05 | Foreuse en panne bloque affectation | D2-14 `production_equipment.status` + check service `DrillingPlanService.assignMachine()` |
| EXT-01 | Cycles extraction mobile offline | D2-20 `ExtractionCycle` append-only + downtime + reason_code enum |
| EXT-02 | Rendement extraction t/h | Calcul `sum(estimated_tonnage) / (cycle_time - downtime)` matérialisé |
| TRP-01 | Rotation camion (chargement, déchargement, tonnage, cycle) | D2-30 `TruckRotation` + FK `weighing_ticket_id` |
| TRP-02 | Ticket pesée numérique signé offline | D2-31..33 — numérotation offline + content_hash + signatures S3 |
| TRP-03 | Dispatching | D2-34 vue read-only + affectation manuelle (algo backlog) |
| STK-01 | Grand livre event-sourced | D2-40 partitionnement mois + chain-of-hash + 4 types événements |
| STK-02 | Alertes seuils | D2-43 `stockpile_threshold` + événement `threshold_crossed` → module `alerts` |
| STK-03 | Valorisation moyenne pondérée | D2-42 `cost_model_version=1` (carburant only Phase 2), v2 Phase 4 |
| CAR-01 | Cuve event-sourced | D2-50 `fuel_tank_event` + recon quotidienne D2-53 |
| CAR-02 | Ravitaillement mobile offline | D2-51 `EquipmentRefuel` + atomicité `FUEL_DISPENSE_OUT` + `EquipmentFuelConsumption` |
| CAR-03 | Alerte ratio L/h anormal | D2-52 rolling 7j vs median 30j, multiplicateurs configurables |
| CAR-04 | Énergie site | D2-54 `energy_consumption_reading` manuel mensuel (KPI dérivés Phase 5) |
| HSE-01 | Incident append-only chain-of-hash + photos immuables | D2-60..61 chain-of-hash + Object Lock S3 7 ans |
| HSE-02 | CAPA workflow | D2-62 FSM 5 statuts + règle blocage clôture sévérité ≥ 4 |
| HSE-03 | EPI | **Reporté Phase 3** — research support : none Phase 2 |
| HSE-04 | Habilitations as-of | **Reporté Phase 3** — research support : none Phase 2 (carcasse opt-in si pilote bloquant) |
| HSE-05 | Audit sécurité périodique | **Reporté Phase 3** |
| HSE-06 | TF accidents | D2-65 calcul rolling 12m + proxy `OperationalDay.workforce_headcount × 8h` |
| DSH-01 | Dashboard temps réel par profil | D2-70..71 SSE 2 personas Phase 2 (Directeur Site, Chef Carrière) |
| DSH-02 | KPI Production | D2-72..73 KPI sets définis |
</phase_requirements>

## Standard Stack

### Core (déjà installé Phase 1 — réutilisation)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 11.x | Backend framework | Phase 1 validé. EventEmitter2 + `@nestjs/event-emitter` pour cross-module Phase 2. **HIGH** |
| Node.js | 24 LTS | Runtime | Phase 1 validé. **HIGH** |
| PostgreSQL | 18 | DB | Phase 1 validé. Phase 2 utilise **generated columns** (`net_kg`) et **range partitioning** mensuel natif. **HIGH** |
| PostGIS | 3.5 | Geospatial | Phase 2 : `gps_point GEOGRAPHY(POINT,4326)` sur `DrilledHole` + carte Leaflet. **HIGH** |
| TimescaleDB | 2.17+ | Time-series | Phase 2 : pas indispensable (event tables suffisent avec partitionnement Postgres natif). Réservé Phase 5. **HIGH** |
| Flutter | 3.35 stable | Mobile | Phase 1 validé. Phase 2 : nouveaux écrans + offline. **HIGH** |
| PowerSync | 1.9+ | Sync engine | Phase 2 enregistre 13+ entités append-only via sync registry Phase 1. **HIGH** |
| Drift | 2.20 | Flutter ORM | Phase 2 : tables locales miroir + drafts auto-save 5s. **HIGH** |
| Riverpod | 2.5+ | Flutter state | Recommandation Claude : `AsyncNotifier` pour écrans listant + drafts ; `StateNotifier` pour formulaires multi-step. **HIGH** |
| Angular | 20 LTS | Web | Phase 1 validé. Phase 2 lazy modules feature. **HIGH** |
| AG Grid | 32.x (Community minimum, Enterprise recommandé) | Tables web | Listes rotations/incidents/événements. **Confirmer budget Enterprise Phase 2** (CONTEXT canonical_refs). **HIGH** |
| `@ngx-formly/core` | 6.x | Dynamic forms | Plans de forage, seuils stockpile, config alertes. **HIGH** |
| Transloco | latest | i18n web | Namespaces : `foration`, `extraction`, `transport`, `stockpile`, `fuel`, `hse`, `dashboard`, `alerts`. **HIGH** |
| `@asymmetrik/ngx-leaflet` + Leaflet | latest | Carte site | Tiles auto-hébergées OSM, fallback offline cache. **HIGH** |
| Keycloak | 26 | Identity | Phase 2 ajoute 7 rôles D2-110 dans realm Phase 1. **HIGH** |
| BullMQ | latest | Job queue | Recalcul stockpile (cron 03:00 site-tz), recon carburant (03:30), anomaly detection, outbox dispatcher. **HIGH** |
| dinero.js | 2.x | Money | Phase 2 : `cost_per_liter`, `cost_per_ton_provisional`, valorisation moyenne pondérée. **HIGH** |
| OpenTelemetry | 0.50+ | Tracing | Instrumentation des 7 nouveaux modules + handlers événements. **HIGH** |

### Supporting (à ajouter Phase 2)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/event-emitter` | 2.x | EventEmitter2 wrapper NestJS | Cross-module domain events D2-02 |
| `signature` (Flutter) | latest | Capture signature trace | Pesage TRP-02 (chauffeur + opérateur pont-bascule) |
| `flutter_image_compress` | latest | Compression photo 2 Mo / 1920px | HSE incidents D2-61, ravitaillement jauge |
| `geolocator` | latest | GPS + accuracy | DrilledHole + HseIncident location |
| `mobile_scanner` | latest | QR/barcode | Optionnel : scan QR engin pour pré-remplir refuel form |
| `@aws-sdk/client-s3` v3 | latest | S3 Object Lock client | Bucket HSE attachments avec Object Lock Governance |
| `pg-boss` | latest | (Alternative à BullMQ) | NON retenu — recommandation Claude : BullMQ |

**Installation backend (illustratif) :**
```bash
pnpm add @nestjs/event-emitter eventemitter2 @aws-sdk/client-s3
```

**Installation Flutter :**
```bash
flutter pub add signature flutter_image_compress geolocator mobile_scanner
```

**Version verification:** Toutes versions Phase 1 héritées sont déjà fixées dans `apps/api/package.json` et `apps/mobile/pubspec.yaml`. Le planner devra vérifier `npm view @nestjs/event-emitter version` et `pub global activate` au moment de l'install.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ | pg-boss | pg-boss évite la dépendance Redis mais Redis est déjà présent Phase 1 → BullMQ retenu |
| EventEmitter2 in-process | Kafka/Redpanda | Reporté Phase 5 (volume IoT). Phase 2 reste in-process, outbox pattern garantit durabilité |
| SSE | WebSocket | WebSocket reporté Phase 4+ (bidirectionnel). SSE one-way suffit Phase 2 |
| Imperative GPS capture | Background geolocation | Phase 2 = capture explicite au moment de la saisie (pas de tracking continu) |

## Architecture Patterns

### Recommended Project Structure (additions Phase 2)

```
apps/api/src/modules/
├── foration/
│   ├── entities/ (drilling-plan.entity.ts, drilled-hole.entity.ts, production-equipment.entity.ts)
│   ├── dto/
│   ├── services/ (drilling-plan.service.ts, drilled-hole.service.ts, yield-projection.service.ts)
│   ├── controllers/
│   ├── events/ (hole-drilled.event.ts)
│   ├── sync.registration.ts  # @SyncEntity decorators
│   └── foration.module.ts
├── extraction/
├── transport/
│   ├── entities/ (truck-rotation.entity.ts, weighing-ticket.entity.ts)
│   ├── services/ (ticket-numbering.service.ts, content-hash.service.ts)
│   └── transport.module.ts
├── stockpile/
│   ├── entities/ (stockpile-event.entity.ts, stockpile-balance.projection.ts, stockpile-threshold.entity.ts)
│   ├── services/ (event-appender.service.ts, balance-projector.service.ts, valuation.service.ts)
│   ├── workers/ (nightly-reconciliation.processor.ts)
│   └── stockpile.module.ts
├── fuel/
│   ├── entities/ (fuel-tank-event.entity.ts, equipment-refuel.entity.ts, equipment-fuel-consumption.entity.ts)
│   ├── services/ (anomaly-detection.service.ts, reconciliation.service.ts)
│   └── fuel.module.ts
├── hse/
│   ├── entities/ (hse-incident.entity.ts, corrective-action.entity.ts)
│   ├── services/ (incident-chain.service.ts, capa-workflow.service.ts, tf-calculator.service.ts)
│   └── hse.module.ts
├── production-dashboard/
│   ├── projections/ (director-site.projection.ts, quarry-chief.projection.ts)
│   ├── sse/ (sse.controller.ts, sse-subscription.registry.ts)
│   └── production-dashboard.module.ts
└── alerts/
    ├── entities/ (alert.entity.ts)
    ├── channels/ (in-app.channel.ts, email-ses.channel.ts)
    ├── handlers/  # subscribe to domain events
    └── alerts.module.ts

apps/api/src/common/outbox/
├── entities/outbox-event.entity.ts
├── outbox.service.ts
├── workers/outbox-dispatcher.processor.ts  # BullMQ
└── outbox.module.ts

apps/web/src/app/features/
├── foration/ (lazy)
├── extraction/ (lazy)
├── transport/ (lazy, includes pesage + dispatch view)
├── stockpile/ (lazy)
├── fuel/ (lazy)
├── hse/ (lazy, includes CAPA inbox)
├── dashboard-site/ (lazy, 2 personas routes)
├── alerts-inbox/ (lazy)
└── site-map/ (lazy, Leaflet)

apps/mobile/lib/features/
├── foration/ (drill_plan_list, hole_capture_form, hole_drafts)
├── extraction/ (cycle_capture)
├── transport/ (rotation_form, weighing_form)
├── fuel/ (refuel_form)
└── hse/ (incident_form, capa_inbox)
```

### Pattern 1: Outbox Pattern transactionnel (rotation → stockpile inflow)

**What:** Garantit qu'un `STOCKPILE_INFLOW` est créé exactement une fois pour chaque `TruckRotation` validée, même en cas de crash après commit DB mais avant publication event bus.
**When to use:** Toute matérialisation cross-module à partir d'un événement de domaine append-only.
**Example:**
```typescript
// transport/services/rotation.service.ts
async complete(rotationId: string, dto: CompleteRotationDto) {
  return this.dataSource.transaction(async (mgr) => {
    const rotation = await mgr.findOneOrFail(TruckRotation, { where: { id: rotationId } });
    rotation.unloadedAtUtc = new Date();
    await mgr.save(rotation);

    // outbox row dans la MÊME tx
    await mgr.insert(OutboxEvent, {
      aggregateType: 'TruckRotation',
      aggregateId: rotation.id,
      eventType: 'production.transport.rotation_completed',
      payload: { rotationId: rotation.id, tonnageKg: rotation.loadedTonnageT * 1000, ... },
      tenantId: rotation.tenantId,
      status: 'pending',
    });
  });
  // Le worker BullMQ "outbox-dispatcher" poll les pending toutes les 1s,
  // publie via EventEmitter2, et marque dispatched.
}

// stockpile/handlers/rotation-completed.handler.ts
@OnEvent('production.transport.rotation_completed')
async onRotationCompleted(payload: RotationCompletedPayload) {
  await this.stockpileEventService.append({
    type: 'STOCKPILE_INFLOW',
    sourceReference: { rotationId: payload.rotationId },
    tonnageDeltaKg: payload.tonnageKg,
    // ...
  });
}
```

### Pattern 2: Chain-of-Hash sur 3 tables (D-28 réutilisé)

**What:** Chaque INSERT calcule `row_hash = sha256(prev_hash || canonical_payload)`. `prev_hash` = `row_hash` de la dernière ligne par `(tenant_id, table_name)`. CI test injecte une corruption et vérifie détection.
**When to use:** `stockpile_event`, `fuel_tank_event`, `hse_incident`.
**Example:** Réutiliser pattern Phase 1 `apps/api/src/modules/audit/audit-chain.verifier.ts`. Migration ajoute trigger `BEFORE INSERT` calculant `row_hash` côté DB.

### Pattern 3: Sync Registration (Phase 1 décorateur)

```typescript
@Entity('drilled_hole')
@SyncEntity({ strategy: 'append_only_event', includeColumns: ['id', 'plan_id', /* ... */] })
@TenantScoped()
export class DrilledHole { /* ... */ }
```

Chaque entité Phase 2 syncable mobile s'enregistre via `@SyncEntity` consommé par `apps/api/src/modules/sync/registry.ts` qui génère `powersync-rules.yaml`.

### Pattern 4: OperationalDay FK (Phase 1 obligation)

Toute entité opérationnelle Phase 2 : colonne `operational_day_id uuid NOT NULL REFERENCES operational_day(id)`. Le `OperationalDayResolver` Phase 1 résout depuis `(site_id, captured_at_local, tz)` au moment de l'INSERT serveur (et côté mobile à la capture pour validation locale).

### Pattern 5: SSE Push avec subscription registry

```typescript
@Controller('dashboard/sse')
export class DashboardSseController {
  @Get(':dashboardKey')
  @UseGuards(JwtGuard, TenantGuard)
  stream(@Req() req, @Param('dashboardKey') key: string): Observable<MessageEvent> {
    return this.subscriptions.subscribe(req.user.tenantId, req.user.siteId, key);
  }
}
```

Le registry s'abonne en interne aux événements de domaine et émet une `MessageEvent` (Observable RxJS) sur les `Subject` matchant le `(tenant, site, key)`.

### Anti-Patterns to Avoid
- **Update direct sur stockpile_balance** : interdit. Toute mutation passe par un nouvel `stockpile_event`. Balance = projection dérivée.
- **Édition d'un `DrilledHole`** : interdit. Correction = nouvel événement `DRILLED_HOLE_CORRECTED` avec `corrects_hole_id`.
- **Jointure SQL cross-module pour dashboard** : interdit (D2-03). Utiliser projections matérialisées + handlers.
- **`device.now()` pour ordonnancement** : interdit (Pitfall #3 Phase 1). Utiliser device_short_id + local_seq + serveur réordonne.
- **Float pour tonnage** : utiliser `decimal(10,2)` pour `loaded_tonnage_t` et `bigint` minor units pour money.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Offline sync conflict resolution | Custom queue + REST | PowerSync `append_only_event` strategy (registry Phase 1) | Phase 1 a déjà 4 stratégies wired ; chaos test existe |
| Money math | float + multiply | dinero.js v2 + minor units | Pitfall #4 Phase 1 |
| Signature capture mobile | Canvas custom | Plugin `signature` Flutter | Battle-tested, exporte PNG |
| Image compression | Resize manuel | `flutter_image_compress` | Préserve EXIF, multiples codecs |
| JWT tenant binding | Header inspect manual | TenantGuard + nestjs-cls Phase 1 | Defense-in-depth + RLS GUC binding déjà fait |
| Chain-of-hash | Calcul applicatif | Trigger SQL + verifier Phase 1 | Empêche bypass applicatif |
| Job scheduling cron | setInterval Node | BullMQ + Redis Phase 1 | Distribué, persistant, retries exponentiels |
| SSE retry/reconnect | EventSource raw | RxJS `retryWhen` + exponential backoff côté Angular | Pattern standard, gère reconnect graceful |
| Object storage immutability | S3 bucket policy fragile | S3 Object Lock Governance mode | Compliance OHADA 7 ans, override root uniquement |
| Outbox pattern | Manual transaction + pub/sub | Table `outbox_event` + worker BullMQ + transactional insert | Atomicité garantie, idempotence trivial |
| RLS tenant scoping | App-layer WHERE | Policies SQL Phase 1 + GUC binding | Defense-in-depth, BI safe |

**Key insight:** Phase 2 doit **consommer** au maximum les primitives Phase 1. Aucun nouveau pattern transverse n'est inventé ; le travail est essentiellement de l'application métier de patterns existants.

## Reusable Phase-1 Assets

Inventaire concret depuis `apps/api/src/modules/` :

| Asset (Phase 1 path) | Phase 2 usage |
|----------------------|---------------|
| `tenancy/tenancy.module.ts`, `tenancy/cls/`, `tenancy/guards/`, `tenancy/middleware/`, `tenancy/typeorm/` | `TenantGuard` + CLS context + RLS GUC binding sur les 8 nouveaux modules |
| `audit/audit-log.entity.ts`, `audit/audit-chain.verifier.ts`, `audit/entities/` | Réutilisé pour 3 chain-of-hash tables (`stockpile_event`, `fuel_tank_event`, `hse_incident`) — copier le pattern verifier + trigger SQL |
| `sync/registry.ts`, `sync/powersync-rules.yaml`, `sync/sync.controller.ts`, `sync/daily-activity-log.entity.ts` | Enregistrement de 13+ entités Phase 2 via `@SyncEntity` ; `powersync-rules.yaml` régénéré |
| `master-data/` (Site, Zone, Bench) | FK depuis nouvelles entités Phase 2 ; pas de modification, juste consommation |
| `identity/` (Keycloak JWT, role guards) | Ajout 7 rôles D2-110 ; nouveau guard combiné `(role × site_id)` |
| `i18n/` | Nouveaux namespaces `foration.*`, `extraction.*`, `transport.*`, `stockpile.*`, `fuel.*`, `hse.*`, `dashboard.*`, `alerts.*` |
| `common/money/` (dinero.js helpers) | `cost_per_liter_minor_units`, `cost_per_ton_provisional`, valuation pondérée |
| `common/cls/` + `OperationalDayResolver` | FK obligatoire partout (lint CI Phase 1 alerte si manquant) |
| `otel/` | Instrumentation 8 nouveaux modules |
| `health/` | Endpoints `/health` étendus avec checks BullMQ workers (outbox dispatcher, reconciliation) |
| `apps/web/` shell Angular | Lazy load 9 nouveaux modules feature |
| `apps/mobile/` shell Flutter | Ajout 6 features (auth + Drift + PowerSync déjà câblés) |
| `infra/` OpenTofu modules | Ajout module S3 bucket `gravel-{env}-hse-attachments-{region}` + Object Lock + IAM role pour API |

**Patterns établis à suivre (lint CI Phase 1 enforce) :**
- `TenantScopedRepository<T>` wrapper sur tout repository
- `@SyncEntity({ strategy: ... })` sur entités mobile-syncable
- `@Auditable()` sur entités muteables (CAPA)
- Money colonnes : `{amount_minor: bigint, currency: char(3), fx_rate_id: uuid?}`
- `operational_day_id` FK NOT NULL
- I18n keys `<module>.<feature>.<key>`
- Migrations TypeORM CLI `<timestamp>__<verb>_<entity>.sql`

## Integration Points & Outbox

### Cross-module event topology

```
[transport]  rotation_completed ──┐
                                  ├──> [outbox_event] ──[BullMQ outbox-dispatcher]──> EventEmitter2
[foration]   hole_drilled ────────┤                                                       │
[extraction] cycle_logged ────────┤                                                       ├──> [stockpile] balance projector
[fuel]       refuel_synced ───────┤                                                       ├──> [production-dashboard] SSE push
[hse]        incident_created ────┘                                                       ├──> [alerts] alert creator
                                                                                          └──> [fuel] anomaly detector
[stockpile]  threshold_crossed ─────────────────────────────────────────────────────────> [alerts]
[fuel]       anomaly_detected ──────────────────────────────────────────────────────────> [alerts]
```

### Outbox table schema
```sql
CREATE TABLE outbox_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending', -- pending|dispatched|failed
  dispatched_at   timestamptz,
  retry_count     int NOT NULL DEFAULT 0,
  last_error      text
);
CREATE INDEX outbox_pending_idx ON outbox_event(status, created_at) WHERE status = 'pending';
```

RLS policy identique aux autres tables (tenant_id). Le worker `OutboxDispatcherProcessor` poll toutes les 1s (BullMQ repeatable job), lit batch 50 lignes `pending`, émet via EventEmitter2, marque `dispatched`, retry exponentiel sur failure (max 5).

### SSE projection refresh

1. Handler `@OnEvent('production.transport.rotation_completed')` dans `production-dashboard/` met à jour la projection en mémoire (cached par `(tenant, site, dashboard_key)`).
2. Push via `Subject.next(payload)` sur tous les abonnés SSE matchants.
3. Recalcul complet de projection au nightly job 02:00 site-tz (idempotent, anti-dérive).

### S3 Object Lock setup (HSE attachments)

```
Bucket: gravel-{env}-hse-attachments-{region}
- Versioning: Enabled (prérequis Object Lock)
- Object Lock: Enabled, default mode Governance, retention 7 ans (2557 jours)
- Lifecycle: Aucune transition tier (les pièces HSE restent disponibles instantané)
- Encryption: SSE-KMS
- Bucket policy: deny tous DELETE non-root pendant retention
```

Module OpenTofu `infra/modules/s3-hse-attachments/main.tf` à créer ; sortie : bucket name + KMS key ID + IAM role ARN pour l'API.

## Common Pitfalls

### Pitfall 1: Conflits append-only sur saisies offline simultanées même `hole_index_in_plan`
**What goes wrong:** Deux opérateurs offline saisissent le trou n°7 du même plan. Au sync, deux events `DrilledHole` arrivent avec le même `(plan_id, hole_index_in_plan)`.
**Why it happens:** `hole_index_in_plan` est une séquence locale (D2-11), pas globale.
**How to avoid:** PAS de contrainte UNIQUE sur `(plan_id, hole_index_in_plan)`. Le serveur tolère les doublons d'index et expose un drawer "Conflits à arbitrer" pour le Chef Carrière (qui choisit lequel garder ou les laisse coexister avec index renuméroté).
**Warning signs:** Contrainte UNIQUE qui rejette des sync arrivals (perte donnée silencieuse).

### Pitfall 2: Partition pruning sur `stockpile_event` qui dégrade après 12 mois
**What goes wrong:** Queries de balance sur des stockpiles avec 24+ partitions mensuelles ralentissent.
**Why it happens:** Postgres planner peut faire un sequential scan sur toutes les partitions si la projection `stockpile_balance` n'est pas le chemin principal.
**How to avoid:** Toujours interroger la projection `stockpile_balance` pour le solde courant ; ne taper les events historiques que via `(tenant_id, site_id, stockpile_id, occurred_at_utc >= X)` (constraint exclusion). Index `(stockpile_id, occurred_at_utc DESC)` par partition.
**Warning signs:** `EXPLAIN ANALYZE` montrant scan de partitions > 3 mois pour un calcul de solde.

### Pitfall 3: Dérive `stockpile_balance` vs `sum(stockpile_event)`
**What goes wrong:** Bug dans event handler → balance n'est pas mise à jour. Solde affiché diverge du grand livre.
**How to avoid:** Job nightly 03:00 site-tz qui recalcule complet `SUM(tonnage_delta_kg) GROUP BY stockpile_id, calibre_code` et compare. Dérive > 1 kg → alert + auto-reset projection.
**Warning signs:** Plaintes opérateurs "le solde n'a pas bougé après ma rotation".

### Pitfall 4: Faux positifs sur alerte L/h ratio (CAR-03)
**What goes wrong:** Engin neuf, peu de données → median 30j peu fiable, alertes spam les premiers jours.
**How to avoid:** Seuil minimum `min_observations = 10 refuels in last 30d` AVANT d'activer l'alerte. Multiplicateurs configurables par site (`alerts_config` table). Burn-in period 30j marqué visuellement en dashboard.
**Warning signs:** Directeur Site qui ack des alertes carburant sans investigation.

### Pitfall 5: Upload photo qui échoue après sync incident, perdant la pièce immuable
**What goes wrong:** Incident syncé avec `content_addressed_attachments` listant un SHA-256, mais l'upload S3 a échoué. La référence pointe vers rien.
**How to avoid:** Deux phases : (1) sync incident en pending-attachment ; (2) upload S3 avec retry exponentiel ; (3) ack du serveur déclenche transition vers `finalized`. Le mobile re-pousse jusqu'à confirmation. Le verifier chain-of-hash s'exécute après finalization.
**Warning signs:** Incidents en statut `pending_attachment` > 24h en production.

### Pitfall 6: SSE reconnect avec perte d'événements pendant la disconnection
**What goes wrong:** Le navigateur perd la connexion, retry exponential. Pendant ce gap, 5 alertes ont été générées côté serveur.
**How to avoid:** Endpoint SSE accepte un `Last-Event-ID` header (spec HTML5 SSE). Le serveur conserve un buffer en mémoire des N derniers events par `(tenant, site, key)` (TTL 5 min) et replays sur reconnect.
**Warning signs:** Directeur Site rapporte des alertes "qu'il n'a jamais vues" alors qu'elles sont dans la table.

### Pitfall 7: GPS accuracy faible sous le matériau de stockpile (Pitfall #9 Phase 1 reformulé)
**What goes wrong:** Opérateur foreuse ne peut pas valider le trou car GPS reste à `accuracy > 30m`.
**How to avoid:** UI permet **toujours** la submission même `accuracy > 30m` mais marque flag rouge "GPS dégradé" sur l'événement. Le Chef Carrière voit cette flag en dashboard et peut demander capture manuelle de zone.
**Warning signs:** Drafts SQLite qui s'accumulent sans submit jamais.

### Pitfall 8: Numérotation offline ticket pesage → collision après reset device
**What goes wrong:** Le téléphone est reflashé, `LOCAL_SEQ` repart à 1, mais des tickets `MOB42-0001..0050` ont déjà été syncés. Nouveau `0001` arrive.
**How to avoid:** Le `device_short_id` est dérivé du **device install UUID persistant** (pas du device hardware). Re-flash = nouveau UUID = nouveau `device_short_id`. Côté serveur, ajouter `UNIQUE (tenant_id, ticket_number)` (sans contrainte cross-device) car la composition garantit l'unicité.

### Pitfall 9: Photo Object Lock empêche la suppression de doublons accidentels
**What goes wrong:** Opérateur upload accidentellement la mauvaise photo. Object Lock 7 ans → impossible à effacer.
**How to avoid:** Toujours uploader sous content-hash key. Une "mauvaise photo" reste en S3 mais n'est référencée par aucun incident. Documentation explicite : ne pas confondre référencement et stockage. Compliance OHADA exige immuabilité, pas suppression.

### Pitfall 10: Outbox dispatcher tombe en panne → matérialisation stockpile lag de plusieurs heures
**How to avoid:** Health check `/health` inclut "outbox lag = oldest pending - now()" ; alerte ops si > 60s. Worker redondant (2 replicas BullMQ).

## Code Examples

### Append-only event avec chain-of-hash (réutilise Phase 1)
```typescript
// stockpile/services/event-appender.service.ts
async appendInflow(input: AppendInflowInput): Promise<StockpileEvent> {
  return this.dataSource.transaction(async (mgr) => {
    // Verrou ROW pour récupérer prev_hash de la dernière ligne tenant_id/table
    const prev = await mgr
      .createQueryBuilder(StockpileEvent, 'e')
      .where('e.tenant_id = :tid', { tid: input.tenantId })
      .orderBy('e.created_at_utc', 'DESC')
      .setLock('pessimistic_write')
      .getOne();

    const prevHash = prev?.rowHash ?? '0'.repeat(64);
    const canonical = canonicalizeForHash({ ...input, prevHash });
    const rowHash = sha256Hex(canonical);

    const event = mgr.create(StockpileEvent, {
      ...input,
      type: 'STOCKPILE_INFLOW',
      tonnageDeltaKg: input.tonnageDeltaKg, // positive
      prevHash,
      rowHash,
      costModelVersion: 1,
    });
    await mgr.save(event);

    // Publier event de domaine (consommé par projection balance + dashboard SSE + alerts)
    this.eventEmitter.emit('production.stockpile.event_appended', { eventId: event.id, ... });
    return event;
  });
}
```

### Drift table mobile (auto-save draft 5s) — Flutter
```dart
class DrilledHoleDraftsCompanion extends Table {
  TextColumn get id => text()();
  TextColumn get planId => text()();
  IntColumn get holeIndexInPlan => integer()();
  RealColumn get actualDepthM => real().nullable()();
  // ...
  DateTimeColumn get lastSavedAt => dateTime()();
  BoolColumn get isSubmitted => boolean().withDefault(const Constant(false))();
}

// Notifier Riverpod
final draftSaverProvider = Provider((ref) {
  return DraftSaver(
    interval: const Duration(seconds: 5),
    onTick: () => ref.read(drilledHoleDraftRepoProvider).flush(),
  );
});
```

### SSE controller NestJS
```typescript
@Sse(':dashboardKey')
@UseGuards(JwtGuard, TenantGuard)
stream(@Req() req, @Param('dashboardKey') key: string, @Headers('last-event-id') lastEventId?: string)
  : Observable<MessageEvent> {
  return this.subscriptions.subscribe({
    tenantId: req.user.tenantId,
    siteId: req.user.siteId,
    key,
    lastEventId,
  });
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| WebSocket dashboards | SSE one-way (D2-71) | Plus simple, fonctionne derrière proxies, fallback polling natif |
| Manuel polling REST 30s | SSE + Last-Event-ID | Pas de spam serveur, replay automatique |
| Photos S3 standard | S3 Object Lock Governance | Compliance OHADA 7 ans |
| Synchronisation maison | PowerSync `append_only_event` registry | Pattern Phase 1 réutilisé |
| Comptage explicite tonnage | Generated column `net_kg` (PG18) | Cohérence garantie côté DB |

## Open Questions

1. **Budget AG Grid Enterprise**
   - What we know: Phase 1 STACK.md recommande Enterprise, CONTEXT canonical_refs demande confirmation Phase 2.
   - What's unclear: Validation budget (USD/an).
   - Recommendation: Démarrer Community pour Phase 2, upgrader si pivot tables / master-detail / column grouping demandés en UAT.

2. **Device matrix exacte budget**
   - What we know: D2-82 cite Tab Active 3 + XCover Pro 6.
   - What's unclear: Quantité achetée pour le pilote, modèle de financement (loué/vendu à client).
   - Recommendation: Escalader au sponsor projet ; le planner inclut une task "procure 2 devices test" en Wave 0.

3. **Co-design workshop date**
   - What we know: D2-83 le rend BLOQUANT pour Wave 1 mobile.
   - What's unclear: 3 opérateurs réels disponibles, date, location, traduction Dioula/Baoulé nécessaire ?
   - Recommendation: Task Wave 0 "schedule + recruit co-design participants". S'aligner avec TODO STATE.md "Identifier 3 opérateurs terrain réels pour sprint co-design 2 semaines au kick-off Phase 2".

4. **S3 Object Lock retention legal review**
   - What we know: 7 ans choisi par CONTEXT comme alignement OHADA.
   - What's unclear: Confirmation par cabinet juridique Côte d'Ivoire (Code minier CI mentionne 5–10 ans selon doc).
   - Recommendation: Task Wave 0 "legal review Object Lock retention". Default 7 ans en attendant.

5. **`workforce_headcount` opération Phase 2**
   - What we know: D2-65 = proxy via `OperationalDay.metadata.workforce_headcount`.
   - What's unclear: Le champ existe-t-il déjà dans `OperationalDay` Phase 1, ou faut-il extension migration ?
   - Recommendation: Audit code Phase 1 `apps/api/src/common/operational-day/` ; si absent → migration mineure Wave 0.

6. **Multiplicateurs alertes L/h par défaut**
   - What we know: D2-52 dit "valeurs initiales par défaut" (1.5× et 0.4×).
   - What's unclear: Validation métier (chef carrière) sur ces valeurs.
   - Recommendation: Faire valider lors du co-design D2-83 + table `alerts_config` configurable.

7. **Carcasse `employee_certification`**
   - What we know: D2-63 — opt-in si pilote remonte besoin.
   - What's unclear: Décision prise quand ? Recommendation: laisser Phase 3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 18 + PostGIS + TimescaleDB image | Backend, migrations | ✓ (Phase 1) | postgis/postgis:18-3.5 | — |
| Redis (BullMQ + cache) | Job queue, outbox dispatcher | ✓ (Phase 1) | 7.x | pg-boss en backup |
| Keycloak | Identity + 7 nouveaux rôles | ✓ (Phase 1) | 26 | — |
| AWS S3 | HSE attachments + signature files | À provisionner Phase 2 | — | MinIO self-hosted pour dev |
| AWS SES (email alerts) | Module `alerts` channel email | À provisionner Phase 2 | — | Mailtrap pour dev/test |
| EKS + ArgoCD | Deploy 8 nouveaux modules | ✓ (Phase 1) | — | — |
| pnpm + Node 24 toolchain local Windows | Dev | ✗ (blocker STATE.md) | — | CI = source of truth ; preview env recommandé |
| Flutter SDK 3.35 local | Mobile dev | ✗ (blocker STATE.md) | — | CI build + device cloud (Firebase Test Lab) |
| Docker local Windows | Local dev | ✗ (blocker STATE.md) | — | Dev container cloud (GitHub Codespaces / Gitpod) |
| OpenTofu local | IaC | ✗ (blocker STATE.md) | — | Run via CI workflow `tofu plan` PR-gated |

**Missing dependencies with no fallback:** AWS S3 bucket Phase 2 (à créer via OpenTofu module dans Wave 0), AWS SES (à provisionner si email canal activé d'emblée).

**Missing dependencies with fallback:** Local Windows toolchain (CI source of truth Phase 1 carry-over ; le planner doit prévoir preview env si UAT live nécessaire).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework backend | Jest 29.x (Phase 1) + supertest + Testcontainers Postgres |
| Framework Flutter | flutter_test + integration_test + golden_toolkit |
| Framework Angular | Karma + Jasmine (Phase 1) + Playwright pour E2E |
| Config files | `apps/api/jest.config.ts`, `apps/mobile/test_driver/`, `apps/web/karma.conf.js`, `apps/web/playwright.config.ts` |
| Quick run (backend) | `pnpm --filter api test -- --testPathPattern={module}` |
| Quick run (mobile) | `flutter test test/features/{feature}` |
| Full suite (CI) | `pnpm test:ci` (aggregator job Phase 1) |
| Phase gate | Full suite green + chaos sync test + chain-of-hash integrity test |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOR-01 | Plan creation FSM | unit + integration | `pnpm --filter api test -- --testPathPattern=foration/drilling-plan` | ❌ Wave 0 (scaffold) |
| FOR-02 | DrilledHole append + sync | integration + sync chaos | `pnpm --filter api test:sync-chaos -- --entity=DrilledHole` | ❌ Wave 1 |
| FOR-03 | Yield projection refresh | unit + integration | `pnpm --filter api test -- --testPathPattern=foration/yield` | ❌ Wave 1 |
| FOR-04 | Fuel consumption linkage | integration | `pnpm --filter api test -- --testPathPattern=foration/fuel-link` | ❌ Wave 2 |
| FOR-05 | Equipment status blocks assignment | unit | inline in DrillingPlanService spec | ❌ Wave 1 |
| EXT-01 | Cycle capture offline + sync | integration | `pnpm --filter api test:sync-chaos -- --entity=ExtractionCycle` | ❌ Wave 1 |
| EXT-02 | Extraction yield projection | unit | `pnpm --filter api test -- --testPathPattern=extraction/yield` | ❌ Wave 1 |
| TRP-01 | Rotation creation + FK weighing | integration | `pnpm --filter api test -- --testPathPattern=transport/rotation` | ❌ Wave 2 |
| TRP-02 | Offline ticket numbering uniqueness | unit + chaos | `pnpm --filter api test:ticket-numbering` | ❌ Wave 2 |
| TRP-03 | Dispatch read-only view | E2E Playwright | `pnpm --filter web e2e -- --grep=dispatch` | ❌ Wave 2 |
| STK-01 | Event append + chain-of-hash | integration + tamper test | `pnpm --filter api test:chain-of-hash -- --table=stockpile_event` | ❌ Wave 2 |
| STK-02 | Threshold crossed → alert | integration | `pnpm --filter api test -- --testPathPattern=stockpile/threshold` | ❌ Wave 3 |
| STK-03 | Weighted avg cost v1 | unit | `pnpm --filter api test -- --testPathPattern=stockpile/valuation` | ❌ Wave 2 |
| CAR-01 | Fuel tank event + reconciliation | integration | `pnpm --filter api test -- --testPathPattern=fuel/tank-event` | ❌ Wave 3 |
| CAR-02 | Refuel atomic dual-write | integration | `pnpm --filter api test -- --testPathPattern=fuel/refuel` | ❌ Wave 3 |
| CAR-03 | L/h anomaly detection | unit | `pnpm --filter api test -- --testPathPattern=fuel/anomaly` | ❌ Wave 3 |
| CAR-04 | Energy reading CRUD | unit | `pnpm --filter api test -- --testPathPattern=fuel/energy` | ❌ Wave 3 |
| HSE-01 | Incident chain-of-hash + S3 immutability | integration + tamper test | `pnpm --filter api test:chain-of-hash -- --table=hse_incident` | ❌ Wave 3 |
| HSE-02 | CAPA FSM + blocage clôture sévérité ≥ 4 | unit + integration | `pnpm --filter api test -- --testPathPattern=hse/capa` | ❌ Wave 3 |
| HSE-06 | TF calculation rolling 12m | unit | `pnpm --filter api test -- --testPathPattern=hse/tf` | ❌ Wave 3 |
| DSH-01 | SSE subscription per role | integration | `pnpm --filter api test -- --testPathPattern=production-dashboard/sse` | ❌ Wave 3 |
| DSH-02 | KPI computation correctness | unit | `pnpm --filter api test -- --testPathPattern=production-dashboard/kpi` | ❌ Wave 3 |
| Cross | RLS cross-tenant leak (toutes nouvelles tables) | integration CI gate | `pnpm --filter api test:rls -- --tables=stockpile_event,fuel_tank_event,hse_incident,...` | ❌ Wave 1 (extension test Phase 1) |
| Cross | E2E mobile→API→dashboard rotation flow | E2E | `pnpm e2e:vertical-slice` | ❌ Wave 3 |

### Performance Tests (D2-120 cible)
| Scenario | Target | Tool | Wave |
|----------|--------|------|------|
| 50 users concurrents writing DrilledHole | p95 < 500ms | k6 | W3 |
| 2 000 hole events / journée ingest + projection refresh | < 5 min E2E lag | k6 | W3 |
| 500 rotations / jour + outbox dispatch + balance projection | < 10s lag rotation→balance | k6 | W3 |
| SSE 50 subscribers + 1 event/s | aucune perte, < 100ms latency | autocannon-sse | W3 |

### Sampling Rate
- **Per task commit:** `pnpm --filter <pkg> test -- --testPathPattern=<feature>` (lint + unit, < 30s)
- **Per wave merge:** `pnpm test:ci` (full unit + integration + RLS gate + chain-of-hash gate)
- **Phase gate:** Full suite + sync chaos test 48h simulé + perf k6 + E2E vertical slice + UAT manuel sur device rugged réel

### Wave 0 Gaps
- [ ] `apps/api/test/sync-chaos/append-only.spec.ts` — framework chaos test générique réutilisable Phase 2
- [ ] `apps/api/test/chain-of-hash/verify-table.spec.ts` — extension du verifier Phase 1 à 3 tables Phase 2 + injection corruption
- [ ] `apps/api/test/rls/cross-tenant-leak.spec.ts` — extension à toutes nouvelles tables (gen test from sync registry)
- [ ] `apps/api/test/perf/k6/` — scripts k6 baseline (rotation, drilled hole burst)
- [ ] `apps/api/test/e2e/vertical-slice.spec.ts` — scénario rotation mobile → ticket → stockpile inflow → dashboard SSE
- [ ] `apps/mobile/integration_test/sync_offline.dart` — flow offline capture → reconnect → assert serveur
- [ ] `apps/web/playwright/dashboard-sse.spec.ts` — E2E SSE reconnect with Last-Event-ID
- [ ] Test fixtures partagées : seed 1 site, 5 engins, 2 stockpiles, 1 cuve (3 mois données simulées)

## Wave & Plan Sizing Hypothesis

Recommandation: **4 waves, 8 plans, ~6–10 tasks par plan**, sur 7–10 semaines.

### Wave 0 — Pre-production (1 semaine, BLOQUANT)
**Plan W0-P1: Phase-2 Scaffolding & Co-design**
- Tasks (~7):
  1. Co-design workshop schedule + recruit 5 participants
  2. Wireframes mobile validés Foration/Extraction/Transport/Pesage/Refuel/HSE → `docs/design/phase-02/`
  3. Module `alerts` scaffolding + entity `alert` + RLS
  4. Outbox infra (`outbox_event` table + worker BullMQ `outbox-dispatcher`)
  5. S3 bucket Object Lock module OpenTofu + apply dev/staging
  6. Master-data extensions : `production_equipment` entity + CRUD web + seed
  7. Keycloak 7 nouveaux rôles + matrice RBAC update
  8. Test infra scaffolding : sync-chaos framework, chain-of-hash verifier extension, RLS gen, k6 baseline

### Wave 1 — Foration + Extraction (2 semaines)
**Plan W1-P2: Foration Backend + Web Plan Management**
- Tasks (~8): entities, migrations, FSM service, controllers, sync registration, web Angular feature module (plans liste/édit avec Formly + AG Grid), tests

**Plan W1-P3: Foration + Extraction Mobile Capture**
- Tasks (~9): Flutter screens (hole capture form + drafts auto-save + GPS accuracy + photo compress + extraction cycle), Drift schemas, Riverpod notifiers, PowerSync registrations, integration_test offline, golden tests

### Wave 2 — Transport + Stockpile + Pesage (2.5 semaines)
**Plan W2-P4: Transport + Weighing Ticket Offline-Signed**
- Tasks (~9): TruckRotation + WeighingTicket entities, ticket-numbering service, content-hash service, signature S3 upload pipeline, mobile pesage screen (tablet-optimized Tab Active 3), web rotations + dispatch read-only views, ADR-0009

**Plan W2-P5: Stockpile Event-Sourced + Valuation v1**
- Tasks (~10): stockpile_event entity + partitioned monthly + chain-of-hash trigger, balance projector handler, threshold entity + crossed event, valuation v1 (weighted average from fuel allocation), nightly recon cron, web stockpile module (events grid + balance + thresholds Formly), ADR-0006

### Wave 3 — Fuel + HSE + Dashboard + Alerts (3 semaines)
**Plan W3-P6: Fuel Tank Event-Sourced + Anomaly Detection**
- Tasks (~9): fuel_tank_event entity, EquipmentRefuel + atomic dual-write, anomaly detection rolling 7j/median 30j, nightly recon 03:30, mobile refuel screen, web fuel module + energy_consumption_reading CRUD, ADR-0007

**Plan W3-P7: HSE Incident Chain-of-Hash + CAPA**
- Tasks (~10): HseIncident entity + chain-of-hash, S3 Object Lock attachment pipeline, CAPA FSM + blocage règle sévérité ≥ 4, TF calculator (rolling 12m + < 12m fallback), mobile incident form (long form + photos + chronology markdown), web HSE feature + CAPA inbox, ADR-0008

**Plan W3-P8: Dashboard SSE + Alerts In-App/Email**
- Tasks (~10): production-dashboard projections (Directeur Site + Chef Carrière), SSE controller + subscription registry + Last-Event-ID buffer, web dashboard-site module (KPI tiles + Leaflet carte site + cost_per_ton_provisional étiqueté), alerts in-app drawer + email SES channel, perf k6 50-user load, E2E vertical slice rotation→balance→dashboard, ADR-0010, ADR-0005-bis (HSE retention legal review)

**Total estimé:** 8 plans, ~72 tasks, 7–10 semaines (incluant Wave 0 = 1 semaine, hors UAT pilote site réel).

## Sources

### Primary (HIGH confidence)
- `.planning/phases/02-vertical-slice-production/02-CONTEXT.md` — décisions D2-01..D2-120 locked
- `.planning/REQUIREMENTS.md` — REQ FOR/EXT/TRP/STK/CAR/HSE/DSH
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 baseline D-01..D-46
- `apps/api/src/modules/` — modules Phase 1 inventoriés (`tenancy`, `audit`, `sync`, `master-data`, `identity`, `i18n`, `health`)
- `apps/api/src/modules/sync/registry.ts` + `powersync-rules.yaml` — sync pattern
- `apps/api/src/modules/audit/audit-chain.verifier.ts` — chain-of-hash réutilisable
- `apps/api/src/common/money/`, `apps/api/src/common/operational-day/` — primitives Phase 1
- `docs/adr/ADR-0001-rls-multi-tenancy.md` — RLS pattern
- `docs/adr/ADR-0002-powersync-sync-engine.md` — sync strategies
- `docs/adr/ADR-0003-operational-day-model.md` — FK obligatoire
- `docs/adr/ADR-0004-audit-chain-of-hash.md` — chain-of-hash réutilisable Phase 2 sur 3 tables
- `.planning/research/PITFALLS.md` §1 (audit), §2 (sync), §3 (multi-currency), §6 (sanity pesage), §7 (HSE chain-of-custody), §9 (OperationalDay)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — versions + alternatives
- `.planning/research/ARCHITECTURE.md` — bounded contexts, event sourcing
- `.planning/research/FEATURES.md` — Foration, Pesage, Stockpile, HSE chapters
- PostgreSQL 18 generated columns + range partitioning docs
- NestJS 11 EventEmitter2 docs
- BullMQ repeatable jobs + delayed jobs
- HTML5 SSE spec + EventSource API
- AWS S3 Object Lock Governance mode docs

### Tertiary (LOW confidence, à valider)
- Multiplicateurs alertes L/h (1.5× / 0.4×) — valider co-design
- Object Lock retention 7 ans OHADA — confirmer legal review
- `workforce_headcount` champ existant ou à ajouter — audit code Phase 1 nécessaire

## Project Constraints (from CLAUDE.md)

**Domain & legal:**
- ERP carrière granite multi-site multi-pays UEMOA/CEMAC (XOF, OHADA)
- Offline-first obligatoire (sites isolés connectivité partielle)
- Audit OHADA → analytique uniquement, export vers Sage/Ciel/Odoo (PAS de comptabilité générale ERP)
- Sécurité explosifs/incidents = données sensibles → RBAC fin, audit trail, chiffrement at-rest + in-transit

**Stack obligatoire (Phase 1 validé) :**
- Backend: NestJS 11 / Node 24, PostgreSQL 18 + PostGIS + TimescaleDB, modular monolith
- Mobile: Flutter 3.35 + PowerSync + Drift + Riverpod
- Web: Angular 20 + Material + AG Grid + Formly + Transloco
- Identity: Keycloak 26 single realm Phase 2 (realms-per-pays Phase 6)
- Cache/queue: Redis 7.x + BullMQ
- Observability: OpenTelemetry → Grafana LGTM
- IaC: OpenTofu (PAS Terraform — BSL constraint)

**Workflow GSD obligatoire :**
- Toute modification fichier doit passer par `/gsd:quick`, `/gsd:debug` ou `/gsd:execute-phase`
- Branching strategy: `none` (config.json) → travail direct sur master (Phase 2 retient ce choix)
- CI = source of truth (local Windows toolchain incomplet Phase 1 carry-over)

**Test requirements (CLAUDE.md global) :**
- 80% test coverage minimum
- Unit + integration + E2E
- Test-First TDD pour features nouvelles
- Chain-of-hash CI gate sur 3 tables (custom test Phase 2)
- RLS cross-tenant CI gate sur toutes nouvelles tables

**Coding constraints :**
- Immutability (jamais `UPDATE` sur append-only events)
- KISS / DRY / YAGNI
- Files < 800 lines, functions < 50 lines
- Errors handled explicitly, no silent swallow
- No floats for money — bigint minor units + dinero.js v2 + banker's rounding

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Phase 1 validé, Phase 2 ajoute uniquement librairies bien établies
- Architecture patterns: HIGH — patterns Phase 1 réutilisés tels quels (outbox + chain-of-hash + sync registry + RLS)
- Pitfalls: HIGH — pitfalls Phase 2 dérivés de PITFALLS.md projet + spécificités append-only multi-device
- Validation architecture: HIGH — test infra Phase 1 existant + extensions documentées
- Sizing hypothesis: MEDIUM — estimations en effort/tasks ; à affiner par planner en fonction de la vélocité réelle équipe

**Research date:** 2026-05-12
**Valid until:** 2026-08-12 (3 mois ; à re-vérifier si Phase 2 démarrage retardé > 60 jours, en particulier versions librairies tertiaires)

## RESEARCH COMPLETE

**Phase:** 2 - Vertical Slice Production
**Confidence:** HIGH

### Key Findings
- Phase 2 = essentiellement **application métier** de patterns Phase 1 (sync registry, chain-of-hash, RLS, OperationalDay, money). Aucun pattern transverse nouveau à inventer.
- **Wave 0 BLOQUANTE** : co-design opérateurs 2 jours + scaffolding alerts/outbox/S3-bucket/equipment-master-data AVANT prod mobile métier.
- **3 nouvelles tables avec chain-of-hash** : `stockpile_event`, `fuel_tank_event`, `hse_incident` (en plus de l'audit log standard).
- **Outbox pattern obligatoire** pour matérialisation atomique rotation→stockpile_inflow.
- **SSE one-way + Last-Event-ID** pour dashboard ; WebSocket reporté Phase 4+.
- **S3 Object Lock Governance 7 ans** à provisionner Wave 0 (HSE attachments).
- **8 plans, 4 waves, ~72 tasks** estimés, 7–10 semaines hors UAT pilote.

### File Created
`.planning/phases/02-vertical-slice-production/02-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Phase 1 baseline locked, additions mineures |
| Architecture | HIGH | Patterns Phase 1 réutilisés tels quels |
| Pitfalls | HIGH | Phase 1 PITFALLS.md couvre 80%, additions Phase 2-specific documentées |
| Validation | HIGH | Infra test Phase 1 existante, gaps Wave 0 listés |
| Sizing | MEDIUM | Estimation à affiner par planner |

### Open Questions
- Budget AG Grid Enterprise (Phase 2 démarrer Community, upgrader si besoin UAT)
- Device matrix Tab Active 3 + XCover Pro 6 — quantité achat pilote
- Co-design date + participants (Dioula/Baoulé traduction ?)
- S3 Object Lock 7 ans — confirmer legal Côte d'Ivoire
- `OperationalDay.metadata.workforce_headcount` — audit Phase 1 code nécessaire
- Multiplicateurs alertes L/h (1.5×/0.4×) — valider co-design

### Ready for Planning
Research complete. Planner peut créer 8 plans en 4 waves (W0 co-design+scaffolding bloquant → W1 foration+extraction → W2 transport+stockpile → W3 fuel+HSE+dashboard+alerts).
