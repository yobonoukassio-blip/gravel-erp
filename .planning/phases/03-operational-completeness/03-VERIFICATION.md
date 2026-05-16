---
phase: 03-operational-completeness
verified: 2026-05-16T00:00:00Z
status: gaps_found
score: 2/6 success criteria verified
re_verification: false
gaps:
  - truth: "Un plan de tir validé HSE est figé en événements append-only ; aucun chargement d'explosif n'est possible sans saga clearance HSE, et chaque détonateur est tracé par numéro de série de la réception à l'utilisation"
    status: partial
    reason: "Backend chain is complete: explosives_event append-only with chain-of-hash, blast_plan state machine, BlastClearanceSaga, detonator lifecycle, habilitation gate using shiftStartLocal — all wired. However, the OperationalDayService dependency required by ExplosivesReconciliationJob is a stub (TirModule provides an inline factory with empty placeholder methods at tir.module.ts:71-83). Reconciliation gaps therefore never propagate to operational_day.closure_blockers in production wiring. Mobile coverage is limited to a single screen (blast_charge_form) — no UI for plan validation, detonator scan, or clearance issuance from the field."
    artifacts:
      - path: "apps/api/src/modules/tir/tir.module.ts"
        issue: "OPERATIONAL_DAY_SERVICE provider returns no-op `blockClosure`/`resolveClosure` (lines 71-83). Comment says 'Placeholder — wired to actual OperationalDayService via DI in Phase 4'. Tests mock this; production never blocks closure."
      - path: "apps/mobile/lib/features/tir/screens/"
        issue: "Only blast_charge_form.dart exists. No blast plan management, detonator scan, or HSE clearance screens for field supervisors."
    missing:
      - "Extract OperationalDayModule (or expose existing service) so TirModule can inject the real OperationalDayService"
      - "Add mobile screens for blast plan approval, detonator serial scan, and HSE clearance issuance"

  - truth: "La clôture journalière échoue tant que la réconciliation explosifs entrée/sortie/stock présente le moindre écart, et le rapport de tir (fragmentation, vibration, incidents) est immuable"
    status: failed
    reason: "Blast report immutability is correctly implemented (append-only trigger, chain-of-hash on blast_report). BUT the closure-blocker side of the criterion is BROKEN: ExplosivesReconciliationJob calls `operationalDayService.blockClosure(...)`, but the injected OPERATIONAL_DAY_SERVICE token in TirModule is a stub that does nothing. As a result, in a real deployment a gap > 50g is detected and an alert fires, but operational_day.closure_blockers is never updated and the day can be closed despite the discrepancy."
    artifacts:
      - path: "apps/api/src/modules/tir/tir.module.ts"
        issue: "Lines 70-84: stubbed `blockClosure` and `resolveClosure` factory. Critical regulatory contract broken."
      - path: "apps/api/src/modules/tir/jobs/explosives-reconciliation.job.ts"
        issue: "Calls the proxy token, so the call resolves but does nothing"
    missing:
      - "Wire real OperationalDayService into TirModule (extract it from its current host module if needed)"
      - "Add an integration test that asserts closure_blockers contains EXPLOSIVES_RECONCILIATION_GAP after a 60g discrepancy"

  - truth: "Une intervention maintenance corrective ou préventive consomme des pièces de rechange (avec alerte seuil), enregistre temps d'arrêt et heures main d'œuvre, et la disponibilité MTBF/MTTR par équipement apparaît au dashboard maintenance"
    status: partial
    reason: "Backend is implemented: WorkOrderService lifecycle (open/close + equipment status sync), SparePartService.consume() with SELECT FOR UPDATE, MtbfCalculatorService with NULL semantics, equipment_availability table. Phase3KpiService.maintenanceKpis() exposes MTBF/MTTR. BUT three things are missing: (1) PreventiveMaintenancePlan scheduler @Cron is deferred — preventive WOs are never auto-generated; (2) the `maintenance.spare_part.threshold_crossed` alert event has NO @OnEvent handler in AlertsEventHandlers (grep returns zero matches for 'maintenance' in alerts.event-handlers.ts); (3) the habilitation gate in WorkOrderService.open() is NOT wired (SUMMARY explicitly says 'integration hook present (technicianId column) and check can be added' — i.e. not implemented). Mobile WO form is a single ModulePlaceholder screen with 'maintenance' icon and no functionality."
    artifacts:
      - path: "apps/api/src/modules/alerts/alerts.event-handlers.ts"
        issue: "No @OnEvent('maintenance.spare_part.threshold_crossed') handler — spare-part low-stock alerts emit but no consumer creates an alert row"
      - path: "apps/api/src/modules/maintenance/services/work-order.service.ts"
        issue: "RhHabilitationService.isValidAt() check on technicianId NOT called. Documented in 03-W2-P04-SUMMARY as deferred."
      - path: "apps/mobile/lib/features/maintenance/screens/maintenance_screen.dart"
        issue: "ModulePlaceholder shell — 19 lines, no work-order capture functionality"
      - path: "apps/api/src/modules/maintenance/"
        issue: "No PmSchedulerService / @Cron present — preventive maintenance never triggers automatically"
    missing:
      - "Add @OnEvent('maintenance.spare_part.threshold_crossed') handler in AlertsEventHandlers (dedupe key tenantId:partId)"
      - "Wire RhHabilitationService.isValidAt() into WorkOrderService.open() before transitioning equipment to maintenance status"
      - "Implement PmSchedulerService @Cron that generates WorkOrders from due preventive_maintenance_plan rows"
      - "Build a real mobile work-order capture screen (offline-first, append-only consumption events)"

  - truth: "Une habilitation employé (permis explosifs, conduite engin, formation HSE) est requêtable as-of à une date donnée et bloque l'affectation à un poste si expirée ; les sous-traitants sont gérés comme entités first-class avec leur personnel"
    status: verified
    reason: "RhHabilitationService.isValidAt(employeeId, certCode, asOfDate) implemented with explicit-date contract. 6 boundary-case tests cover lower/upper bounds, expired+1d, not-yet-1d, subcontractor parity, unknown code. Unified employee table with CHECK (site_id IS NOT NULL OR subcontractor_id IS NOT NULL) covers direct-hire + subcontractor employees. Subcontractor entity + subcontractor-employee alias both present. BlastPlanService.approveLoading and requestFire both call isValidAt with operationalDay.shiftStartLocal (never new Date()). rh.certification.expiring_soon alert handler wired."
    artifacts: []
    missing: []

  - truth: "Un bon de livraison numérique signé client/chauffeur (généré offline si nécessaire) produit une facture multi-devise avec taux FX figé du jour, lié au contrat et au transporteur ; les ventes export attachent un dossier douane par pays"
    status: partial
    reason: "Backend is largely complete: BL entity with offline number scheme, dual SHA-256 signatures, content_sha256 freeze, DB immutability trigger; InvoiceService with pre-flight FX validation, bigint minor units, sequential numbering, immutability after sent; FxRateSnapshotService with ON CONFLICT DO NOTHING; CustomsDossier auto-created for export contracts. CRITICAL WIRING GAP: BlSignedHandler exists in apps/api/src/modules/stockpile/event-handlers/bl-signed.handler.ts with the correct @OnEvent('production.vte.bl_signed') decorator BUT is NOT registered in StockpileModule.providers — grep of stockpile.module.ts shows only crusher/screening/rotation handlers, not BlSignedHandler. Result: BL signing emits the outbox event but no STOCKPILE_OUTFLOW_SALE is ever created. Same pattern as Phase 2 OutboxModule gap. Additionally: mobile BL form with offline numbering and dual signature pad is deferred — mobile screen is a 19-line ModulePlaceholder. Web BL list/sign dialog exists but uses hardcoded `'current'` tenantId."
    artifacts:
      - path: "apps/api/src/modules/stockpile/stockpile.module.ts"
        issue: "Providers array (lines 47-57) does NOT include BlSignedHandler. The handler class is correct internally but the module never instantiates it."
      - path: "apps/api/src/modules/stockpile/event-handlers/bl-signed.handler.ts"
        issue: "ORPHANED — exists with @Injectable + @OnEvent but never registered anywhere"
      - path: "apps/mobile/lib/features/ventes/screens/ventes_screen.dart"
        issue: "ModulePlaceholder shell — no offline BL capture, no dual signature pad"
      - path: "apps/web/src/app/features/ventes/pages/bl-list.component.ts"
        issue: "No tenant scoping — listBLs() called without tenant context"
    missing:
      - "Add BlSignedHandler to StockpileModule.providers array"
      - "Build mobile BL form with offline number generation and dual signature pad widgets"
      - "PDF invoice generation (deferred — @pdfme/generator not installed)"
      - "Web invoice list/detail UI"

  - truth: "Le tonnage entrant/sortant des concasseurs (primaire/secondaire) et la classification calibre + non-conformités au criblage alimentent automatiquement le stockpile event-sourced"
    status: verified
    reason: "CrusherSession and ScreeningSession tables created with performance_pct GENERATED ALWAYS STORED and calibre_yields JSONB. Service.complete() uses same-tx outbox publish. CrusherSessionCompletedHandler AND ScreeningSessionCompletedHandler are BOTH registered in StockpileModule.providers (confirmed in stockpile.module.ts lines 50-51). Partial-replay safe per-calibre idempotency key. EnergyConsumptionService.upsert post-commit. Two web forms (crusher + screening) including dynamic FormArray for calibre_yields. Backend chain is wired end-to-end."
    artifacts: []
    missing: []

human_verification:
  - test: "Sign a BL via the web UI after wiring BlSignedHandler into StockpileModule, then query stockpile events to confirm STOCKPILE_OUTFLOW_SALE was created with the BL tonnage"
    expected: "stockpile_event table has one new row with event_type=STOCKPILE_OUTFLOW_SALE and source_reference.bl_id matching the signed BL"
    why_human: "Requires a running NestJS server + Postgres; cannot verify statically"
  - test: "Run ExplosivesReconciliationJob with a 60g discrepancy and verify operational_day.closure_blockers contains EXPLOSIVES_RECONCILIATION_GAP"
    expected: "After the job runs, operational_day row for that day shows closure_blockers @> '[{\"code\":\"EXPLOSIVES_RECONCILIATION_GAP\"}]'"
    why_human: "Requires running server, DB, and BullMQ; cannot verify statically. Currently expected to FAIL because the OPERATIONAL_DAY_SERVICE proxy is a stub."
  - test: "Trigger a spare-part consume() that crosses a threshold and verify an alert row appears in the alert table"
    expected: "alerts table contains a new row with source_event_type='maintenance.spare_part.threshold_crossed'"
    why_human: "Requires running server. Currently expected to FAIL because no @OnEvent handler is registered for this event."
  - test: "Open a work order via WorkOrderService.open() with a technician whose habilitation is expired"
    expected: "ERR_HABILITATION_EXPIRED thrown before equipment status transitions"
    why_human: "Currently expected to FAIL because habilitation gate is not wired in WorkOrderService.open()"
  - test: "Mobile field test: complete BL on a Flutter device with no network, confirm SITE-YYYYMMDD-DEVICE-SEQ number, dual signature, sync after reconnect"
    expected: "BL persists offline, syncs without conflict, server-side content_sha256 matches client computation"
    why_human: "Requires physical device or emulator with Flutter app — mobile UI is currently a placeholder shell"
---

# Phase 03: Operational Completeness — Verification Report

**Phase Goal:** La chaîne minière complète est couverte — tir de mine réglementé, traitement, maintenance, RH, ventes/expédition — incluant les exigences d'immuabilité réglementaire et les exports douane.

**Verified:** 2026-05-16T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Plan de tir append-only + saga clearance + détonateur sérialisé | PARTIAL | Backend chain wired (explosives_event chain-of-hash, blast_plan state machine, BlastClearanceSaga, detonator lifecycle, habilitation gate uses shiftStartLocal). But the OPERATIONAL_DAY_SERVICE injected into TirModule is a no-op stub — closure-blockers never actually fire. Mobile coverage = blast_charge_form only. |
| 2 | Clôture journalière bloquée si gap explosifs + blast_report immuable | FAILED | Blast report immutability OK (append-only trigger + chain-of-hash on blast_report). Closure-blocker path is BROKEN: ExplosivesReconciliationJob calls the stubbed OPERATIONAL_DAY_SERVICE → blockClosure does nothing → operational_day.closure_blockers never updated. Regulatory contract violated. |
| 3 | Maintenance: consommation pièces + temps d'arrêt + MTBF/MTTR au dashboard | PARTIAL | WorkOrderService lifecycle, SparePartService.consume() with SELECT FOR UPDATE, MtbfCalculatorService NULL-on-zero-failures, Phase3KpiService.maintenanceKpis() all present. Missing: spare-part-threshold alert handler in AlertsEventHandlers, habilitation gate in WorkOrderService.open(), PM scheduler @Cron, mobile WO capture (mobile screen is a 19-line ModulePlaceholder). |
| 4 | Habilitation employé as-of + sous-traitants first-class | VERIFIED | RhHabilitationService.isValidAt with explicit asOfDate; 6 boundary-case tests; unified employee table with CHECK constraint; subcontractor entity present; BlastPlan uses shiftStartLocal never new Date(); rh.certification.expiring_soon alert wired. |
| 5 | BL signé client/chauffeur → facture FX figé → dossier douane export | PARTIAL | BL entity + dual SHA-256 sigs + content_sha256 + DB immutability trigger. InvoiceService with pre-flight FX validation, bigint minor units, sequential numbering, immutability trigger. FxRateSnapshotService with ON CONFLICT DO NOTHING. CustomsDossier auto-created for exports. CRITICAL WIRING GAP: BlSignedHandler ORPHANED — exists in code but NOT in StockpileModule.providers → STOCKPILE_OUTFLOW_SALE never created on BL sign. Mobile BL form deferred (placeholder shell). Web UI uses 'current' tenantId. |
| 6 | Tonnage concasseurs + criblage classifications → stockpile event-sourced | VERIFIED | CrusherSession + ScreeningSession tables with performance_pct GENERATED and calibre_yields JSONB. Service.complete() uses same-tx outbox publish. BOTH session-completed handlers registered in StockpileModule.providers. Compound idempotency key for screening. Web forms (crusher list/form, screening list/form with dynamic FormArray) present. |

**Score: 2/6 truths verified** (2 partial, 1 failed)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/modules/rh/` | RH module (RH-01..04, HSE-04) | VERIFIED | 5 entities, 5 services, 4 controllers, RhHabilitationService with explicit asOfDate, ShiftEntry append-only trigger, ShiftRoster pessimistic_lock |
| `apps/api/src/modules/tir/` | TIR module (TIR-01..07) | VERIFIED (with stubbed dep) | 5 entities, 7 services, 4 controllers, BlastPlanSagaHandler, 2 jobs. But OPERATIONAL_DAY_SERVICE inline factory is no-op (lines 71-83 of tir.module.ts) — TIR-07 closure-blocker non-functional. |
| `apps/api/src/modules/concassage/` | Concassage + criblage (CON-01, CON-02, CRI-01) | VERIFIED | CrusherSession + ScreeningSession entities, services use same-tx outbox publish, energy upsert post-commit |
| `apps/api/src/modules/maintenance/` | Maintenance (MNT-01..05) | VERIFIED (partial) | 5 entities (work_order, pm_plan, spare_part, spare_part_consumption, equipment_availability), 3 services. Wired in AppModule. Missing PM scheduler @Cron, habilitation gate, alert handler. |
| `apps/api/src/modules/ventes/` | Ventes (VTE-01..06) | VERIFIED (with critical gap) | 6 entities, 3 services. BL immutability trigger present, InvoiceService bigint minor units, FX snapshot ON CONFLICT DO NOTHING. Module wired but BlSignedHandler not registered in StockpileModule. |
| `apps/api/src/modules/stockpile/event-handlers/bl-signed.handler.ts` | Outbox consumer for BL→STOCKPILE_OUTFLOW_SALE | ORPHANED | Handler exists with @Injectable + @OnEvent('production.vte.bl_signed') but is NOT in StockpileModule.providers. Same orphan pattern as Phase 2 OutboxModule gap. |
| `apps/api/src/modules/stockpile/event-handlers/crusher-session-completed.handler.ts` | Outbox consumer for crusher → STOCKPILE_INFLOW | VERIFIED | Registered in StockpileModule.providers line 50 |
| `apps/api/src/modules/stockpile/event-handlers/screening-session-completed.handler.ts` | Per-calibre STOCKPILE_INFLOW with compound idempotency | VERIFIED | Registered in StockpileModule.providers line 51, uses compound key session_id_calibre_code |
| `apps/api/src/modules/production-dashboard/services/phase3-kpi.service.ts` | Phase 3 KPI extensions (MNT-05, DSH-02) | VERIFIED | Wired in production-dashboard.module.ts:50, exposed via DashboardAggregatorService |
| `apps/web/src/app/features/rh/` | RH web UI | VERIFIED (with stubs) | 4 components (employee list/form, certification list, shift roster). Auth-context wiring deferred (empty tenantId/siteId — same project-wide pattern) |
| `apps/web/src/app/features/tir/` | TIR web UI | VERIFIED (with stubs) | 4 components (explosives ledger, blast plan list/detail, blast report form). Bodies initialised to empty arrays; auth-context wiring deferred |
| `apps/web/src/app/features/concassage/` | Concassage + criblage web UI | VERIFIED | 4 components (crusher list/form, screening list/form) with dynamic FormArray |
| `apps/web/src/app/features/maintenance/` | Maintenance web UI | PARTIAL | 3 components (work-order-list, spare-parts-stock, equipment-availability). Plan said "Web UI deferred" but these were built. All use hardcoded `'current'` tenantId. |
| `apps/web/src/app/features/ventes/` | Ventes web UI | PARTIAL | 4 components (bl-list, bl-sign-dialog, customer-list, invoice-list). bl-sign-dialog has 193 lines (substantive). Same hardcoded tenant pattern. |
| `apps/mobile/lib/features/rh/screens/shift_entry_form.dart` | RH mobile shift entry | VERIFIED | AppendOnlyRepository extension; integration test with 4 assertions |
| `apps/mobile/lib/features/tir/screens/blast_charge_form.dart` | TIR mobile blast charge | VERIFIED | Per-hole entry + barcode scan dialog + variance preview; integration test |
| `apps/mobile/lib/features/maintenance/screens/maintenance_screen.dart` | Mobile work-order capture | STUB | 19-line ModulePlaceholder — no functionality, just an icon + subtitle |
| `apps/mobile/lib/features/ventes/screens/ventes_screen.dart` | Mobile BL with offline numbering + dual signature pad | STUB | 19-line ModulePlaceholder — no offline BL form, no signature capture |
| `apps/mobile/lib/features/concassage/screens/` | Concassage mobile (optional — plan said web-only) | N/A | Web-only per W1-P03 plan |
| `infra/keycloak/realms/gravel/roles/phase-03.json` | 8 Keycloak roles | VERIFIED | 8 roles defined; TIR_SUPERVISOR composite |
| `apps/api/src/modules/i18n/locales/{fr,en,ar}/` | 14 namespaces × 3 langs | VERIFIED | 14 backend i18n namespaces × 3 languages = 42 files present |
| `apps/web/src/assets/i18n/ar.json` | Web AR translations (Phase 2 carryover gap) | VERIFIED | ar.json present; transloco.config.ts now has `['fr', 'en', 'ar']` |
| `docs/adr/ADR-0011..0015` | 5 ADRs | VERIFIED (drafts) | All 5 files exist as Drafts; 03-W3-P07 SUMMARY notes promotion to Accepted is deferred |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `BonDeLivraisonService.sign()` | `stockpile_event STOCKPILE_OUTFLOW_SALE` | `outbox_event` → OutboxWorker → EventEmitter2 `production.vte.bl_signed` → `BlSignedHandler` | NOT_WIRED | BlSignedHandler exists with correct @OnEvent decorator but is NOT in StockpileModule.providers. Module never instantiates the handler — events fire into the void. |
| `CrusherSessionService.complete()` | `stockpile_event STOCKPILE_INFLOW` | Outbox event → CrusherSessionCompletedHandler | WIRED | Handler registered in StockpileModule line 50. Same-tx outbox publish. |
| `ScreeningSessionService.complete()` | `stockpile_event STOCKPILE_INFLOW` (per calibre) | Outbox event → ScreeningSessionCompletedHandler | WIRED | Handler registered in StockpileModule line 51. Compound idempotency key. |
| `BlastPlanService.approveLoading()` | `RhHabilitationService.isValidAt` | Direct call with operationalDay.shiftStartLocal | WIRED | Verified — uses shiftStartLocal, never new Date() |
| `BlastPlanService.requestFire()` | `BlastClearanceTimeoutJob` (4h delay) | `production.tir.blast_plan.fire_requested` → BullMQ | WIRED | Saga handler + timeout job present |
| `BlastClearanceSaga` | `BlastPlanService.transitionToFired()` | `@OnEvent('tir.blast_plan.zone_cleared')` | WIRED | Saga handler + idempotency |
| `ExplosivesReconciliationJob` | `operational_day.closure_blockers` | `operationalDayService.blockClosure()` | NOT_WIRED | Calls the OPERATIONAL_DAY_SERVICE token, but TirModule provides a no-op factory at lines 71-83. blockClosure runs but does nothing. |
| `SparePartService.consume()` (threshold cross) | alerts module | `EventEmitter2 maintenance.spare_part.threshold_crossed` → AlertsEventHandlers | NOT_WIRED | No @OnEvent('maintenance.spare_part.threshold_crossed') in alerts.event-handlers.ts |
| `WorkOrderService.open()` | `RhHabilitationService.isValidAt` | Direct call (technicianId) | NOT_WIRED | Documented in SUMMARY as deferred — call site does not exist |
| `RhHabilitationService` (expiring_soon emit) | alerts module | `@OnEvent('rh.certification.expiring_soon')` | WIRED | Handler in alerts.event-handlers.ts:76 |
| `BonDeLivraisonService.sign()` | `customs_dossier` | Direct service call when sale_contract.is_export | WIRED | Auto-created on sale() per SUMMARY |
| `InvoiceService.generateForBLs()` | `FxRateSnapshotService.listMissingForDates()` | Pre-flight check (abort on any missing) | WIRED | Verified — invoice.service.ts implements abort-on-missing |
| `Phase3KpiService` | dashboard aggregator | DI in DashboardAggregatorService | WIRED | line 92 of dashboard-aggregator.service.ts |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `bl-list.component.ts` | `rows` signal | `VentesApiService.listBLs()` → backend BL repo | Yes (when tenant-scoped) | FLOWING (tenant context hardcoded) |
| `work-order-list.component.ts` | `rows` signal | `MaintenanceApiService.listWorkOrders('current')` | Yes | FLOWING (tenant context hardcoded `'current'`) |
| `equipment-availability.component.ts` | `rows` | Query → equipment_availability table | Yes (when MtbfCalculatorService.refreshForEquipment fires on WO close) | FLOWING |
| `Phase3KpiService.vteRevenue()` | revenue 7d/30d | LATERAL subquery over signed BL × sale_contract.unit_price | Yes — real query | FLOWING but PROVISIONAL (isProvisional=true) |
| `stockpile_event` (STOCKPILE_OUTFLOW_SALE) | new outflow rows | Should come from BlSignedHandler triggered by BL sign | NO — HOLLOW | BlSignedHandler orphaned; outflow events never created on BL sign |
| `operational_day.closure_blockers` (EXPLOSIVES_RECONCILIATION_GAP) | JSONB blockers | Should come from ExplosivesReconciliationJob → OperationalDayService.blockClosure | NO — DISCONNECTED | OPERATIONAL_DAY_SERVICE proxy is no-op stub in TirModule |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no running server available in this static-analysis verification.

| Behavior | Verification Method | Status |
|----------|---------------------|--------|
| BlSignedHandler instantiated at boot | StockpileModule.providers grep | FAIL — not in providers |
| Spare-part threshold → alert row created | alerts.event-handlers.ts grep | FAIL — no @OnEvent handler |
| WorkOrder open() blocked when habilitation expired | work-order.service.ts grep for isValidAt | FAIL — never called |
| ExplosivesReconciliation blocks closure on gap | tir.module.ts OPERATIONAL_DAY_SERVICE provider review | FAIL — provider is no-op factory |
| Crusher session → STOCKPILE_INFLOW handler instantiated | StockpileModule.providers grep | PASS — line 50 |
| Screening session → per-calibre STOCKPILE_INFLOW handler instantiated | StockpileModule.providers grep | PASS — line 51 |
| Phase3KpiService wired into DashboardAggregator | DI scan | PASS — line 92 |
| Backend i18n has 14 namespaces × 3 langs | ls of locales dirs | PASS — 42 files |
| Web ar.json present + transloco config FR/EN/AR | ls assets/i18n + grep transloco.config | PASS — Phase 2 carryover gap closed |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| TIR-01 | W1-P02 | Explosives ledger append-only + chain-of-hash | SATISFIED | explosives_event partitioned, BEFORE UPDATE/DELETE trigger (pdf_sha256 one-time backfill exception), chain verifier tests |
| TIR-02 | W1-P02 | Detonator tracking by serial | SATISFIED | 5-field detonator entity, lifecycle IN_STOCK→LOADED→FIRED/RETURNED/DESTROYED, unique serial constraint |
| TIR-03 | W1-P02 | Blast plan state machine + HSE clearance | SATISFIED | DRAFT→HSE_APPROVED→LOADED→FIRE_REQUESTED→CLEARED→FIRED→REPORTED, BlastClearanceSaga, 4h timeout job |
| TIR-04 | W1-P02 | Blast charge offline per-hole | SATISFIED | blast_charge append-only, variance_pct GENERATED, mobile blast_charge_form |
| TIR-05 | W1-P02 | Habilitation gate on chargement/tir | SATISFIED | approveLoading + requestFire both call isValidAt with shiftStartLocal |
| TIR-06 | W1-P02 | Blast report immutable + chain-of-hash | SATISFIED | blast_report append-only trigger, chain-of-hash, ERR_PLAN_NOT_FIRED guard |
| TIR-07 | W1-P02 | Réconciliation explosifs bloque clôture J | **BLOCKED** | Service-layer logic correct but OPERATIONAL_DAY_SERVICE proxy is no-op in TirModule. Closure blocking is non-functional in production wiring. |
| CON-01 | W1-P03 | Tonnage concasseur → stockpile event-sourced | SATISFIED | CrusherSession + CrusherSessionCompletedHandler registered in StockpileModule |
| CON-02 | W1-P03 | Énergie par session concassage | SATISFIED | energy_kwh field + post-commit EnergyConsumptionService.upsert(usageType='concassage') |
| CRI-01 | W1-P03 | Classification calibre + non-conformités → stockpile | SATISFIED | ScreeningSession calibre_yields JSONB with CHECK constraint, ScreeningSessionCompletedHandler registered, compound idempotency key |
| MNT-01 | W2-P04 | Équipement avec hour_meter + odometer | SATISFIED | production_equipment extended with hour_meter_current + odometer_km_current + commissioned_date |
| MNT-02 | W2-P04 | Plans préventifs avec interval | PARTIAL | preventive_maintenance_plan entity present with interval_unit/value/next_due_at_utc; **scheduler @Cron job NOT implemented** — preventive WOs never auto-generated |
| MNT-03 | W2-P04 | Ordres de travail lifecycle | PARTIAL | WorkOrderService.open/close + equipment status sync; **habilitation gate NOT wired** (SUMMARY says deferred) |
| MNT-04 | W2-P04 | Consommation pièces avec SELECT FOR UPDATE + alerte seuil | PARTIAL | SparePartService.consume() correct; **alert handler for `maintenance.spare_part.threshold_crossed` NOT in alerts.event-handlers.ts** |
| MNT-05 | W2-P04 + W3-P07 | MTBF/MTTR au dashboard | SATISFIED | MtbfCalculatorService + equipment_availability + Phase3KpiService.maintenanceKpis() wired in DashboardAggregator |
| RH-01 | W0-P01 | Employee CRUD + RLS | SATISFIED | Unified employee table with CHECK, EmployeeService + controller |
| RH-02 | W0-P01 | ShiftEntry append-only + mobile offline | SATISFIED | BEFORE UPDATE/DELETE trigger, recordCheckOut creates superseding row, mobile shift_entry_form + integration test |
| RH-03 | W0-P01 | ShiftRoster avec pessimistic_lock | SATISFIED | version INT auto-increment + 409 on mismatch, weekly view component |
| RH-04 | W0-P01 | Sous-traitants first-class | SATISFIED | subcontractor entity + employee unified table with CHECK constraint |
| HSE-04 | W0-P01 (deferred from Phase 2) | Habilitations temporelles | SATISFIED | RhHabilitationService.isValidAt(employeeId, certCode, asOfDate) + 6 boundary tests + EventChainVerifier extended |
| VTE-01 | W2-P05 | Customer CRM léger | SATISFIED | customer entity + customer-list web component. **REQUIREMENTS.md checkbox NOT updated** (still Pending). |
| VTE-02 | W2-P05 | Sale contract bigint minor units | SATISFIED | sale_contract entity with unit_price_minor_units BIGINT + authorized_transporter_ids[]. **REQUIREMENTS.md checkbox NOT updated**. |
| VTE-03 | W2-P05 | BL offline dual-sign + immutable | PARTIAL | Backend complete (DB immutability trigger, dual SHA-256). **BlSignedHandler ORPHANED — STOCKPILE_OUTFLOW_SALE never fires**. Mobile BL form is a 19-line placeholder shell. **REQUIREMENTS.md checkbox NOT updated**. |
| VTE-04 | W3-P06 | Invoice multi-devise avec FX figé | SATISFIED | InvoiceService pre-flight FX validation, bigint minor units, sequential numbering, DB immutability trigger. PDF render deferred. **REQUIREMENTS.md checkbox NOT updated**. |
| VTE-05 | W2-P05 | Transporteur attaché au BL | SATISFIED | transporter_id column reusing Phase 2 transport. **REQUIREMENTS.md checkbox NOT updated**. |
| VTE-06 | W2-P05 | Dossier douane export | SATISFIED | customs_dossier auto-created on sale() when is_export=true. **REQUIREMENTS.md checkbox NOT updated**. |
| DSH-02 (extension) | W3-P07 | Phase 3 KPI extensions | PARTIAL | Phase3KpiService backend in place, wired into DashboardAggregator. **REST controller endpoints, SSE channel registration, and web widget components all deferred**. |

**REQUIREMENTS.md checkbox state vs reality:**

| Code | REQUIREMENTS.md | Reality |
|------|-----------------|---------|
| TIR-01..07 | `[x]` Complete (03-W1-P02) | Mostly correct — but TIR-07 has a wiring gap (closure-blocker non-functional) |
| CON-01..02, CRI-01 | `[x]` Complete (03-W1-P03) | Correct — fully wired |
| RH-01..04, HSE-04 | `[x]` Complete (W0-P01) | Correct |
| **MNT-01..05** | `[ ]` Pending | **DISCREPANCY** — backend code IS in place. Tracking table says Pending but module exists, services exist, AppModule imports MaintenanceModule. Checkboxes need update + caveats (PM scheduler deferred, alert handler missing, habilitation gate not wired). |
| **VTE-01..06** | `[ ]` Pending | **DISCREPANCY** — code exists for VTE-01,02,04,05,06 (services + entities + UIs). VTE-03 has a critical wiring gap (BlSignedHandler orphaned). Checkboxes need update with caveats. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/modules/stockpile/stockpile.module.ts` | providers (lines 47-57) | BlSignedHandler exists but not in providers array | Blocker | Same pattern as Phase 2 OutboxModule orphan. BL sign event never reaches the handler. STOCKPILE_OUTFLOW_SALE never created. |
| `apps/api/src/modules/tir/tir.module.ts` | 71-83 | OPERATIONAL_DAY_SERVICE inline factory with empty methods | Blocker | TIR-07 regulatory contract violated: gap detected but day can be closed. Comment explicitly says "Placeholder — wired to actual OperationalDayService via DI in Phase 4". |
| `apps/api/src/modules/alerts/alerts.event-handlers.ts` | — | No @OnEvent('maintenance.spare_part.threshold_crossed') | Warning | Alert never created on threshold crossing — operationally serious but not regulatory |
| `apps/api/src/modules/maintenance/services/work-order.service.ts` | — | No RhHabilitationService.isValidAt() call | Warning | Habilitation gate documented as deferred in SUMMARY; non-blocking for happy path but allows assigning unqualified technicians |
| `apps/mobile/lib/features/maintenance/screens/maintenance_screen.dart` | 1-19 | ModulePlaceholder shell only | Warning | Maintenance not capturable in the field. Backend can be exercised via API/web. |
| `apps/mobile/lib/features/ventes/screens/ventes_screen.dart` | 1-19 | ModulePlaceholder shell only | Warning | BL offline dual-signature flow not capturable on mobile — this was a core Phase 3 truth (#5). Backend supports it; UI does not. |
| `apps/web/src/app/features/maintenance/pages/work-order-list.component.ts` | 45 | Hardcoded tenant `'current'` | Warning | Same project-wide deferred auth-context wiring (consistent pattern across all Phase 3 web pages) |
| `apps/web/src/app/features/ventes/pages/bl-list.component.ts` | 101 | listBLs() with no tenant param | Warning | Same — auth wiring deferred |
| `apps/api/src/modules/tir/tir.module.ts` | 76-82 | Comments document the stub (`// Placeholder — wired to actual OperationalDayService via DI in Phase 4. Tests mock this directly.`) | Info | Honest documentation but the stub is in production code |

---

### Human Verification Required

#### 1. BlSignedHandler Wiring Fix + End-to-End BL→Stockpile_Outflow

**Test:** Register `BlSignedHandler` in `StockpileModule.providers`, restart server, sign a BL via `POST /api/bls/:id/sign`, wait for outbox dispatch, then query `GET /api/stockpiles/:id/events`.
**Expected:** A `STOCKPILE_OUTFLOW_SALE` event appears with `source_reference.bl_id` matching the signed BL and tonnage in kg.
**Why human:** Requires running NestJS server + Postgres + outbox worker; cannot verify statically.

#### 2. ExplosivesReconciliation Closure-Blocker End-to-End

**Test:** After wiring real `OperationalDayService` into `TirModule`, run `ExplosivesReconciliationJob` for a day with a 60g discrepancy.
**Expected:** `operational_day.closure_blockers` contains `[{"code":"EXPLOSIVES_RECONCILIATION_GAP", ...}]` and any attempt to close the day fails with `ERR_DAY_HAS_BLOCKERS`.
**Why human:** Requires running server + Postgres + BullMQ. Currently expected to FAIL because the OPERATIONAL_DAY_SERVICE proxy is a stub.

#### 3. Spare-Part Threshold Alert

**Test:** After adding the `maintenance.spare_part.threshold_crossed` `@OnEvent` handler to `AlertsEventHandlers`, consume enough spare parts to cross a threshold and observe the alerts inbox.
**Expected:** A new alert row appears with `source_event_type='maintenance.spare_part.threshold_crossed'` and severity=high.
**Why human:** Requires running server.

#### 4. Habilitation Gate on Work Order Open

**Test:** After wiring `RhHabilitationService.isValidAt(technicianId, requiredCert, openedAtUtc)` into `WorkOrderService.open()`, attempt to open a WO with an expired-cert technician.
**Expected:** `ERR_HABILITATION_EXPIRED` thrown; equipment status unchanged.
**Why human:** Requires running server; currently this call site does not exist.

#### 5. Mobile BL Offline Capture (VTE-03 field path)

**Test:** On a Flutter device with no network: open the Ventes module → BL form → enter calibre + tonnage + client/driver signatures → save → restore connectivity → confirm sync.
**Expected:** BL number generated with SITE-YYYYMMDD-DEVICE-SEQ pattern, dual SHA-256 signatures captured, syncs without server conflict.
**Why human:** Requires a real device. Currently the mobile screen is a 19-line ModulePlaceholder — this test will fail at "open the BL form" because there is none.

#### 6. Mobile Maintenance Work-Order Capture (MNT-03 field path)

**Test:** On a Flutter device, attempt to capture a work-order completion.
**Expected:** Diagnosis + downtime + labor hours + spare-part consumption events captured offline-first.
**Why human:** Mobile screen is a placeholder shell. Backend supports it via the web/API path only.

#### 7. REQUIREMENTS.md Checkbox Reconciliation

**Test:** Decide whether MNT-01..05 and VTE-01..06 are "Complete" or "Complete with caveats" given the wiring gaps and deferred UI.
**Expected:** Tracking table updated; partial-completeness annotated where deferred items remain.
**Why human:** Documentation policy call.

---

### Gaps Summary

**Two CRITICAL wiring gaps block regulatory contracts (mirrors of the Phase 2 OutboxModule pattern):**

**Gap 1 (Blocker, regulatory) — TIR-07 OperationalDayService stub:**
`TirModule` provides an inline `OPERATIONAL_DAY_SERVICE` factory whose `blockClosure` and `resolveClosure` methods do nothing (`tir.module.ts` lines 71-83 — confirmed by reading the file). The comment even says "Placeholder — wired to actual OperationalDayService via DI in Phase 4. Tests mock this directly." Result: when `ExplosivesReconciliationJob` detects a discrepancy > 50g, it correctly emits the alert but never actually blocks the day's closure. This violates Success Criterion #2 ("La clôture journalière échoue tant que la réconciliation explosifs entrée/sortie/stock présente le moindre écart"). The fix is to extract or expose the real `OperationalDayService` and wire it into TirModule via proper DI.

**Gap 2 (Blocker, business contract) — BlSignedHandler orphaned in StockpileModule:**
`apps/api/src/modules/stockpile/event-handlers/bl-signed.handler.ts` exists with the correct `@Injectable()` + `@OnEvent('production.vte.bl_signed')` decorators. But it is NOT in `StockpileModule.providers` (lines 47-57 of stockpile.module.ts — only crusher/screening/rotation handlers + balance projection + balance recompute job). Same orphan pattern as the Phase 2 OutboxModule gap. Result: signing a BL emits the outbox event but no `STOCKPILE_OUTFLOW_SALE` is ever created. This violates Success Criterion #5 (BL → stockpile event-sourced outflow). One-line fix: add `BlSignedHandler` to the providers array (and import it at top of file).

**Three medium gaps (operational quality):**

**Gap 3 (Warning) — Maintenance alert handler missing:**
`SparePartService.consume()` emits `maintenance.spare_part.threshold_crossed` but `AlertsEventHandlers` has no `@OnEvent` for this — confirmed by grep. The pattern mirrors STK-02 (which IS wired) but was not replicated. Add an `@OnEvent('maintenance.spare_part.threshold_crossed')` handler with dedupe key `tenantId:partId`.

**Gap 4 (Warning) — Habilitation gate missing on WorkOrderService.open():**
SUMMARY explicitly says: "integration hook present (technicianId column) and check can be added with `isValidAt(technicianId, requiredCert, openedAtUtc.toISOString().slice(0,10))`". The hook is not called. Risk: assigning unqualified technicians to maintenance interventions on safety-critical equipment.

**Gap 5 (Warning) — PM scheduler @Cron deferred:**
`preventive_maintenance_plan` entity has `next_due_at_utc` but no `PmSchedulerService` exists. Preventive WOs are never auto-generated — they must be created manually. Backend contract is in place; cron job is the missing piece.

**Two mobile coverage gaps (field workflow regression):**

**Gap 6 (Warning) — Mobile maintenance screen is a 19-line placeholder:**
`apps/mobile/lib/features/maintenance/screens/maintenance_screen.dart` is a `ModulePlaceholder` shell with no functionality. Field technicians cannot capture work-order completions, downtime, or spare-part consumption from a mobile device. Backend supports it via API/web only.

**Gap 7 (Warning, regulatory-adjacent) — Mobile ventes/BL screen is a 19-line placeholder:**
Success Criterion #5 explicitly requires offline BL capture with dual signature pads on mobile. `apps/mobile/lib/features/ventes/screens/ventes_screen.dart` is a placeholder shell. Drivers in the field cannot generate BLs offline. This was deferred per the W2-P05 SUMMARY but the truth requires it.

**Documentation discrepancies (non-blocking but should be reconciled):**

REQUIREMENTS.md still shows MNT-01..05 and VTE-01..06 as `[ ] Pending` while implementations exist (with the caveats above). The tracking table needs updates that distinguish "Complete" from "Complete with caveats" (e.g., MNT-02 "scheduler @Cron deferred", VTE-03 "BlSignedHandler orphaned").

ADR-0011..0015 remain in Draft status per the W3-P07 SUMMARY which deferred promotion to Accepted. ADR review pass should be scheduled.

The Phase 2 carryover gap (web ar.json) has been closed — `transloco.config.ts` now declares `['fr', 'en', 'ar']` and `ar.json` exists in web assets. Backend i18n has 14 namespaces × 3 = 42 files (Phase 3 added rh, tir, concassage, criblage, maintenance, ventes on top of Phase 2's 8 namespaces).

---

_Verified: 2026-05-16T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
