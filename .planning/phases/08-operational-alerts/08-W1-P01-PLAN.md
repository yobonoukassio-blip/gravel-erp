---
phase: 08-operational-alerts
plan: 08-W1-P01
title: "Preventive Maintenance Scheduler + Spare Part Alert Handler"
wave: 1
requirements_covered: [ALT-01, ALT-02]
depends_on: []
tasks:
  - id: ALT-01-T01
    title: "PreventiveMaintenanceSchedulerJob @Cron"
    files_modify: ["apps/api/src/modules/maintenance/"]
    test: "Job opens WorkOrder when interval exceeded"
  - id: ALT-02-T01
    title: "Spare part threshold alert handler"
    files_modify: ["apps/api/src/modules/maintenance/", "apps/api/src/modules/alerts/"]
    test: "Stock below threshold emits alert"
---

# Plan: Preventive Maintenance Scheduler + Spare Part Alert Handler

**Phase:** 08-operational-alerts
**Goal:** Les alertes maintenance se declenchent automatiquement.
**Requirements:** ALT-01, ALT-02

## Task 1: PreventiveMaintenanceSchedulerJob (ALT-01)

**What:** Create a @Cron job that checks all equipment PM intervals daily and opens a WorkOrder when due.

**Files to create/modify:**
- `apps/api/src/modules/maintenance/jobs/preventive-maintenance-scheduler.job.ts` (NEW)
- `apps/api/src/modules/maintenance/maintenance.module.ts` (add provider)

**Implementation:**
1. Create `PreventiveMaintenanceSchedulerJob` with `@Cron('0 5 * * *')` (05:00 UTC daily)
2. Query all `preventive_maintenance_plan` entries where:
   - `next_due_date <= NOW()` (calendar-based), OR
   - `next_due_hours <= equipment.current_hours` (hour-based), OR
   - `next_due_km <= equipment.current_km` (km-based)
3. For each due PM plan, call `WorkOrderService.open()` with:
   - `type: 'preventive'`
   - `source_pm_plan_id: plan.id`
   - `equipment_id: plan.equipment_id`
   - `description: plan.task_description`
4. Idempotency: skip if WorkOrder already exists for this PM plan in current interval (check `source_pm_plan_id + due window`)
5. Emit `maintenance.pm.work_order_opened` event

**Test criteria:**
- Unit test: mock PM plans with exceeded intervals -> job creates WorkOrders
- Unit test: already-existing WorkOrder for same PM interval -> job skips (idempotent)
- Unit test: different interval types (hours, km, calendar) all work

## Task 2: Spare Part Threshold Alert Handler (ALT-02)

**What:** Create event handler that listens to spare part stock changes and emits alert when below threshold.

**Files to create/modify:**
- `apps/api/src/modules/maintenance/event-handlers/spare-part-threshold.handler.ts` (NEW)
- `apps/api/src/modules/maintenance/maintenance.module.ts` (add provider)

**Implementation:**
1. Create `SparePartThresholdHandler` with `@OnEvent('maintenance.spare_part.stock_changed')`
2. On event, query `spare_part` table for current balance and threshold
3. If `current_stock <= min_threshold`:
   - Emit `maintenance.spare_part.threshold_crossed` via EventEmitter2
   - This event is already handled by `AlertsEventHandlers` (verify wiring, add if missing)
4. Edge-triggered: only fire when crossing DOWN through threshold (not on every stock change when already below)

**Test criteria:**
- Unit test: stock drops below threshold -> alert emitted
- Unit test: stock already below threshold, stays below -> no duplicate alert (edge-triggered)
- Unit test: stock rises above then drops below again -> alert fires again

## Verification

After both tasks, verify:
- `MaintenanceModule` providers array includes both new classes
- No circular dependencies introduced
- Events match the patterns in `AlertsEventHandlers`
