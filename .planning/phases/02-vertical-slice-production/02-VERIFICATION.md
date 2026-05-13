---
phase: 02-vertical-slice-production
verified: 2026-05-13T03:16:47Z
status: gaps_found
score: 4/6 success criteria verified
re_verification: false
gaps:
  - truth: "Une rotation camion produit un ticket de pesée signé numériquement qui crédite le stockpile event-sourced du calibre correspondant"
    status: failed
    reason: "OutboxModule is defined but never imported in AppModule or any other module. OutboxWorkerProcessor (the polling component that reads outbox_event rows and fires EventEmitter2 events) is never instantiated at runtime. TruckRotationService.complete() writes to outbox_event correctly but the worker that dispatches production.transport.rotation_completed to EventEmitter2 never starts. As a result, StockpileModule.RotationCompletedHandler never fires and STOCKPILE_INFLOW is never created automatically."
    artifacts:
      - path: "apps/api/src/modules/outbox/outbox.module.ts"
        issue: "Module exists but is not imported anywhere — only self-defines. Not wired into AppModule."
      - path: "apps/api/src/app.module.ts"
        issue: "OutboxModule absent from imports array. AppModule imports 7 Phase-2 business modules + AlertsModule (via ProductionDashboardModule) but OutboxModule is missing."
    missing:
      - "Import OutboxModule in AppModule (or wire OutboxWorkerProcessor into TransportModule as a provider)"
      - "Add OutboxModule to the imports array in app.module.ts"

  - truth: "Le KPI taux de fréquence accidents (TF) et les KPI production (tonnes jour/semaine/mois, rendement forage, temps d'arrêt) s'affichent en temps réel sur le dashboard Directeur Site et Chef Carrière"
    status: partial
    reason: "TF, tonnage J/S/M, and rendement forage are all displayed. However, 'temps d'arrêt' (downtime) is used internally in the yield formula but is NOT exposed as a standalone KPI tile in the SiteDirectorDashboard DTO or rendered in the dashboard HTML. SiteDirectorDashboard interface has no downtime_today field. ROADMAP success criteria #5 explicitly names it."
    artifacts:
      - path: "apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts"
        issue: "SiteDirectorDashboard interface (line 36-49) has no downtime_today or total_downtime_minutes field. Downtime appears only internally at line 260 in the yield calculation subquery."
      - path: "apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.html"
        issue: "No downtime KPI tile rendered. Grep for 'downtime' returns no matches."
    missing:
      - "Add downtime_today_minutes (or similar) field to SiteDirectorDashboard interface"
      - "Query and expose total downtime (from extraction_cycle.downtime_minutes) per operational day"
      - "Render a KPI tile for downtime in site-director-dashboard.component.html"

  - truth: "i18n exactement 3 langues (FR/EN/AR) sur toutes les surfaces Phase 2"
    status: failed
    reason: "D2-92 requires exactly 3 locale files (fr.json, en.json, ar.json) for all Phase 2 i18n surfaces. Backend i18n correctly has 3 languages (apps/api/src/modules/i18n/locales/ar/ with 8 JSON files). The web app (transloco.config.ts) only declares availableLangs: ['fr', 'en'] — no ar.json in apps/web/src/assets/i18n/ and no 'ar' entry in the locale switcher. The mobile i18n service (i18n_service.dart) also only maps FR/EN (setLocale maps to fr-CI or en-CI only)."
    artifacts:
      - path: "apps/web/src/app/core/i18n/transloco.config.ts"
        issue: "availableLangs: ['fr', 'en'] — AR missing. File line 9."
      - path: "apps/web/src/assets/i18n"
        issue: "Directory contains only fr.json and en.json. No ar.json file."
      - path: "apps/web/src/app/layout/locale-switcher.component.ts"
        issue: "Only 'fr' and 'en' options in the menu. RTL support not wired."
      - path: "apps/mobile/lib/core/i18n/i18n_service.dart"
        issue: "setLocale maps only fr-CI and en-CI. No Locale('ar') handling."
    missing:
      - "Create apps/web/src/assets/i18n/ar.json with translations for all dashboard/alerts/foration/etc. keys"
      - "Add 'ar' to availableLangs in transloco.config.ts"
      - "Add 'ar' option to LocaleSwitcherComponent with RTL direction support"
      - "Add Locale('ar') support to mobile i18n_service.dart"

human_verification:
  - test: "Verify OutboxWorkerProcessor starts on boot after adding OutboxModule to AppModule"
    expected: "Server logs show 'OutboxWorkerProcessor draining' every ~2s; after completing a rotation, outbox_event row is dispatched and STOCKPILE_INFLOW event appears in stockpile_event table"
    why_human: "Requires running the NestJS server + Postgres — cannot verify statically"
  - test: "Verify downtime KPI tile renders on the Site Director dashboard after fix"
    expected: "A KPI tile labeled 'Temps d'arrêt' appears on the dashboard with the cumulative downtime minutes for the operational day"
    why_human: "Requires visual verification in the Angular UI after the gap is fixed"
  - test: "Verify AR language switch in web app after adding ar.json"
    expected: "Switching to AR in the locale switcher renders all dashboard keys in Arabic script, layout direction switches to RTL"
    why_human: "Requires browser rendering + RTL layout visual check; Arabic translation quality requires native speaker review"
---

# Phase 02: Vertical Slice Production — Verification Report

**Phase Goal:** Une chaîne opérationnelle étroite mais réelle (foration → extraction → transport → stockpile → carburant → HSE) fonctionne en offline-first depuis le mobile terrain jusqu'au dashboard site, validant les patterns avant extension.

**Verified:** 2026-05-13T03:16:47Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opérateur foreuse saisit trou foré offline (GPS, profondeur, diamètre) et rendement m/h dans dashboard après sync | VERIFIED | `DrilledHole` entity append-only (3-layer), `drilling_yield_per_machine_day` MV with debounced CONCURRENTLY refresh, mobile `DrilledHoleForm` with `GpsAccuracyIndicator`. Backend data flows via materialized view to `DashboardAggregatorService.fetchDrillingYield()`. Mobile persistence is in-memory (documented stub — Drift codegen deferred), but domain model is complete and backend side is fully wired. |
| 2 | Rotation camion produit ticket pesée signé numériquement (offline) qui crédite stockpile event-sourced | FAILED | `WeighingTicket` entity with SHA-256 `content_hash`, offline numbering (`SITE-YYYYMMDD-DEVICE-SEQ`), dual signature pads, all implemented. But `OutboxModule` is never imported — `OutboxWorkerProcessor` never starts — `production.transport.rotation_completed` is never dispatched from outbox to EventEmitter2 — `STOCKPILE_INFLOW` is never created automatically. |
| 3 | Solde cuves carburant et stockpile dérivé d'événements append-only, valorisé en XOF, alertes seuil bas/haut déclenchées automatiquement | VERIFIED | `stockpile_event` monthly partitioned, chain-of-hash, `StockpileBalanceService` with weighted-avg, `FuelCostAllocatorService` wired to `StockpileValuationService`, edge-triggered threshold alerts via `StockpileThresholdService` → `production.stockpile.threshold_crossed` → `AlertsEventHandlers`. `fuel_tank_event` append-only with chain-of-hash. `FuelReconciliationJob` nightly. |
| 4 | Incident HSE saisi en append-only avec photos S3 immuable content-addressed (SHA-256), chaîne de hash vérifiable, workflow CAPA suivi jusqu'à clôture | VERIFIED | `HseIncident` with `prev_hash`/`row_hash`, `buildHseIncidentCanonicalPayload`, DB trigger blocks UPDATE/DELETE, `HseAttachmentService` with `x-amz-object-lock-mode: GOVERNANCE` + 7-year retain, `ERR_CAPA_NOT_VERIFIED` guards severity≥4 closure, CAPA state machine `open→in_progress→done→verified→closed`. |
| 5 | KPI TF + KPI production (tonnes J/S/M, rendement forage, temps d'arrêt) s'affichent en temps réel sur dashboard Directeur Site et Chef Carrière | PARTIAL | TF (`tf_rolling_12m`), tonnage J/S/M (4 tiles), drilling yield, extraction yield, equipment OOS — all rendered. **Temps d'arrêt is missing** as standalone KPI. Downtime is used in yield formula internally but not exposed in `SiteDirectorDashboard` DTO or rendered as a tile. SSE push and Last-Event-ID replay work. |
| 6 | Ratio L/h anormal sur engin déclenche alerte exploitable (détection vol/fuite) | VERIFIED | `FuelAnomalyService.checkForAnomaly()` with 1.5x/0.4x multipliers, rolling 7-day ratio vs 30-day median, emits `production.fuel.anomaly_detected` → `AlertsEventHandlers` → alert row in DB → alerts inbox badge + AG Grid. `FuelAnomalyDetectionJob` @Cron 04:00 UTC. |

**Score: 4/6 truths verified** (1 failed, 1 partial)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/modules/foration/` | Foration module (FOR-01..05) | VERIFIED | Entity, service, controller, yield MV, event handler, tests — all present and wired in AppModule |
| `apps/api/src/modules/extraction/` | Extraction module (EXT-01..02) | VERIFIED | ExtractionCycle append-only, yield service, triple-layer guard |
| `apps/api/src/modules/transport/` | Transport + pesage (TRP-01..03) | VERIFIED (partial) | WeighingTicket, TruckRotation, dispatch board present; outbox writes work; outbox DISPATCH broken (OutboxModule not wired) |
| `apps/api/src/modules/stockpile/` | Stockpile event-sourced (STK-01..03) | VERIFIED | Monthly partitions, chain-of-hash, thresholds, valuation, nightly recompute |
| `apps/api/src/modules/fuel/` | Fuel event-sourced (CAR-01..04) | VERIFIED | FuelTankEvent chain-of-hash, atomic refuel 3-insert, anomaly detection, reconciliation, energy readings |
| `apps/api/src/modules/hse/` | HSE incidents + CAPA (HSE-01..02, HSE-06) | VERIFIED | Chain-of-hash, S3 GOVERNANCE, CAPA state machine, TF calculator |
| `apps/api/src/modules/production-dashboard/` | Dashboards + SSE (DSH-01..02) | VERIFIED (partial) | SSE broadcaster, 6-event DashboardProjectionHandler, site-director + quarry-chief; missing downtime KPI |
| `apps/api/src/modules/outbox/outbox.module.ts` | Outbox module wired | ORPHANED | Module exists and is correct internally, but never imported by AppModule or any other module |
| `apps/api/src/modules/alerts/` | Alerts module (via ProductionDashboardModule) | VERIFIED | Imported by ProductionDashboardModule which is in AppModule; 3 event handlers wired |
| `apps/web/src/app/features/dashboard-site/` | Web dashboards | VERIFIED | Site-director + quarry-chief components, SSE integration, provisional cost tile |
| `apps/web/src/app/features/dashboard-site/widgets/cost-per-ton-provisional-tile.component.ts` | "Provisoire" label mandatory | VERIFIED | Component has mandatory comment, `dashboard.cost_per_ton_provisional_label` i18n key, amber background. Spec `cost-per-ton-provisional-tile.spec.ts` guards against removal. fr.json has "Provisoire (carburant uniquement — coût final Phase 4)". |
| `apps/web/src/assets/i18n/ar.json` | AR web locale | MISSING | File does not exist. Only fr.json and en.json present. `transloco.config.ts` only has `['fr', 'en']`. |
| `apps/api/src/modules/i18n/locales/ar/` | Backend AR locales | VERIFIED | 8 AR locale files covering all 8 Phase-2 domains |
| `apps/mobile/lib/features/*/` | Mobile offline forms | VERIFIED (stubs) | All screens exist: foration, extraction, transport, fuel, HSE. Most use in-memory repos (documented stubs from W1-W2 plans). Extraction uses sqlite_async. All integration tests pass against in-memory repos. |
| `docs/phase-03-handoff/hse-rh-deferred-scope.md` | HSE-03/04/05 deferred scope doc | VERIFIED | File exists with EPI, habilitations, audit safety design docs |
| `apps/api/src/modules/hse/README.md` | HSE module README with deferral table | VERIFIED | README contains explicit DEFERRED table for HSE-03/04/05 |
| `docs/adr/ADR-0006..ADR-0010` | 5 ADRs accepted | VERIFIED | All 5 ADRs exist with Status: Accepted + Implementation Notes section |
| `apps/web/package.json` (ag-grid) | Only ag-grid-community (no enterprise) | VERIFIED | `ag-grid-community: ^32.2.0` present; no ag-grid-enterprise |
| `infra/modules/s3-objectlock/` | S3 Object Lock OpenTofu module | VERIFIED | main.tf, variables.tf, outputs.tf, tests present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TruckRotationService.complete()` | `stockpile_event STOCKPILE_INFLOW` | `outbox_event` row → `OutboxWorkerProcessor` poll → `EventEmitter2` → `StockpileRotationCompletedHandler` | NOT_WIRED | OutboxWorkerProcessor never starts — OutboxModule not imported anywhere. Outbox WRITES are atomic; dispatch is broken. |
| `DrilledHoleService.append()` | `drilling_yield_per_machine_day` MV | `EventEmitter2` `production.foration.hole_drilled` → `DrilledHoleHandler` → `DrillingYieldService.scheduleRefresh()` | WIRED | Handler fires synchronously via EventEmitter2; debounced MV refresh every 30s per tenant |
| `DashboardAggregatorService` | `drilling_yield_per_machine_day` | Direct SQL query | WIRED | `fetchDrillingYield()` at line 242 queries the MV |
| `StockpileBalanceService.applyEvent()` | `StockpileThresholdService.checkCrossing()` | Direct service call after commit | WIRED | Edge-triggered, fires after balance tx committed |
| `StockpileThresholdService` | `AlertsEventHandlers` | `EventEmitter2` `production.stockpile.threshold_crossed` | WIRED | AlertsModule imported by ProductionDashboardModule, which is in AppModule |
| `FuelAnomalyService` | `AlertsEventHandlers` | `EventEmitter2` `production.fuel.anomaly_detected` | WIRED | Same AlertsModule path |
| `HseIncidentService.create()` | alerts module | `EventEmitter2` `hse.incident.created` | WIRED | AlertsEventHandlers has @OnEvent for this |
| `SseBroadcasterService` | web `SseClientService` | SSE stream `/dashboards/site-director/stream` | WIRED | DashboardProjectionHandler subscribes to 6 domain events; SseClientService in Angular connects via EventSource |
| `FuelCostAllocatorService` | `StockpileValuationService` | `@Optional()` injection + `allocateFuelCostForOperationalDay()` | WIRED | W3-P06 re-execution replaced XOF/0 stub with real allocator; StockpileModule imports FuelModule |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `site-director-dashboard.component.ts` | `dashboard` signal | `DashboardAggregatorService.computeForSiteDirector()` | Yes — 11 parallel SQL queries against real tables (stockpile_event, drilling_yield_per_machine_day, etc.) | FLOWING |
| `stockpile-list.component.ts` | stockpile balances | `GET /api/stockpiles` → `StockpileBalanceService` | Yes — materialized projection from real events | FLOWING (but INFLOW path broken — see gap) |
| `alerts-inbox.component.ts` | alerts grid | `GET /api/alerts?status=open` → `AlertsService.list()` | Yes — queries alert table with real rows | FLOWING |
| `cost-per-ton-provisional-tile.component.ts` | `costPerTon` | `CostPerTonProvisionalService.compute()` via dashboard snapshot | Yes — LATERAL subquery over fuel_tank_event + stockpile_event | FLOWING (depends on INFLOW being populated — currently broken) |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no running server available in this environment. The following behaviors are verified statically:

| Behavior | Verification Method | Status |
|----------|---------------------|--------|
| OutboxWorkerProcessor polling | Module import scan | FAIL — OutboxModule not imported; worker never starts |
| TF calculation returns mode=rolling_12m/since_launch | `tf-calculator.service.ts` code review | PASS — TfMode type + logic present |
| Threshold crossing emits alert | `stockpile-threshold.service.ts` + `alerts.event-handlers.ts` | PASS — edge-triggered logic wired |
| L/h anomaly triggers alert | `fuel-anomaly.service.ts` + `alerts.event-handlers.ts` | PASS — 1.5x/0.4x multipliers, @OnEvent wired |
| "Provisoire" label cannot be accidentally removed | `cost-per-ton-provisional-tile.spec.ts` | PASS — grep-asserts i18n key + fr.json content |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| FOR-01 | W1-P02 | Chef Carrière crée plan de forage | SATISFIED | `DrillingPlan` entity, status machine draft→active→closed, assertActive guard |
| FOR-02 | W1-P02 | Opérateur saisit trou foré mobile offline (GPS, profondeur, diamètre) | SATISFIED | `DrilledHoleForm` with GpsAccuracyIndicator, offline-first, 3-layer append-only |
| FOR-03 | W1-P02 | Rendement forage m/h calculé | SATISFIED | `drilling_yield_per_machine_day` MV, debounced refresh, dashboard tile |
| FOR-04 | W1-P02 | Consommation gasoil par foreuse et session | SATISFIED | `fuel_liters_consumed` field on DrilledHole, wired to CAR module |
| FOR-05 | W1-P02 | Foreuse en panne bloque affectation plan | SATISFIED | `ProductionEquipmentService.assertActive()` called in `DrillingPlanService.activate()` |
| EXT-01 | W1-P03 | Opérateur saisit cycles extraction mobile offline | SATISFIED | `ExtractionCycleForm`, sqlite_async repo, immutability modal |
| EXT-02 | W1-P03 | Rendement extraction t/h par engin/opérateur | SATISFIED | `ExtractionYieldService.computeYield()` with downtime subtraction, 27.78 t/h test verified |
| TRP-01 | W2-P04 | Rotation camion enregistrée avec point chargement/déchargement/tonnage | SATISFIED | `TruckRotation` entity, append-only, generated `cycle_time_minutes` |
| TRP-02 | W2-P04 | Ticket pesée numérique avec signature, génération offline supportée | SATISFIED | `WeighingTicket` with `content_hash`, offline numbering, dual SignaturePad widgets |
| TRP-03 | W2-P04 | Dispatching affecte camions disponibles | SATISFIED | `DispatchBoardComponent` with active+type guard, POST /rotations/:id/assign |
| STK-01 | W2-P05 | Stock event-sourced, solde dérivé événements append-only | SATISFIED | `stockpile_event` monthly partitioned, append-only trigger, chain-of-hash |
| STK-02 | W2-P05 | Alertes seuil bas/haut automatiques | SATISFIED | `StockpileThresholdService` edge-triggered, `stockpile_threshold` table |
| STK-03 | W2-P05 | Valorisation coût production moyenne pondérée avec devise | SATISFIED | `StockpileValuationService` weighted-avg in bigint minor units, `cost_model_version=1`, XOF |
| CAR-01 | W3-P06 | Cuves carburant solde event-sourced avec rapprochement quotidien | SATISFIED | `fuel_tank_event` monthly partitioned, chain-of-hash, `FuelReconciliationJob` @Cron 03:30 UTC |
| CAR-02 | W3-P06 | Ravitaillement engin saisi mobile offline | SATISFIED (impl; REQUIREMENTS.md checkbox not updated) | `EquipmentRefuelForm`, `EquipmentRefuelRepository` (in-memory), integration test, atomic 3-insert |
| CAR-03 | W3-P06 | Ratio L/h anormal déclenche alerte | SATISFIED (impl; REQUIREMENTS.md checkbox not updated) | `FuelAnomalyService` with 1.5x/0.4x, `FuelAnomalyDetectionJob`, alerts wired |
| CAR-04 | W3-P06 | Consommation électrique par usage | SATISFIED (impl; REQUIREMENTS.md checkbox not updated) | `EnergyConsumptionService`, `energy_consumption_reading` table, web CRUD |
| HSE-01 | W3-P07 | Incident append-only chain-of-hash, photos S3 immuable, chronologie | SATISFIED | `HseIncident` chain-of-hash, `HseAttachmentService` GOVERNANCE mode, DB trigger, 405 controller |
| HSE-02 | W3-P07 | Workflow CAPA jusqu'à clôture | SATISFIED | `CorrectiveActionService` state machine, `ERR_CAPA_NOT_VERIFIED` severity≥4 guard |
| HSE-03 | deferred | EPI par employé (DEFERRED Phase 3) | COVERED (deferred-stub) | `docs/phase-03-handoff/hse-rh-deferred-scope.md` exists; `hse/README.md` documents deferral explicitly |
| HSE-04 | deferred | Habilitations temporelles (DEFERRED Phase 3) | COVERED (deferred-stub) | Same deferred-scope artifacts |
| HSE-05 | deferred | Audit sécurité périodique (DEFERRED Phase 3) | COVERED (deferred-stub) | Same deferred-scope artifacts |
| HSE-06 | W3-P07 | KPI taux de fréquence accidents TF | SATISFIED | `TfCalculatorService` with rolling_12m/since_launch, workforce_headcount migration, dashboard tile |
| DSH-01 | W3-P08 | Dashboard temps réel par profil (Directeur Site, Chef Carrière) | SATISFIED | Two persona dashboards, SSE push, 6 domain event subscriptions |
| DSH-02 | W3-P08 | KPI Production tonnes/rendement/disponibilité/temps d'arrêt | PARTIAL | Tonnage J/S/M, drilling yield, extraction yield, equipment OOS — all present. "Temps d'arrêt" missing as standalone KPI tile. "Rendement concassage" is Phase 3 (out of scope for Phase 2). |

**Note on REQUIREMENTS.md discrepancy:** CAR-02, CAR-03, CAR-04 are marked as `Pending` in REQUIREMENTS.md checkboxes but their implementation exists in the codebase. W3-P06 SUMMARY claims `requirements_covered: [CAR-01, CAR-02, CAR-03, CAR-04]`. The tracking table also shows Pending. This is a documentation-only gap — the checkboxes were not updated after W3-P06 execution. DSH-02 and the CAR items require REQUIREMENTS.md checkbox updates.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/modules/outbox/outbox.module.ts` | — | Module defined but never imported anywhere | Blocker | OutboxWorkerProcessor never instantiated; `production.transport.rotation_completed` never dispatched; STOCKPILE_INFLOW never auto-created |
| `apps/web/src/app/core/i18n/transloco.config.ts` | 9 | `availableLangs: ['fr', 'en']` — AR missing | Warning | D2-92 requires exactly 3 languages; AR-speaking users cannot switch to Arabic |
| `apps/mobile/lib/features/foration/screens/drilled_hole_form.dart` | 213-214 | Hardcoded `tenantId: 'tenant-current'`, `siteId: 'site-current'` | Warning | Auth context binding not wired yet; documented `// TODO(co-design)` — non-blocking per W1-P02 |
| `apps/mobile/lib/features/foration/repositories/drilled_hole_repository.dart` | 75-79 | In-memory `List<DrilledHole> _rows` — data lost on app restart | Warning | Foration offline persistence non-durable; Drift backing deferred; documented known stub |
| `apps/mobile/lib/features/transport/repositories/weighing_ticket_repository.dart` | 66 | In-memory `List<WeighingTicket> _rows` | Warning | Same pattern — in-memory only; documented known stub |
| `apps/mobile/lib/features/hse/repositories/incident_repository.dart` | 121 | In-memory `List<HseIncident> _rows` | Warning | Same pattern — in-memory only; documented known stub |

**Note on in-memory mobile repos:** These are documented stubs across W1-P02, W2-P04, W3-P07 SUMMARYs. The domain model is complete and the backend services are fully tested. The in-memory repos mean offline data does not survive app restart, which is suboptimal but the domain logic path (capture → sync → backend) is verifiable. Per project convention, unit tests without a real DB are acceptable. These are classified as Warning not Blocker.

---

### Human Verification Required

#### 1. OutboxModule Wiring Fix + End-to-End Rotation→Stockpile

**Test:** Fix OutboxModule import, restart server, complete a rotation via POST `/api/rotations/:id/complete`, wait 2-4s, then query `GET /api/stockpiles/:id/events`.
**Expected:** A `STOCKPILE_INFLOW` event appears in the stockpile event ledger with the rotation's tonnage.
**Why human:** Requires a running Postgres + NestJS server; cannot verify statically.

#### 2. Downtime KPI Tile Display After Fix

**Test:** After adding `downtime_today_minutes` to the dashboard DTO and template, open `/dashboard/site-director` and verify the downtime tile renders.
**Expected:** A tile labeled "Temps d'arrêt" (or translated equivalent) displays the cumulative downtime hours for the current operational day.
**Why human:** Requires visual verification in a running Angular app.

#### 3. AR Language Switch + RTL Rendering in Web

**Test:** After creating `ar.json` and adding 'ar' to transloco config, switch to Arabic in the locale switcher.
**Expected:** All dashboard labels render in Arabic script; page direction switches to RTL; no raw i18n key strings visible.
**Why human:** Requires browser rendering + Arabic script quality review by a native speaker or qualified reviewer.

#### 4. Mobile Offline Round-Trip After App Restart (foration)

**Test:** On a physical device or emulator, enter a drilled hole on the foration form, kill and restart the app, check whether the pending_sync row persists.
**Expected:** Once Drift backing is wired, the row survives restart. With current in-memory stub, it will NOT — confirming the stub is still in place.
**Why human:** Requires a running Flutter app on a device/emulator.

#### 5. AR AR.json Absence in REQUIREMENTS.md checkboxes (CAR-02/03/04)

**Test:** Verify CAR-02, CAR-03, CAR-04 checkboxes in REQUIREMENTS.md are updated after confirming implementation is complete.
**Expected:** Checkboxes show `[x]` and the tracking table shows `Complete`.
**Why human:** Requires a human decision on whether the current implementation fully satisfies the requirement definition or has unacceptable stubs.

---

### Gaps Summary

**Two functional gaps block full goal achievement:**

**Gap 1 (Blocker) — OutboxModule not wired:**
`OutboxModule` exists in `apps/api/src/modules/outbox/outbox.module.ts` and is correctly implemented internally. However, it is not imported in `AppModule` or any other module. Consequently, `OutboxWorkerProcessor` — the polling component that reads `outbox_event` rows every 2s and dispatches them to `EventEmitter2` — is never instantiated. The result: `TruckRotationService.complete()` writes an outbox row atomically, but that row is never processed. `StockpileRotationCompletedHandler` never fires. `STOCKPILE_INFLOW` is never created automatically. This breaks the core transport → stockpile chain (success criterion #2) and means the stockpile balance shown in the dashboard never reflects completed rotations. The fix is a one-line import: add `OutboxModule` to the `imports` array in `app.module.ts`.

**Gap 2 (Warning) — Downtime KPI tile missing:**
Success criterion #5 explicitly lists "temps d'arrêt" alongside tonnage and rendement forage as a KPI that must appear on the dashboard. The `SiteDirectorDashboard` interface has no downtime field. Downtime minutes are used internally in the yield calculation formula but are not surfaced as a standalone KPI tile. Partial: all other named KPIs in SC#5 (TF, tonnage J/S/M, rendement forage) are present.

**Gap 3 (Constraint violation) — Web i18n missing AR:**
D2-92 and the project's special verification rule both require exactly 3 languages (FR/EN/AR) for all Phase 2 i18n surfaces. The backend correctly has 3 languages. The web `transloco.config.ts` only declares `['fr', 'en']`, no `ar.json` file exists in `apps/web/src/assets/i18n/`, and the mobile `i18n_service.dart` only maps FR and EN. AR is absent from the web and mobile surfaces.

**Documentation discrepancy (non-blocking):**
REQUIREMENTS.md checkboxes for CAR-02, CAR-03, CAR-04 remain unchecked (`[ ]`) despite the implementation being complete and committed in W3-P06. The tracking table also shows `Pending`. These require a documentation update only — no code changes needed.

---

_Verified: 2026-05-13T03:16:47Z_
_Verifier: Claude (gsd-verifier)_
