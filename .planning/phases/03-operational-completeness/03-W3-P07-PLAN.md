---
phase: 03-operational-completeness
plan: W3-P07
type: execute
wave: 3
autonomous: true
depends_on: [03-W2-P04, 03-W2-P05, 03-W3-P06, 03-W1-P02, 03-W1-P03]
files_modified:
  - apps/api/src/modules/dashboard/dashboard.module.ts
  - apps/api/src/modules/dashboard/controllers/dashboard.controller.ts
  - apps/api/src/modules/dashboard/services/maintenance-kpi.service.ts
  - apps/api/src/modules/dashboard/services/tir-kpi.service.ts
  - apps/api/src/modules/dashboard/services/vte-revenue-kpi.service.ts
  - apps/api/src/modules/dashboard/services/processing-kpi.service.ts
  - apps/api/src/modules/dashboard/tests/maintenance-kpi.spec.ts
  - apps/api/src/modules/dashboard/tests/vte-revenue-kpi.spec.ts
  - apps/web/src/app/features/dashboard/widgets/maintenance-availability.widget.ts
  - apps/web/src/app/features/dashboard/widgets/tir-summary.widget.ts
  - apps/web/src/app/features/dashboard/widgets/vte-revenue.widget.ts
  - apps/web/src/app/features/dashboard/widgets/processing-throughput.widget.ts
  - apps/web/src/app/features/dashboard/pages/site-dashboard.component.ts
  - apps/web/src/app/features/dashboard/services/dashboard-api.service.ts
  - apps/api/src/modules/sse/sse-broadcaster.service.ts
  - docs/adr/ADR-0011-rh-habilitation-as-of.md
  - docs/adr/ADR-0012-tir-blast-plan-saga.md
  - docs/adr/ADR-0013-con-cri-stockpile-consumers.md
  - docs/adr/ADR-0014-mnt-maintenance-lifecycle.md
  - docs/adr/ADR-0015-vte-bl-invoice-fx-freeze.md
task_count: 3
requirements: [MNT-05, DSH-02]

must_haves:
  truths:
    - "SiteDashboard displays MTBF/MTTR availability cards per equipment type (from equipment_availability table)"
    - "SiteDashboard displays last blast summary and open blast plan count for TIR_SUPERVISOR and HSE_OFFICER"
    - "SiteDashboard displays VTE revenue widget (week/month in XOF, provisional label) for SALES_MANAGER and FINANCE_OFFICER"
    - "SiteDashboard displays processing throughput (crusher daily output, screening calibre breakdown) for QUARRY_CHIEF"
    - "SSE broadcaster publishes maintenance.equipment.availability_updated when WorkOrderService.close() triggers MTBF refresh"
    - "All 5 Phase 3 ADRs are promoted from Draft to Accepted with Implementation Notes"
  artifacts:
    - path: "apps/api/src/modules/dashboard/services/maintenance-kpi.service.ts"
      provides: "MTBF/MTTR per equipment + availability_pct for dashboard"
      exports: ["MaintenanceKpiService"]
    - path: "apps/api/src/modules/dashboard/services/vte-revenue-kpi.service.ts"
      provides: "Weekly/monthly revenue in XOF from invoice_line + provisional label"
      exports: ["VteRevenueKpiService"]
    - path: "apps/api/src/modules/sse/sse-broadcaster.service.ts"
      provides: "Extended with 6 new Phase 3 SSE channels"
  key_links:
    - from: "apps/api/src/modules/maintenance/services/mtbf-calculator.service.ts"
      to: "apps/api/src/modules/sse/sse-broadcaster.service.ts"
      via: "sseBroadcaster.broadcast('maintenance.equipment.availability_updated', { equipment_id, availability_pct })"
    - from: "apps/api/src/modules/dashboard/controllers/dashboard.controller.ts"
      to: "apps/api/src/modules/dashboard/services/maintenance-kpi.service.ts"
      via: "GET /dashboard/maintenance-kpis?site_id="
---

# Plan: 03-W3-P07 — Dashboard Extensions + ADR Promotion (MNT-05, DSH-02)

## Objective

Extend the existing Phase 2 site dashboard with 4 new Phase 3 KPI widgets: maintenance availability (MTBF/MTTR per equipment), TIR blast summary (last blast + open plans), VTE revenue (week/month provisoire), and processing throughput (crusher + screening daily output). Wire 6 new SSE channels for real-time Phase 3 event push. Promote all 5 Phase 3 ADR drafts to Accepted with Implementation Notes. This plan closes out Phase 3.

**Purpose:** Make Phase 3 operational data visible in the role-adapted dashboard so operators, maintenance techs, and commercial teams have real-time visibility.
**Output:** 4 new dashboard widget components, 4 new KPI backend services, SSE broadcaster extensions, 5 ADRs promoted to Accepted.

## Context

**From Phase 2 W3-P08 (Dashboard + SSE — Phase 2 baseline):**
```typescript
// apps/api/src/modules/sse/sse-broadcaster.service.ts
// Already broadcasts: stockpile.balance_updated, fuel.tank_balance_updated, hse.incident.created, alert.created
// Phase 3 adds 6 new channels (see Task 1)

// apps/web/src/app/features/dashboard/pages/site-dashboard.component.ts
// Already renders: production KPIs (tonnes, drilling yield), fuel balance, HSE TF rate, stockpile cards
// Phase 3 adds 4 new widget slots below existing widgets
```

**From 03-W2-P04 (Maintenance — feeds this plan):**
```typescript
// apps/api/src/modules/maintenance/entities/equipment-availability.entity.ts
// Fields: equipment_id, mtbf_hours, mttr_hours, availability_pct, refreshed_at_utc
// Refreshed by MTBFCalculatorService.refreshForEquipment() on WorkOrderService.close()
```

**From 03-W1-P02 (TIR — feeds this plan):**
```typescript
// blast_plan table: status, site_id, tenant_id, fired_at_utc
// blast_report table: blast_plan_id, fragmentation_obs, vibration_mm_s, occurred_at_utc
// Read last REPORTED blast + COUNT open plans (DRAFT + HSE_APPROVED + LOADED + FIRE_REQUESTED)
```

**From 03-W3-P06 (VTE — feeds this plan):**
```typescript
// invoice_line table: line_total_minor, currency, created_at_utc
// invoice table: invoice_date, currency_reporting, total_minor_reporting (XOF)
// Revenue widget: SUM(total_minor_reporting) WHERE invoice_date IN [week/month] AND status = 'SENT'
// Label: 'ventes.revenue_provisional' (same label discipline as 'stockpile.cost_model_version_disclaimer')
```

**From 03-W1-P03 (CON/CRI — feeds this plan):**
```typescript
// crusher_session table: output_tonnage_kg, session_start_utc, status = 'COMPLETED'
// screening_session table: calibre_yields JSONB, session_start_utc
```

## Tasks

### Task 1 — SSE broadcaster extensions + KPI services (MNT-05, DSH-02)

**Files:**
- `apps/api/src/modules/sse/sse-broadcaster.service.ts`
- `apps/api/src/modules/dashboard/services/maintenance-kpi.service.ts`
- `apps/api/src/modules/dashboard/services/tir-kpi.service.ts`
- `apps/api/src/modules/dashboard/services/vte-revenue-kpi.service.ts`
- `apps/api/src/modules/dashboard/services/processing-kpi.service.ts`
- `apps/api/src/modules/dashboard/controllers/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.module.ts`
- `apps/api/src/modules/dashboard/tests/maintenance-kpi.spec.ts`
- `apps/api/src/modules/dashboard/tests/vte-revenue-kpi.spec.ts`

**Action:**

**SSE Broadcaster extensions:**

Add 6 new SSE channel registrations to `SseBroadcasterService` (same pattern as existing channels):
```typescript
'maintenance.equipment.availability_updated' // payload: { equipment_id, availability_pct, mtbf_hours, mttr_hours }
'maintenance.pm_due'                          // payload: { equipment_id, plan_id, description }
'maintenance.spare_part.threshold_crossed'    // payload: { spare_part_id, part_number, quantity_on_hand }
'tir.blast_plan.status_changed'               // payload: { plan_id, old_status, new_status }
'tir.reconciliation.gap_detected'             // payload: { site_id, gap_g, operational_day_id }
'vte.invoice.created'                         // payload: { invoice_ids, total_xof_minor }
```

Wire `SseBroadcasterService.broadcast('maintenance.equipment.availability_updated', ...)` call into `MTBFCalculatorService.refreshForEquipment()` after the `equipment_availability` upsert commits.

Wire `SseBroadcasterService.broadcast('tir.blast_plan.status_changed', ...)` call in `BlastPlanService` after each status transition.

**MaintenanceKpiService:**
```typescript
async getEquipmentAvailability(siteId: string, tenantId: string): Promise<EquipmentAvailabilityKpi[]>
// Joins equipment_availability with production_equipment
// Returns: [{ equipment_id, equipment_name, type, status, mtbf_hours, mttr_hours, availability_pct, refreshed_at_utc }]
// Sorted by availability_pct ASC (worst first — operational priority)
```

**TirKpiService:**
```typescript
async getSiteTirSummary(siteId: string, tenantId: string): Promise<TirSummaryKpi>
// Returns:
// {
//   open_blast_plans_count: number,  // status IN (DRAFT, HSE_APPROVED, LOADED, FIRE_REQUESTED)
//   last_blast: {
//     blast_plan_id, fired_at_utc, fragmentation_obs, vibration_mm_s  // from blast_report
//   } | null,
//   pending_reconciliation: boolean  // operational_day.closure_blockers contains 'EXPLOSIVES_RECONCILIATION_GAP'
// }
```

**VteRevenueKpiService:**
```typescript
async getSiteRevenue(siteId: string, tenantId: string): Promise<VteRevenueKpi>
// Returns:
// {
//   revenue_week_xof_minor: bigint,    // SUM(total_minor_reporting) last 7 days, status=SENT
//   revenue_month_xof_minor: bigint,   // SUM(total_minor_reporting) last 30 days, status=SENT
//   bl_count_pending_invoice: number,  // SIGNED BLs not yet INVOICED
//   is_provisional: true               // always true — Phase 4 analytics will refine
// }
```

**ProcessingKpiService:**
```typescript
async getDailyProcessingKpi(siteId: string, tenantId: string, date: Date): Promise<ProcessingKpi>
// Returns:
// {
//   crusher_output_kg: bigint,    // SUM(output_tonnage_kg) from completed crusher_sessions today
//   screening_by_calibre: [{ calibre_code, tonnage_kg }],  // from screening_sessions JSONB yields
//   total_processed_kg: bigint    // sum of all
// }
```

`DashboardController`:
- `GET /dashboard/maintenance-kpis?site_id=` — MaintenanceKpiService
- `GET /dashboard/tir-summary?site_id=` — TirKpiService
- `GET /dashboard/vte-revenue?site_id=` — VteRevenueKpiService
- `GET /dashboard/processing-kpi?site_id=&date=` — ProcessingKpiService

Tests `maintenance-kpi.spec.ts`:
- `getEquipmentAvailability` returns sorted list (worst availability first)
- Equipment with NULL mtbf_hours (no failures) returns `availability_pct = 100.00`
- SSE broadcast called after MTBF refresh (mock SseBroadcasterService)

Tests `vte-revenue-kpi.spec.ts`:
- Revenue week sum correct (only SENT invoices counted, not DRAFT)
- `bl_count_pending_invoice` counts only SIGNED BLs
- `is_provisional = true` always present in response

**Commit:** `feat(03-dashboard): SSE broadcaster +6 channels + 4 Phase 3 KPI services`

**Verify:**
```
pnpm --filter=@gravel/api test maintenance-kpi*
pnpm --filter=@gravel/api test vte-revenue-kpi*
pnpm --filter=@gravel/api build
```

**Done:** KPI service tests pass. SSE broadcast mock verified in maintenance KPI test. API build clean.

---

### Task 2 — Dashboard web widgets (MNT-05, DSH-02)

**Files:**
- `apps/web/src/app/features/dashboard/widgets/maintenance-availability.widget.ts`
- `apps/web/src/app/features/dashboard/widgets/tir-summary.widget.ts`
- `apps/web/src/app/features/dashboard/widgets/vte-revenue.widget.ts`
- `apps/web/src/app/features/dashboard/widgets/processing-throughput.widget.ts`
- `apps/web/src/app/features/dashboard/pages/site-dashboard.component.ts`
- `apps/web/src/app/features/dashboard/services/dashboard-api.service.ts`

**Action:**

**4 new Angular widget components** added to the existing `SiteDashboardComponent` template below the Phase 2 KPI section. Each widget follows the same standalone Angular component pattern as Phase 2 dashboard widgets.

`MaintenanceAvailabilityWidget`:
- Displays a list of equipment cards (Angular Material `mat-card`). Each card: equipment name + type, status badge (ACTIVE=green, MAINTENANCE=orange, OUT_OF_SERVICE=red), availability percentage (large number with progress circle using ApexCharts radial gauge), MTBF hours, MTTR hours, `refreshed_at_utc` relative time.
- Subscribes to SSE channel `maintenance.equipment.availability_updated` via `SseClientService` — updates the matching equipment card in real-time without full page reload.
- CASL visibility: show for `QUARRY_CHIEF`, `MAINTENANCE_TECH`.
- Empty state: "Aucune donnée de disponibilité disponible — commencer par fermer un ordre de travail."

`TirSummaryWidget`:
- 3-item summary row: "Plans ouverts" (count badge, color orange if > 0), "Dernier tir" (date + fragmentation_obs snippet), "Réconciliation" (green "OK" or red "ÉCART DÉTECTÉ" badge linking to TIR module).
- Subscribes to SSE channel `tir.blast_plan.status_changed` and `tir.reconciliation.gap_detected`.
- CASL visibility: show for `TIR_SUPERVISOR`, `HSE_OFFICER`, `QUARRY_CHIEF`.

`VteRevenueWidget`:
- Two KPI tiles side by side: "Chiffre d'affaires semaine" and "Chiffre d'affaires mois" in XOF (formatted with FCFA suffix).
- Below: "BL en attente de facturation: N" — click navigates to `/ventes/invoices/generate`.
- Provisional label: small text "Données provisoires — consolidation Phase 4" (same label discipline as `stockpile.cost_model_version_disclaimer`).
- Subscribes to SSE channel `vte.invoice.created` — refreshes revenue on new invoice.
- CASL visibility: show for `SALES_MANAGER`, `FINANCE_OFFICER`.

`ProcessingThroughputWidget`:
- Daily bar chart (ApexCharts bar): X axis = last 7 days, Y axis = tonnes. Series: "Concassage" + one series per calibre from screening. Stacked bars.
- Summary tile: "Produit aujourd'hui: X t".
- CASL visibility: show for `QUARRY_CHIEF`, `PROCESSING_OPERATOR`.

`SiteDashboardComponent` update: add a 2-column grid section below existing Phase 2 KPI cards. Left column: `MaintenanceAvailabilityWidget` + `TirSummaryWidget`. Right column: `VteRevenueWidget` + `ProcessingThroughputWidget`. Apply `ngIf` based on CASL permissions so each user only sees their relevant widgets.

Update `dashboard-api.service.ts` with 4 new HTTP methods: `getMaintenanceKpis(siteId)`, `getTirSummary(siteId)`, `getVteRevenue(siteId)`, `getProcessingKpi(siteId, date)`.

**Commit:** `feat(03-dashboard): 4 Phase 3 KPI widgets added to site dashboard`

**Verify:**
```
pnpm --filter=@gravel/web build
```

**Done:** Web build clean. Site dashboard renders 4 new widget sections. SSE subscriptions wired in widgets.

---

### Task 3 — ADR promotion (ADR-0011..ADR-0015)

**Files:**
- `docs/adr/ADR-0011-rh-habilitation-as-of.md`
- `docs/adr/ADR-0012-tir-blast-plan-saga.md`
- `docs/adr/ADR-0013-con-cri-stockpile-consumers.md`
- `docs/adr/ADR-0014-mnt-maintenance-lifecycle.md`
- `docs/adr/ADR-0015-vte-bl-invoice-fx-freeze.md`

**Action:**

For each of the 5 ADR files created in W0-P01 Task 4:
1. Change `## Status` from `Draft` to `Accepted`
2. Add a `## Implementation Notes` section documenting what was actually built (same format as ADR-0006..0010 from Phase 2 W0-P01)

Implementation Notes to add per ADR:

**ADR-0011 Implementation Notes:**
- `employee_certification` table verbatim from `hse-rh-deferred-scope.md` — no changes to designed schema
- `RhHabilitationService.isValidAt(employeeId, certCode, asOfDate)` — explicit date parameter enforced; 6 boundary-case tests in `rh-habilitation.spec.ts`
- Hard-block implemented (no soft warning bypass) at `BlastPlanService.approveLoading()` and `WorkOrderService.assign()` for mobile equipment
- `OperationalDay.closure_blockers JSONB` migration delivered in W0-P01 as extension point for Phase 4

**ADR-0012 Implementation Notes:**
- `blast_plan` mutable state machine (no append-only trigger) — `blast_charge`, `explosives_event`, `blast_report` append-only
- PDF snapshot async via `tir.explosives_event.appended` outbox event — not inside append transaction (Pitfall 7 prevention)
- Clearance saga via EventEmitter2: `tir.blast_plan.zone_cleared` crosses module boundary without direct HSE import
- 4-hour timeout: BullMQ delayed job `blast-clearance-timeout.job.ts`
- `ExplosivesReconciliationJob`: `@Cron('30 22 * * *')` UTC, calls `blockClosure('EXPLOSIVES_RECONCILIATION_GAP')`

**ADR-0013 Implementation Notes:**
- CRI compound idempotency key `${session_id}_${calibre_code}` on `stockpile_event.source_reference->>'screening_idempotency_key'`
- DB unique partial index on both `crusher_session_id` and `screening_idempotency_key` fields
- CON-02 energy wired via `energyConsumptionService.recordReading()` on `CrusherSessionService.complete()`

**ADR-0014 Implementation Notes:**
- `production_equipment` extended with `hour_meter_current`, `odometer_km_current`, `spec_jsonb`, `commissioned_date` via additive migration
- `SparePartService.consume()` uses `SELECT FOR UPDATE` — negative stock prevention tested in unit spec
- MTBF/MTTR materialized in `equipment_availability` table, refreshed on `WorkOrderService.close()`, broadcast via SSE `maintenance.equipment.availability_updated`

**ADR-0015 Implementation Notes:**
- BL offline numbering: `SITE-BL-YYYYMMDD-DEVICE-SEQ` (generalizes ADR-0009 pattern)
- `fx_rate_snapshot.rate_minor` = rate × 10^6; BIGINT; UNIQUE per (tenant, from/to currency, date)
- Invoice pre-flight: `listMissingForDates()` called before any batch processing (Pitfall 4 prevention)
- `VteModule` → `StockpileModule` via outbox only (Pitfall 8 prevention per ADR-0015)
- Phase 4 will add PDF invoice generation

**Commit:** `docs(03-adr): ADR-0011..0015 Draft → Accepted + Implementation Notes`

**Verify:**
```
grep -l "## Status" docs/adr/ADR-001[1-5]*.md | xargs grep -l "Accepted" | wc -l  # must be 5
grep -l "## Implementation Notes" docs/adr/ADR-001[1-5]*.md | wc -l  # must be 5
```

**Done:** 5 ADR files updated to Accepted with Implementation Notes sections.

## Key Constraints

- Revenue KPI label MUST include `is_provisional: true` in API response and "Données provisoires" in UI (same label discipline as Phase 2 stockpile `cost_model_version_disclaimer`)
- SSE channels must be registered in `SseBroadcasterService` — not ad-hoc inline emissions
- Dashboard widgets must respect CASL visibility per role — no cross-role data leakage
- MTBF/MTTR cards show `null` values as "N/A" in UI (not 0, not empty — equipment with no failures has perfect reliability, not zero MTBF)
- ADR Implementation Notes must document actual file names and decisions made — not copy-paste the Plan's Action section

## Integration Points

This is the terminal plan of Phase 3. No downstream plans within Phase 3.

For Phase 4:
- `invoice.total_minor_reporting` (XOF) — Phase 4 FIN-02 uses for multi-currency margin calculation
- `equipment_availability.availability_pct` — Phase 4 DSH-03 uses for equipment KPI in consolidated group dashboard
- `blast_report.vibration_mm_s` — Phase 4 analytics: blasting efficiency trends
- `OperationalDay.closure_blockers` pattern — Phase 4 month-end closure adds `FINANCE_MONTH_END_PENDING` reason

## Success Criteria

- [ ] `pnpm --filter=@gravel/api test maintenance-kpi*` — sorted availability + SSE mock
- [ ] `pnpm --filter=@gravel/api test vte-revenue-kpi*` — SENT-only filter + provisional flag
- [ ] `pnpm --filter=@gravel/api build` — clean
- [ ] `pnpm --filter=@gravel/web build` — clean
- [ ] Site dashboard renders 4 new widget sections when accessing `/dashboard/:siteId`
- [ ] 5 ADR files contain `## Status: Accepted` and `## Implementation Notes` sections
- [ ] Phase 3 success criteria checklist (from ROADMAP.md) manually verifiable:
  - [ ] Success criteria 1: blast plan + clearance saga + detonator tracking (W1-P02)
  - [ ] Success criteria 2: reconciliation blocks OperationalDay closure + immutable blast report (W1-P02)
  - [ ] Success criteria 3: maintenance work order → MTBF/MTTR dashboard widget (W2-P04 + W3-P07)
  - [ ] Success criteria 4: habilitation as-of gate + subcontractors (W0-P01)
  - [ ] Success criteria 5: BL offline + invoice FX freeze + customs dossier (W2-P05 + W3-P06)
  - [ ] Success criteria 6: crusher/screen → stockpile INFLOW (W1-P03)

## Output

After completion, create `.planning/phases/03-operational-completeness/03-W3-P07-SUMMARY.md`
