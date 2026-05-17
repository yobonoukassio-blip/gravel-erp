# Milestones

## v1.1 Polish & Gaps (Shipped: 2026-05-17)

**Phases completed:** 3 phases, 6 plans, 67 commits since v1.0 close

**Goal:** Close v1.0 audit gaps that prevented dashboards from showing real
numbers and the alert engine from notifying anyone. Closed the loop:
cost → aggregator → dashboard → alert → notification.

**Key accomplishments:**

- **Phase 7 — Finance Real:** 7/7 cost components contributing (no more `0n`),
  `CostPerTonAggregatorJob` daily @ 04:00 UTC, DSH-05 group P&L with drill-down,
  DSH-04 HSE tiles, 5+ `alert_rule` rows seeded.
- **Phase 8 — Operational Alerts Closure:** Equipment meter denormalization,
  `PreventiveMaintenanceSchedulerJob` @Cron hourly with tenant fan-out + 3
  interval paths (hours/km/days), `WorkOrderService.close()` advances PM plan
  state (D-04), HSE-04 gate blocks WO closure without valid FORMATION_HSE,
  spare-part threshold with dedupe + recovery event, 31 tests.
- **Phase 9 — Notification Delivery:** `NotificationModule` with BullMQ
  (exponential retry 5 × 30s base + dead-letter), Brevo email provider,
  Twilio SMS with per-recipient rate limit (3/h Redis sliding window),
  in-app `Notification` entity + controller + Angular header badge with
  optimistic mark-as-read, 8 env vars documented.
- **Outside-scope shipped:** Local /auth/login HS256 path (FND-01 demo)
  coexisting with Keycloak RS256, TIR-03 blast_plan canonical migration,
  HSE-03 EPI module + Tir mobile list.

**Test gate at close:** 239/239 unit tests passing across 32 suites.
Production + full + Angular TypeScript all clean.

**Full archive:** [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

---

## v1.0 MVP (Shipped: 2026-05-16)

**Phases completed:** 5 phases, 21 plans, 26 tasks

**Key accomplishments:**

- 1. [Rule 3 — Blocking issue] Missing `data "aws_availability_zones"` provider hint in EKS module
- 1. [Rule 3 — Blocking] gravel_owner needed audit grants under SECURITY DEFINER
- 1. [Rule 2 — Missing critical functionality] `AppDatabase.fromExecutor` constructor
- 1. [Rule 3 — Blocking] `tsx` runtime missing for codegen script
- 1. [Rule 2 — Missing critical functionality] Server-side guards must be DI providers
- 1. [Rule 3 — Blocking issue] Added OTLP HTTP exporter packages to `apps/api/package.json` and `apps/web/package.json`
- 1. [Rule 2 — Required functionality] Removed `ag-grid-enterprise` from apps/web/package.json
- 1. [Rule 3 — Blocking issue] Tests path mismatch
- 1. [Rule 3 — Blocking issue] Web feature files committed by parallel lint pass
- WeighingTicket with offline-generated ticket numbers + SHA-256 content-hash verification, TruckRotation with same-tx outbox dispatch to stockpile, manual dispatch board (TRP-03), and dual-signature mobile capture for Tab Active 3 field tablets.
- Event-sourced inventory ledger with monthly RANGE partitioning, SHA-256 chain-of-hash, materialized balance projection with weighted-average cost-per-ton (cost_model_version=1), edge-triggered threshold alerts, and idempotent outbox materialization from `production.transport.rotation_completed`. Five backend services, six unit specs, four web components, one ADR promoted Accepted.
- CAR-01 — Event-sourced fuel tank ledger with chain-of-hash:
- Two real-time persona dashboards (Directeur Site, Chef Carrière) backed by an in-memory SSE broadcaster with Last-Event-ID replay, six domain event subscribers, a fuel-only `cost_per_ton_provisional` service with a hard "Provisoire" UI guardrail (D2-100), an AG Grid alerts inbox with SSE-driven badge in the app shell header, a Leaflet site map, and a Playwright e2e proving end-to-end live update within 10s. ADR-0010 promoted to Accepted with full Implementation Notes.
- Employee entity (unified model):
- explosives_event (partitioned append-only):
- CrusherSession table:
- MNT-01
- VTE-01
- InvoiceService.generateForBLs()
- FIN-01 — Cost-per-ton aggregator:
- IOT-01 — Edge ingestion + bulk backfill:

---
