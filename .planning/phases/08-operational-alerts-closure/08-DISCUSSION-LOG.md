# Phase 8: Operational Alerts Closure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16
**Phase:** 08-operational-alerts-closure
**Areas discussed:** Cron schedule + idempotency, Equipment meter source, Spare part threshold trigger, Severity + recipients
**Mode:** User delegated all decisions ("prends la meilleure décision") — Claude chose recommended option for each area with documented rationale.

---

## Cron Schedule + Idempotency

| Option | Description | Selected |
|--------|-------------|----------|
| Daily 05:00 UTC (`0 5 * * *`) | Light load, but hour-based PMs can be overdue up to 23h before detection | |
| **Hourly (`0 * * * *`)** | **24 runs/day, negligible cost — catches intra-day threshold crossings within ~60min** | ✓ |
| Every 15 min | Overkill for PM intervals expressed in 250h+ values | |

**Idempotency strategy chosen:** `WorkOrderService.findOpen({ equipmentId, type: 'preventive', pmPlanId })` before opening a new WO — if found, skip.

**Tenant scoping:** Single global cron iterating over `SELECT DISTINCT tenant_id FROM preventive_maintenance_plan WHERE is_active = true`, each tenant runs in its own CLS context.

**Rationale:** Defensive defaults. The cost of an extra cron run is 23 negligible queries; the cost of an engin running 23h overdue is broken equipment + safety incident.

---

## Equipment Meter Source

| Option | Description | Selected |
|--------|-------------|----------|
| JOIN/MAX query at cron time | `SELECT MAX(equipment_hour_meter_reading) FROM equipment_refuel WHERE equipment_id = ?` per equipment per run | |
| **Denormalized columns on `production_equipment`** | **`current_hours_meter` + `current_km_meter` updated by event handlers** | ✓ |
| jsonb `specs.current_hours` | Already exists ad-hoc, but jsonb path queries in hot loop are slow | |

**Update strategy chosen:** Event-driven `MeterUpdateHandler`:
- `EquipmentRefuelCreated` → `updateHoursIfHigher()` (IF HIGHER guard against regressions)
- `TruckRotationCompleted` → `updateKmIfHigher()`

**Migration:** Add columns + backfill from `MAX(equipment_refuel.equipment_hour_meter_reading)`.

**Rationale:** Cron hot loop should be O(N_equipment) reads, not O(N_equipment × N_refuels). Denormalization is cheap and clearly justified here.

---

## Spare Part Threshold Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Polling (cron scans all spare_parts) | Adds a 2nd cron, redundant with consumption events | |
| **Event-driven** | **`SparePartService.applyConsumption()` flips `below_threshold` flag + emits event on transition** | ✓ |
| Hybrid (event + nightly reconciliation) | Adds complexity, not justified at v1.1 scale | |

**Events emitted:**
- `maintenance.spare_part.threshold_crossed` (on flip false → true)
- `maintenance.spare_part.threshold_recovered` (on flip true → false, when restock)

**Source of truth:** `below_threshold` boolean column on `spare_part` (single source). No double-source with computed field.

**Alert dedupe:** Reuse `Alert.dedupe_key = "spare_part:<id>:below_threshold"` — if open alert exists for this key, no second one created. On recovery event, existing open alert → `status='resolved'`.

**WorkOrder auto-creation for stockout:** NO — ALT-02 says "alerte visible dans l'inbox", nothing about WO. Re-stock is human action.

**Rationale:** Matches existing `AlertsEventHandlers` pattern 1:1 (stockpile.threshold_crossed → Alert with dedupe). Reuse > reinvent.

---

## Severity + Recipients

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded role lists in service code | Brittle, requires code change per role tweak | |
| **`alert_rule.role_codes` seeded via migration** | **Config in DB, role-based (not user_ids)** | ✓ |
| `alert_rule` with `user_ids` arrays | Breaks on RH changes (departures, transfers) | |
| UI-configurable alert_rule | Deferred to v2 | |

**Severity mapping for PM overdue:**
- Default: `warning`
- Overdue > 7 days OR > 25% past interval → `critical` (computed at WO creation, frozen)

**Severity mapping for spare part:**
- `current_stock > 0` below threshold → `warning`
- `current_stock = 0` (stockout) → `critical`

**Seeded alert_rules (4 minimum):**

| event_type | severity_filter | channels | role_codes |
|---|---|---|---|
| maintenance.work_order.preventive_opened | (any) | in_app, email | MAINTENANCE_MANAGER, MECANICIEN_CHEF, DIRECTEUR_SITE |
| maintenance.work_order.preventive_opened | critical | in_app, email, sms | DIRECTEUR_SITE, DIRECTION_GROUPE |
| maintenance.spare_part.threshold_crossed | (any) | in_app, email | MAINTENANCE_MANAGER, GESTIONNAIRE_STOCK, DIRECTEUR_SITE |
| maintenance.spare_part.threshold_crossed | critical | in_app, email, sms | DIRECTEUR_SITE |

**Note on SMS channel:** Listed in `critical` rules but the actual Twilio/Vonage integration ships in Phase 9 (NTF-02). Phase 8 emits the alert; Phase 9 delivers it.

**Rationale:** `role_codes` survives RH movements. Seeded rules give us deterministic defaults; UI mutation deferred to v2 where Direction Groupe can self-serve.

---

## Claude's Discretion

- File naming: `PreventiveMaintenanceSchedulerJob`, `SparePartConsumptionHandler`, `MeterUpdateHandler` (or whatever the planner finds idiomatic).
- Module split between `maintenance/jobs/` and `maintenance/event-handlers/` directories.
- Exact log format for cron decision lines.
- Test framework choices (Jest mocks vs in-memory DB).

## Deferred Ideas

(All listed in CONTEXT.md `<deferred>` — duplicated here for audit completeness)

- Real email/SMS delivery (Phase 9)
- Alert escalation re-emit (v2)
- UI config of alert_rule (v2)
- `is_critical` flag on spare_part (v2)
- Predictive maintenance ML (v2)
- Webhooks externes (Slack/Teams) (v2)
