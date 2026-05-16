# Phase 07: Finance Real - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning
**Source:** v1.0 audit gaps + v1.1 requirements definition

<domain>
## Phase Boundary

Phase 07 makes the Finance module user-facing and real-data-producing.
Phase 4 (v1.0) delivered backend services but with 4/7 cost components hardcoded to `0n`,
no @Cron for daily aggregation, no seeded alert_rules, no Finance KPI tiles on dashboards,
and email/SMS stubs.

This phase wires the remaining cost writers via DI, adds the @Cron job,
seeds alert_rules, and renders DSH-03/04/05/06 tiles.

</domain>

<decisions>
## Implementation Decisions

### Cost Component Writers (FIN-R01)
- ExtractionModule must write analytical_entry with cost_center='extraction' after each cycle
- TransportModule must write analytical_entry with cost_center='transport' after each rotation
- ConcassageModule must write analytical_entry with cost_center='concassage' after each crusher session
- CriblageModule (ScreeningSession) must write analytical_entry with cost_center='criblage' after each session
- Each writer uses DI (inject AnalyticsModule service) — NOT raw SQL in the business module
- Writers emit after commit (non-blocking, idempotent via UNIQUE constraint on analytical_entry)

### Daily Aggregation Cron (FIN-R02)
- New `CostPerTonAggregatorJob` with @Cron('0 4 * * *') in AnalyticsModule
- Calls existing `CostPerTonAggregatorService.aggregateForDate()` for yesterday
- Must be tenant-scoped (iterate all active tenants)
- Must be idempotent (re-run same date = no duplicate entries, UPSERT)

### Dashboard Tiles (FIN-R03, FIN-R04, FIN-R05)
- DSH-03: KPI Finance tiles on site-director-dashboard (cout/tonne, marge, conso carburant, cout MNT)
- DSH-04: KPI HSE tiles (incidents count, TF, conformite audits %) — already partially wired, verify
- DSH-05: Dashboard groupe consolidation (new Angular page under /dashboard/group)
- DSH-06: Already done (AlertDispatcherService) — just needs alert_rules seeded

### Alert Rules Seed (FIN-R06)
- Migration that seeds at least 5 default alert_rules:
  1. stockpile_threshold_crossed (all stockpiles)
  2. spare_part_threshold_crossed (all spare part items)
  3. hse_incident_severity_gte_4 (any incident severity >= 4)
  4. explosives_reconciliation_gap (any explosives gap)
  5. fuel_anomaly_detected (any fuel anomaly)
- Each rule defines: event_type, severity, recipient_role(s), channel(s)

### Claude's Discretion
- File organization within the module
- Exact SQL for analytical_entry writers (must match existing schema)
- Angular component structure for DSH-05 (follow existing dashboard patterns)
- Whether to use EventEmitter2 @OnEvent or direct service call for writers

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Finance Backend (existing Phase 4 code)
- `apps/api/src/modules/analytics/` — AnalyticsModule, CostPerTonAggregatorService, MarginService, BudgetComparisonService, OhadaExportService, ConsolidationService
- `.planning/phases/04-analytics-consolidation-finance/04-SUMMARY.md` — what was built, what was deferred
- `.planning/phases/04-analytics-consolidation-finance/04-VERIFICATION.md` — verified gaps

### Dashboard (existing)
- `apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts` — SiteDirectorDashboard interface (already has downtime_today_minutes)
- `apps/web/src/app/features/dashboard-site/` — Angular dashboard pages and widgets

### Modules that need cost writers
- `apps/api/src/modules/extraction/extraction.module.ts`
- `apps/api/src/modules/transport/transport.module.ts`
- `apps/api/src/modules/concassage/concassage.module.ts`

### Alert system
- `apps/api/src/modules/alerts/` — AlertsModule, AlertDispatcherService, event handlers
- `apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts` — alert dispatch wiring

</canonical_refs>

<specifics>
## Specific Ideas

- analytical_entry schema: `(tenant_id, source_table, source_id, cost_center, activity, site_id, date, amount_minor, currency, UNIQUE(tenant_id, source_table, source_id, cost_center))` — already exists
- CostPerTonAggregatorService already has the aggregation logic — just needs a @Cron caller
- For DSH-05 group consolidation: ConsolidationService.consolidate() already returns per-site breakdown
- For alert_rules: create a TypeORM migration with INSERT statements (not a seed script)

</specifics>

<deferred>
## Deferred Ideas

- FND-07 money 3-representation (v1.2)
- Group-level dashboard with cross-country FX (partially in scope via DSH-05, but limited to single-currency pivot for v1.1)
- Advanced budgeting (variance analysis, re-forecasting) — v1.2

</deferred>

---

*Phase: 07-finance-real*
*Context gathered: 2026-05-16 via direct analysis of v1.0 audit gaps*
