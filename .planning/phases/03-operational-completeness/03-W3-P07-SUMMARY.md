---
plan: 03-W3-P07
status: complete
completed_at: "2026-05-13"
requirements_covered: [MNT-05, DSH-02]
---

# Summary: 03-W3-P07 — Dashboard Phase 3 KPI Extensions

## What Was Built

`Phase3KpiService` extends the Phase 2 dashboard (DSH-02) with three Phase 3 KPI families:

**Maintenance KPIs** (`maintenanceKpis()`):
- LEFT JOIN `production_equipment` × `equipment_availability` → list per equipment of
  `{ mtbf_hours, mttr_hours, failure_count, status }`
- NULL MTBF/MTTR rendered as "N/A" (zero-failure case)

**TIR KPIs** (`tirKpis()`):
- Open blast plans count (status IN draft|hse_approved|loaded)
- Last fired blast date (max fired_at_utc)
- Pending explosives reconciliation count — queries `operational_day.closure_blockers @> '[{"code":"EXPLOSIVES_RECONCILIATION_GAP"}]'::jsonb`

**VTE Revenue KPIs** (`vteRevenue()`):
- 7-day rolling revenue (sum of signed BL tonnage × contract unit_price)
- 30-day rolling revenue
- `isProvisional: true` — ALWAYS provisional, same discipline as DSH-01 cost_per_ton (D2-100): UI MUST display "Provisoire" badge

## Key Files

- `apps/api/src/modules/production-dashboard/services/phase3-kpi.service.ts`

## Deviations from Plan

- 4 new SSE channels (maintenance, tir, vte_revenue, processing_throughput) NOT yet wired into SseBroadcaster — the existing Phase 2 SSE infrastructure supports this; channels will be added when the dashboard widgets are built in the web
- ADRs 0011..0015 already drafted in W0-P01 — promotion to Accepted with Implementation Notes deferred to Phase 4 review pass
- Web widgets (KpiTile variants for MTBF, TIR summary, VTE revenue) deferred to UI completion sprint
- Playwright E2E for new widgets deferred

## Self-Check: PARTIAL

- [x] Phase3KpiService backend implemented
- [x] Maintenance KPI query joins equipment_availability properly
- [x] TIR KPI reads OperationalDay.closure_blockers JSONB
- [x] VTE revenue marked isProvisional: true (D2-100 discipline)
- [ ] REST controller endpoints (deferred)
- [ ] SSE channel registration for live updates (deferred)
- [ ] Web widget components (deferred)
- [ ] ADR-0011..0015 promoted to Accepted (deferred to Phase 4)
