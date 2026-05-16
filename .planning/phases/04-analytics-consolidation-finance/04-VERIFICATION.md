---
phase: 04-analytics-consolidation-finance
verified: 2026-05-16T00:00:00Z
status: gaps_found
score: 1/6 success criteria verified (3 partial, 2 failed)
re_verification: false
gaps:
  - truth: "La Direction Groupe consulte un dashboard consolidé multi-pays affichant P&L et marge en devise pivot (XOF ou EUR), avec drill-down jusqu'à un site, un contrat ou une matière"
    status: partial
    reason: "ConsolidationService + GET /api/analytics/consolidation + ConsolidationComponent are wired (pivot XOF/EUR, fx_rate_snapshot lookup, site drill-down). Drill-down to contract and to matière (calibre) is NOT implemented — the bySite array exposes only siteId+revenue+cost+margin+tonnage. ConsolidationComponent has no contract or matière drill-down. No multi-tenancy guard on the controller — controller relies on implicit AuthedRequest typing but declares no @UseGuards or @Roles decorator."
    artifacts:
      - path: "apps/api/src/modules/analytics/services/consolidation.service.ts"
        issue: "Returns bySite only. No bySiteByContract / byCalibreCode grouping. No matière dimension."
      - path: "apps/web/src/app/features/finance/pages/consolidation.component.ts"
        issue: "Single-level grid (site only). No expand-to-contract / expand-to-matière interaction. No site-comparison chart (DSH-05 explicitly requires 'comparaison sites')."
      - path: "apps/api/src/modules/analytics/controllers/analytics.controller.ts"
        issue: "@Controller('analytics') with no @UseGuards / @Roles — tenantId read from req.user but no enforcement that the user has consolidation rights."
    missing:
      - "Add drill-down by contract and by calibre to ConsolidationService (bySite[].byContract, bySite[].byCalibre)"
      - "Wire site-comparison chart in ConsolidationComponent (DSH-05)"
      - "Apply JwtAuthGuard + Roles guard to AnalyticsController endpoints"

  - truth: "Le coût direct par tonne par site et matière (extraction, transport, concassage, criblage, carburant, main d'œuvre, amortissement) se met à jour quotidiennement et se compare au budget annuel"
    status: partial
    reason: "Schema captures all 7 cost components correctly. BUT 4 of 7 components are hardcoded to 0n in CostPerTonAggregatorService (extraction=0n, concassage=0n, criblage=0n, amortissement=0n) — SUMMARY admits 'placeholder XOF rates' deferred to refinement sprint. carburant uses hardcoded 800 XOF/L, main_oeuvre uses hardcoded 2500 XOF/h, transport uses hardcoded 5000 XOF/rotation. No @Cron job — aggregation is only triggered manually via POST /analytics/cost-per-ton/aggregate. There is no nightly orchestration that fans out to all (site × calibre × date) combinations."
    artifacts:
      - path: "apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts"
        issue: "Lines 93-96: costExtractionMinor / costConcassageMinor / costCriblageMinor / costAmortissementMinor all hardcoded 0n. Lines 55, 78, 90: hardcoded rates (800, 2500_00n, 5000_00n)."
      - path: "apps/api/src/modules/analytics"
        issue: "No CostPerTonAggregationJob with @Cron — no daily fan-out, no automatic update. Comparison to budget exists via BudgetComparisonService but it reads analytical_entry, not cost_per_ton_snapshot, so the 'compare to budget' loop is not closed for the cost_per_ton numbers."
    missing:
      - "Implement extraction / concassage / criblage / amortissement cost components (or a rate-config table per CLAUDE.md)"
      - "Add @Cron nightly job to enumerate (site, calibre, date) and call aggregateForDate"
      - "Replace hardcoded XOF rates with a labor_rate / fuel_price / transport_rate config table"

  - truth: "La marge par contrat / client / site est calculée en devise groupe avec conversion FX figée référencée par ID immuable"
    status: partial
    reason: "MarginService.marginByContract() and marginBySite() are implemented with correct revenue / cost math in bigint minor units. BUT marginByCustomer is missing entirely (the truth explicitly lists 'par contrat / client / site'). FX conversion 'figée référencée par ID immuable' is NOT implemented in MarginService — it always returns the pivot label 'XOF' without actually converting from the BL contract currency. ConsolidationService does perform FX conversion via fx_rate_snapshot, but it does NOT store the snapshot_id used, so the conversion is not 'référencée par ID immuable'."
    artifacts:
      - path: "apps/api/src/modules/analytics/services/margin.service.ts"
        issue: "No marginByCustomer method. Currency parameter accepted but no FX conversion performed; result currency hardcoded to pivot label."
      - path: "apps/api/src/modules/analytics/services/consolidation.service.ts"
        issue: "Reads fx_rate_snapshot.rate but does not return / persist the snapshot id alongside the converted figure — no immutable trace of which FX snapshot drove the consolidation row."
    missing:
      - "Add marginByCustomer method on MarginService"
      - "Add FX conversion in MarginService using fx_rate_snapshot lookup (with snapshot id capture)"
      - "Return fxSnapshotId in ConsolidatedPnL.bySite[] rows for audit trail"

  - truth: "Un export comptable analytique au format Sage / Ciel / Odoo CI (OHADA-conforme) est généré sur demande et accepté tel quel par l'expert-comptable"
    status: partial
    reason: "OhadaExportService implements 3 target adapters (sage tab-separated, ciel semicolon, odoo CSV) and reads analytical_entry rows. OhadaExportComponent triggers download. BUT analytical_entry is largely empty: AnalyticalEntryWriterHandler only handles 2 events (production.vte.bl_signed, maintenance.work_order.closed) and the work_order handler writes amount=0 explicitly until 'Phase 6 FIN-07'. Extraction, transport, concassage, criblage, carburant, foration, tir, HSE write nothing to analytical_entry. The SUMMARY itself admits 'analytical_entry writers in other modules not yet auto-populated — manual seed/scripted backfill needed'. An export today produces a near-empty CSV. Whether the format is 'accepté tel quel par l'expert-comptable' is OHADA-LOW-confidence per ROADMAP gate and requires human verification with a real expert-comptable."
    artifacts:
      - path: "apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts"
        issue: "Only 2 @OnEvent handlers — production.vte.bl_signed and maintenance.work_order.closed. The work_order handler writes amount=0 hardcoded with comment 'Amount=0 until labor rates are configured (Phase 6 FIN-07)'."
      - path: "apps/api/src/modules/analytics/services/ohada-export.service.ts"
        issue: "Format adapters are minimal: Sage adapter does not respect Sage 100 OHADA expected layout (PCE, journals, lots); Ciel uses XOF=0-decimal heuristic but no Ciel column codes; Odoo adapter is generic CSV not Odoo OHADA localization journal-import format. None of the three has been validated against an actual accountant export template."
    missing:
      - "Wire analytical_entry writers in extraction / transport / fuel / concassage / tir / hse modules"
      - "Replace amount=0 placeholder in work_order writer with real labor cost"
      - "Validate each adapter against a Sage 100 OHADA / Ciel / Odoo CI sample file from the expert-comptable workshop (ROADMAP human prerequisite)"

  - truth: "Le moteur d'alertes notifie en temps réel (email/SMS/in-app) les seuils franchis, incidents critiques HSE et écarts explosifs, par profil et par site"
    status: partial
    reason: "AlertDispatcherService has 4 @OnEvent handlers (stockpile threshold, spare part low, HSE incident, tir reconciliation gap) and routes through alert_rule config. in_app channel writes to the existing alert table — functional. BUT email and sms channels are logger.log() stubs (SUMMARY admits 'Phase 6'). No alert_rule rows are seeded anywhere — the alert_rule table will be empty in a fresh deployment, so dispatch() finds zero rules and writes zero alerts even though all 4 events fire. 'par profil et par site' filtering by site is NOT implemented — alert_rule has tenant_id + event_type + role_codes + user_ids but no site_id filter; routing is not site-scoped."
    artifacts:
      - path: "apps/api/src/modules/analytics/services/alert-dispatcher.service.ts"
        issue: "email and sms channels are logger.log() stubs. No site-scoped filter — alerts route at tenant level only."
      - path: "apps/api/src/modules/analytics/entities/alert-rule.entity.ts"
        issue: "No site_id field on AlertRule — cannot scope rules per site, contradicting 'par profil et par site'."
      - path: "apps/api/src/modules/analytics/migrations/1718000000000__create_analytics_tables.sql"
        issue: "alert_rule table created with no DEFAULT / no seed inserts. A fresh tenant has no rules, so dispatch() is a silent no-op for all 4 critical event types."
    missing:
      - "Add site_id column to alert_rule and route filter by event payload site_id"
      - "Seed default alert_rule rows per tenant (in_app channel for all 4 critical events)"
      - "Wire real email provider (Phase 6 per project plan — non-blocking for this phase but flagged)"
      - "Wire real SMS provider (Phase 6)"

  - truth: "Les KPI Finance (coût/tonne, marge, conso carburant, coût maintenance) et HSE (incidents, TF, conformité audits) sont disponibles par profil utilisateur sur dashboard temps réel"
    status: failed
    reason: "DSH-03 (Finance KPIs: coût/tonne, marge, conso carburant, coût maintenance) is NOT rendered on any dashboard. The site-director-dashboard.component.html shows only the Phase 2 cost-per-ton-provisional-tile (provisional carburant-only, not the new FIN-01 aggregator output), tonnage tiles, TF, and incident counts. There is no marge tile, no conso carburant tile, no coût maintenance tile. DSH-04 partially exists (TF + incident counts already from Phase 2) but 'conformité audits' is not surfaced. DSH-05 (Reporting consolidé groupe avec comparaison sites et drill-down) is partially served by ConsolidationComponent but lacks site-comparison chart and full drill-down. No group-director / direction-groupe persona dashboard exists at all — there is no apps/web/src/app/features/dashboard-group/ feature."
    artifacts:
      - path: "apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.html"
        issue: "No marge, no conso carburant aggregated tile, no coût maintenance tile, no conformité audits tile. cost-per-ton tile is Phase 2 provisional (carburant only), not wired to FIN-01 aggregator output."
      - path: "apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.ts"
        issue: "SiteDirectorDashboard interface (line 42+) has no margin, no fuel_consumption_total, no maintenance_cost, no audit_conformity_pct fields."
      - path: "apps/web/src/app/features"
        issue: "No dashboard-group feature directory — Direction Groupe persona has no dedicated dashboard. The /finance route (FinanceShellComponent) is the closest, but it is 3 tabs (consolidation/budget/ohada) and not a KPI dashboard."
    missing:
      - "Add 4 Finance KPI tiles to site-director dashboard (coût/tonne from FIN-01, marge from FIN-02, conso carburant total, coût maintenance)"
      - "Add 1 HSE conformité audits tile (HSE-05 audit pass rate)"
      - "Create a dashboard-group feature (DirectionGroupeDashboard) with consolidated KPIs across all sites"
      - "Add i18n keys for finance.budget.title, finance.consolidation.title, finance.ohada.title, finance.ohada.target in fr.json + en.json + ar.json (currently only 4 finance.ohada.* keys exist)"

human_verification:
  - test: "Validate Sage 100 OHADA / Ciel / Odoo CI export formats against a real sample from the Gravel Ivoire expert-comptable"
    expected: "The CSV/TSV produced by OhadaExportService is importable as-is into the target accounting software with zero hand-editing"
    why_human: "Requires the expert-comptable workshop (ROADMAP Phase 4 explicit human prerequisite — 'formats export fiscal OHADA par pays, spec FEC-equivalent'); cannot be verified statically"
  - test: "End-to-end consolidation: seed budgets + analytical_entry + cost_per_ton_snapshot for 2 sites and 1 contract, verify ConsolidationComponent shows correct pivot-currency P&L"
    expected: "GET /api/analytics/consolidation?pivot=XOF returns non-zero revenue + cost + margin, FX conversion applied where contract currency != pivot, drill-down to site visible in ConsolidationComponent grid"
    why_human: "Requires running Postgres + NestJS + Angular + seeded data — cannot be exercised statically"
  - test: "Verify in_app alerts actually fire after seeding alert_rule rows and triggering one stockpile threshold crossing"
    expected: "A row appears in the alert table with the correct event_type and severity"
    why_human: "Requires a running server and a way to trigger the upstream event"
  - test: "Verify cost_per_ton aggregation is correct when all 7 cost components carry real (non-placeholder) values"
    expected: "Aggregated total_cost_minor matches hand calculation; cost_per_ton_minor divides total by tonnage correctly in bigint discipline"
    why_human: "Requires production-realistic seeded data and a finance-domain reviewer"
---

# Phase 04: Analytics, Consolidation & Finance — Verification Report

**Phase Goal:** Le plan analytique consolidé groupe est en place — coût à la tonne, marge, budgets, exports OHADA vers comptabilité tierce — sans jamais devenir une comptabilité générale.

**Verified:** 2026-05-16T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Direction Groupe consulte dashboard consolidé multi-pays P&L + marge en devise pivot avec drill-down site/contrat/matière | PARTIAL | ConsolidationService + endpoint + ConsolidationComponent wired (XOF/EUR pivot, FX via fx_rate_snapshot, drill-down par site). Contract + matière drill-down absent. No site-comparison chart. No dedicated dashboard-group feature. |
| 2 | Coût direct par tonne par site × matière (7 composantes) mis à jour quotidiennement et comparé au budget annuel | PARTIAL | Schema + service + endpoint wired. 4 of 7 cost components hardcoded to 0n. Hardcoded XOF rates (800/L, 2500/h, 5000/rotation). No @Cron nightly fan-out — aggregation manual only. BudgetComparisonService reads analytical_entry (not cost_per_ton_snapshot) so the budget-loop closure is partial. |
| 3 | Marge par contrat / client / site en devise groupe avec FX figée référencée par ID immuable | PARTIAL | marginByContract + marginBySite implemented with bigint discipline. marginByCustomer missing entirely. FX conversion in MarginService not performed (currency label only). ConsolidationService converts but does not persist fx snapshot id. |
| 4 | Export Sage / Ciel / Odoo OHADA accepté par expert-comptable | PARTIAL | 3 adapters exist + endpoint + UI. analytical_entry source data near-empty: only 2 event handlers wired (bl_signed, work_order_closed with amount=0). Adapter format fidelity unvalidated against real accountant templates. |
| 5 | Moteur d'alertes notifie temps réel email/SMS/in-app par profil et par site | PARTIAL | 4 @OnEvent handlers wired (stockpile, spare-part, HSE incident, tir gap). in_app channel functional. email + SMS are logger.log() stubs. alert_rule has no site_id field — no site-scoped routing. No seeded default rules — dispatch is a silent no-op on a fresh tenant. |
| 6 | KPI Finance (coût/tonne, marge, conso carburant, coût maintenance) + HSE (incidents, TF, conformité audits) sur dashboard temps réel par profil | FAILED | DSH-03 absent: no marge / conso carburant / coût maintenance tiles anywhere. DSH-04 partial: TF + incidents present (from Phase 2) but no conformité audits. DSH-05 partial: ConsolidationComponent without site-comparison or drill-down. No dashboard-group persona. |

**Score:** 1/6 observable truths verified — 5 partial/failed. (Score "1/6" treats PARTIAL as not-verified at the truth level; the backend services exist but no observable user-facing outcome lands cleanly.)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/modules/analytics/analytics.module.ts` | AnalyticsModule wired in AppModule | VERIFIED | Imported at app.module.ts line 26 and present in imports array (line 88). |
| `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts` | FIN-01 service | VERIFIED (substantive) / PARTIAL (data) | 156 lines, real SQL queries, upsert into cost_per_ton_snapshot. 4 of 7 cost components hardcoded 0n. |
| `apps/api/src/modules/analytics/services/budget-comparison.service.ts` | FIN-03 service | VERIFIED | 77 lines, reads Budget + analytical_entry, day-of-year pro-rate, 5/15% thresholds. |
| `apps/api/src/modules/analytics/services/margin.service.ts` | FIN-02 service | PARTIAL | 118 lines, marginByContract + marginBySite. marginByCustomer absent. FX not converted. |
| `apps/api/src/modules/analytics/services/ohada-export.service.ts` | FIN-05 service | VERIFIED (substantive) / PARTIAL (fidelity) | 86 lines, 3 adapters. Source rows from analytical_entry which is barely populated. |
| `apps/api/src/modules/analytics/services/consolidation.service.ts` | FIN-06 service | PARTIAL | 122 lines, FX lookup, per-site rows. No fx_snapshot_id capture. No contract / matière drill-down. |
| `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts` | DSH-06 service | PARTIAL | 133 lines, 4 @OnEvent handlers, in_app channel functional. Email/SMS stubs. No site_id filter. |
| `apps/api/src/modules/analytics/entities/analytical-entry.entity.ts` | FIN-04 entity + writer | PARTIAL | Entity + table + unique-idempotency constraint exist. Writer handler covers only 2 event types; work_order writes amount=0 placeholder. |
| `apps/api/src/modules/analytics/entities/{cost-per-ton-snapshot,budget,alert-rule}.entity.ts` | 3 supporting entities | VERIFIED | All present (68/53/42 lines respectively). |
| `apps/api/src/modules/analytics/migrations/1718000000000__create_analytics_tables.sql` | 4 tables + RLS | VERIFIED | 83 lines, 4 tables, RLS policies on each, idempotency unique on analytical_entry. |
| `apps/api/src/modules/analytics/controllers/analytics.controller.ts` | REST controller | VERIFIED (existence) / PARTIAL (auth) | 6 endpoints wired to all 5 services. No @UseGuards / @Roles — relies on implicit AuthedRequest typing. SUMMARY claims controllers deferred but file exists. |
| `apps/web/src/app/features/finance/finance-shell.component.ts` | Web finance shell | VERIFIED | Tabs: consolidation / budget / ohada-export. Wired via FINANCE_ROUTES at app.routes.ts:116-121. |
| `apps/web/src/app/features/finance/pages/consolidation.component.ts` | FIN-06 UI | PARTIAL | 103 lines, KPI tiles + AG grid by site. No contract / matière drill-down, no site-comparison chart. |
| `apps/web/src/app/features/finance/pages/budget-comparison.component.ts` | FIN-03 UI | VERIFIED (existence) | 76 lines, AG grid. Calls /api/analytics/budget/comparison with hardcoded siteId='current' — site-picker not wired. |
| `apps/web/src/app/features/finance/pages/ohada-export.component.ts` | FIN-05 UI | VERIFIED (existence) | 98 lines, form + download. Hardcoded siteId='current' default — site-picker not wired. |
| `apps/web/src/app/features/finance/services/finance-api.service.ts` | Angular finance API client | VERIFIED | 73 lines, 5 endpoints typed (budgetVsActual, marginByContract, marginBySite, consolidate, ohadaExport). |
| `apps/web/src/app/features/dashboard-group/` | Direction Groupe persona dashboard | MISSING | Directory does not exist. No DSH-05 group-level dashboard. |
| DSH-03 finance KPI tiles on site dashboard | marge / coût maintenance / conso carburant aggregated tile | MISSING | site-director-dashboard.component.html has tonnage / TF / incidents / cost-per-ton-provisional (Phase 2). No new Phase 4 tiles. |
| `apps/api/src/modules/analytics/**/*.spec.ts` | Unit tests | MISSING | Zero .spec.ts files in the analytics module. No tests for any of 6 services. |
| Daily aggregation cron job | @Cron nightly fan-out | MISSING | No CostPerTonAggregationJob, no @Cron decorator anywhere in analytics. Manual trigger only. |
| i18n keys `finance.budget.title` / `finance.consolidation.title` / `finance.ohada.title` / `finance.ohada.target` | All 3 locales | MISSING | fr.json / en.json / ar.json each contain only 4 `finance.ohada.*` keys (download/site/from/to). Components reference titles + target via transloco that will resolve to the raw key string. |
| Seeded `alert_rule` rows | Default rules per tenant | MISSING | Migration creates the table but inserts nothing. dispatch() finds no rules on a fresh tenant. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AnalyticsModule` | `AppModule` | imports array | WIRED | app.module.ts line 26 + 88 |
| `AnalyticsController` | 5 services | constructor DI | WIRED | All 5 services injected and called |
| `FinanceApiService` | `/api/analytics/*` | HttpClient | WIRED | 5 endpoints match controller routes exactly |
| `FINANCE_ROUTES` | `app.routes.ts` | loadChildren | WIRED | Route `/finance` lazy-loads finance routes |
| `ConsolidationComponent` | `ConsolidationService` | GET /api/analytics/consolidation | WIRED | ngOnInit calls api.consolidate('XOF', from, to) |
| `BudgetComparisonComponent` | `BudgetComparisonService` | GET /api/analytics/budget/comparison | WIRED (data flow) / PARTIAL (real input) | Component sends siteId='current' literal — not a real site UUID, so the call will return [] in production |
| `OhadaExportComponent` | `OhadaExportService` | GET /api/analytics/ohada-export | WIRED (data flow) / PARTIAL (real input) | Same hardcoded siteId='current' default — accountant cannot pick the real site |
| `AlertDispatcherService` | 4 domain events | @OnEvent | WIRED | EventEmitter2 wildcard enabled in AppModule; 4 handlers registered |
| `AlertDispatcherService` | `alert` table | in_app channel INSERT | WIRED | Direct SQL into Phase 2 alert table |
| `AlertDispatcherService` | email / SMS providers | channel switch | NOT_WIRED | Both branches are logger.log() — no provider DI |
| `AnalyticalEntryWriterHandler` | extraction / transport / fuel / concassage / tir / hse domain events | @OnEvent | NOT_WIRED | Only `production.vte.bl_signed` and `maintenance.work_order.closed` are handled |
| `CostPerTonAggregatorService` | nightly cron | @Cron | NOT_WIRED | No cron job; aggregation only via POST endpoint |
| `Site-director dashboard` | FIN-01 cost_per_ton_snapshot | aggregator output → dashboard tile | NOT_WIRED | Dashboard shows Phase 2 cost-per-ton-provisional (carburant-only); the FIN-01 7-component output is never displayed |
| `MarginService` | `fx_rate_snapshot` | SQL lookup | NOT_WIRED | MarginService takes pivotCurrency param but never queries fx_rate_snapshot |
| `ConsolidationService` | fx snapshot id capture | persisted column | NOT_WIRED | Reads fx_rate_snapshot.rate but does not return/persist the snapshot row id |
| `AnalyticsController` | auth guards | @UseGuards | NOT_WIRED | No guard decorator; controller relies on AuthedRequest typing only |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|---------------------|--------|
| `ConsolidationComponent.pnl` | signal<ConsolidatedPnL> | GET /api/analytics/consolidation → ConsolidationService.consolidate() | Real SQL against bon_de_livraison + sale_contract + cost_per_ton_snapshot + fx_rate_snapshot | FLOWING (assuming upstream tables populated) |
| `BudgetComparisonComponent.rows` | signal<BudgetVsActual[]> | GET /api/analytics/budget/comparison → BudgetComparisonService.compareForSite() | Reads budget + analytical_entry. analytical_entry is largely empty (only 2 event sources). Budget seed not provided. | STATIC (empty in practice on a fresh DB) |
| `OhadaExportComponent` CSV download | csv string | GET /api/analytics/ohada-export → OhadaExportService.exportForPeriod() → analytical_entry SQL | Same as above — analytical_entry near-empty | STATIC (near-empty CSV on a fresh DB) |
| `CostPerTonSnapshot` row | total_cost_minor / cost_per_ton_minor | aggregateForDate() — 7 components, 4 hardcoded 0 | Real for carburant / main_oeuvre / transport (with placeholder rates); fake-zero for extraction / concassage / criblage / amortissement | HOLLOW (4 of 7 components zero) |
| `alert` table | rows inserted by AlertDispatcher | @OnEvent handlers → dispatch() → in_app INSERT | Insert is reachable but loop iterates 0 rules because alert_rule table has no seeded rows | DISCONNECTED (no rules seeded → no rows inserted) |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no running NestJS server / Postgres / Angular instance available. The following behaviors are verified statically:

| Behavior | Verification Method | Status |
|----------|---------------------|--------|
| AnalyticsModule loads at boot | AppModule.imports inspection | PASS |
| Controller `/analytics/*` routes registered | controller decorator + 5 method decorators | PASS |
| AlertDispatcher fires on stockpile_threshold | @OnEvent('production.stockpile.threshold_crossed') present | PASS (handler registered) / FAIL (no seeded rules → no alert row written) |
| OhadaExport returns CSV | adapter switch statement | PASS (returns formatted string) |
| Consolidation FX conversion | fx_rate_snapshot SELECT + multiplication | PASS (math correct) |
| Cost-per-ton aggregator integrates 7 components | SQL inspection | FAIL — 4 of 7 components hardcoded 0 |
| Daily aggregation runs automatically | @Cron grep across analytics | FAIL — no @Cron decorator in module |
| analytical_entry populated by domain events | @OnEvent inventory in writer handler | FAIL — only 2 event types wired |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| FIN-01 | 04-SUMMARY | Coût direct par tonne site × matière (7 composantes) | PARTIAL | Service + endpoint + schema present; 4 of 7 components 0n; no nightly cron; no dashboard tile |
| FIN-02 | 04-SUMMARY | Marge par contrat / client / site, devise groupe, FX figée | PARTIAL | marginByContract + marginBySite present; marginByCustomer missing; FX not applied in MarginService |
| FIN-03 | 04-SUMMARY | Budget annuel par site avec catégories, comparaison quotidienne | PARTIAL | BudgetComparisonService + UI present; depends on analytical_entry which is near-empty; no daily cron |
| FIN-04 | 04-SUMMARY | Comptabilité analytique par centre × activité × site, écritures exportables | PARTIAL | Schema + entity + 1 partial writer + unique-idempotency present; 5+ upstream modules don't emit |
| FIN-05 | 04-SUMMARY | Export Sage / Ciel / Odoo OHADA-conforme | PARTIAL | 3 adapters + UI present; source data near-empty; format fidelity unvalidated by expert-comptable (ROADMAP human prereq) |
| FIN-06 | 04-SUMMARY | Consolidation multi-pays P&L + marge en devise pivot | PARTIAL | Service + endpoint + UI present; no fx snapshot id; no contract / matière drill-down; no site-comparison chart |
| DSH-03 | 04-SUMMARY | KPI Finance: coût/tonne, marge, conso carburant, coût maintenance | BLOCKED | No tiles rendered on any dashboard for marge / conso carburant aggregate / coût maintenance |
| DSH-04 | 04-SUMMARY | KPI HSE: incidents, TF, conformité audits | PARTIAL | incidents + TF already on Phase 2 dashboard; conformité audits absent (HSE-05 deferred from Phase 2) |
| DSH-05 | 04-SUMMARY | Reporting consolidé groupe avec comparaison sites + drill-down | PARTIAL | ConsolidationComponent shows per-site rows; no comparison chart; no drill-down beyond site |
| DSH-06 | 04-SUMMARY | Moteur d'alertes email/SMS/in-app par profil et par site | PARTIAL | in_app functional; email/SMS stubs; no site_id on alert_rule; no seeded rules |

**Note on REQUIREMENTS.md status:** All 10 requirements remain `Pending` `[ ]` in REQUIREMENTS.md tracking table. This verification confirms that status is correct — no FIN-* or DSH-03..06 requirement is fully observable yet. Backend foundations are substantively built; the user-observable layer (dashboards + populated data + auth + cron + accountant-validated formats) is not closed.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts` | 78, 90, 55 | Hardcoded XOF rates (2500_00n /h, 5000_00n /rotation, 800 XOF /L) | Warning | Cost figures will be wrong by orders of magnitude until rate-config table lands; SUMMARY admits the deferral |
| `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts` | 93-96 | 4 cost components hardcoded `0n` (extraction, concassage, criblage, amortissement) | Warning | "Coût direct par tonne" returned today is fuel + main_oeuvre + transport only — not the 7-component number the goal requires |
| `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts` | 88-92 | work_order writer inserts `'0'` amount with comment "Amount=0 until labor rates are configured (Phase 6 FIN-07)" | Warning | Maintenance analytical entries carry zero financial weight; OHADA export will show zero maintenance cost |
| `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts` | 123-130 | email + sms channels are `logger.log()` only | Warning | DSH-06 truth ("email/SMS/in-app") is technically only 1/3 channel functional |
| `apps/api/src/modules/analytics/controllers/analytics.controller.ts` | 13 | `@Controller('analytics')` with no `@UseGuards` / `@Roles` | Warning | Endpoints take tenantId from req.user without enforcement that an auth guard populated req.user — depends on a global guard being configured elsewhere |
| `apps/web/src/app/features/finance/pages/budget-comparison.component.ts` | 70 | Hardcoded `siteId: 'current'` literal | Warning | Real budget query will return [] until a site-picker is wired |
| `apps/web/src/app/features/finance/pages/ohada-export.component.ts` | 74 | Hardcoded `siteId = 'current'` default | Warning | Same — accountant must edit raw URL or no data |
| `apps/web/src/app/features/finance/pages/*` | n/a | `finance.budget.title` / `finance.consolidation.title` / `finance.ohada.title` / `finance.ohada.target` keys not in any locale file | Warning | Page headers render the raw transloco key string instead of a translation |
| `apps/api/src/modules/analytics/**/*.spec.ts` | n/a | Zero unit tests | Info | 0% test coverage on 6 services + 1 handler + 1 controller; violates project 80% rule |

---

### Human Verification Required

#### 1. Sage 100 OHADA / Ciel / Odoo CI format fidelity

**Test:** Generate one export per target via OhadaExportComponent after seeding analytical_entry rows; hand the 3 files to the Gravel Ivoire expert-comptable.
**Expected:** Each file imports into the respective accounting software with zero manual edits.
**Why human:** Format expectations differ per accountant and per country setup; the ROADMAP explicitly flags this as a Phase 4 human prerequisite ("formats export fiscal OHADA par pays, spec FEC-equivalent — avec expert-comptable Gravel Ivoire"). Cannot be verified statically.

#### 2. End-to-end consolidation P&L with seeded data

**Test:** Seed budget + analytical_entry + cost_per_ton_snapshot + fx_rate_snapshot rows for 2 sites in different currencies (XOF + EUR). Open /finance/consolidation.
**Expected:** Consolidated P&L shows correctly converted figures in pivot currency with per-site breakdown.
**Why human:** Requires running stack and finance-domain validator; mathematical correctness needs human spot-check.

#### 3. Alert delivery after seeding alert_rule

**Test:** Insert one alert_rule row (event_type='production.stockpile.threshold_crossed', channels=['in_app']), trigger a stockpile threshold event, query alert table.
**Expected:** A new row in alert table with correct tenant/event/severity.
**Why human:** Requires running stack + an event source; cannot be triggered statically.

#### 4. Finance KPI tiles + group dashboard implementation acceptance (post-fix)

**Test:** After DSH-03/04/05 tiles + dashboard-group feature are added, verify the Direction Groupe persona sees 4 finance KPIs + 3 HSE KPIs in real time across multiple sites.
**Expected:** Tiles render with non-zero values, SSE updates push refreshed values, drill-down to a specific site works.
**Why human:** Visual + UX verification; cannot be verified statically.

---

### Gaps Summary

**Honest characterization of phase state:**

The phase landed a **backend foundation**: 4 entities, 1 migration with RLS, 6 services (cost-per-ton, budget, margin, consolidation, OHADA, alerts), 1 event handler, 1 REST controller with 6 endpoints, AnalyticsModule wired into AppModule. The 04-SUMMARY admission that "controllers + web dashboards deferred" is **incorrect on a literal reading** — a controller AND 3 web pages with a shell + route + API service AND a sidenav entry all exist. So the artifact surface is larger than the SUMMARY claims.

However, the **user-observable contract** of the phase (the 6 success criteria from ROADMAP) is mostly unmet:

1. **Data starvation:** The plumbing exists but the data inputs do not. analytical_entry is wired to only 2 of ~8 producing modules; cost_per_ton_aggregator computes only 3 of 7 components with placeholder rates; alert_rule has no seeded defaults; budget table has no seeded budgets. Run the system today and Consolidation shows zeros, OHADA export is an empty CSV, alerts never fire.

2. **No orchestration:** No @Cron drives the daily aggregation. The "se met à jour quotidiennement" clause of FIN-01 is structurally not satisfied.

3. **Dashboard gap (DSH-03/04/05):** The Phase 4 KPI Finance tiles (coût/tonne, marge, conso carburant, coût maintenance) do not appear on any dashboard. The Direction Groupe persona has no dedicated dashboard feature at all. The existing site-director dashboard still shows the Phase 2 cost-per-ton-provisional (carburant-only) tile, not the new FIN-01 7-component output.

4. **FX trace gap:** MarginService accepts a pivotCurrency parameter but does not actually convert via fx_rate_snapshot. ConsolidationService converts but does not persist the snapshot id — so the "FX figée référencée par ID immuable" audit-trail requirement is partial.

5. **Alert channel gap:** Only in_app is functional. Email + SMS providers are logger.log() stubs. alert_rule has no site_id column, so "par profil et par site" routing is structurally impossible without a migration.

6. **Test gap:** Zero `*.spec.ts` files exist in the analytics module. Project-wide 80% coverage rule violated.

7. **Tooling / UX hardcoding:** `siteId='current'` literals in BudgetComparisonComponent and OhadaExportComponent will return empty rows in any real deployment. Missing i18n keys mean page titles will render as raw transloco keys.

8. **Documentation discrepancy (non-blocking):** REQUIREMENTS.md correctly shows all 10 reqs Pending; the SUMMARY's `requirements_covered` frontmatter claim is aspirational rather than observed.

**Verdict:** Phase 4 has shipped roughly 50% of the backend mass needed for the goal, ~30% of the UI mass, and ~5% of the data/orchestration mass. It is a substantial foundation but is not the "Le plan analytique consolidé groupe est en place" that the ROADMAP goal commits to. Recommend a follow-up plan to close: (a) analytical_entry writers across remaining domain modules, (b) @Cron for daily aggregation, (c) DSH-03/04/05 dashboard tiles + dashboard-group feature, (d) FX snapshot id capture, (e) alert_rule.site_id migration + seed defaults, (f) test suite, (g) accountant workshop to validate OHADA export adapters.

---

_Verified: 2026-05-16T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
