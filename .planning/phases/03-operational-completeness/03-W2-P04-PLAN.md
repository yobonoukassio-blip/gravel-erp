---
phase: 03-operational-completeness
plan: W2-P04
type: execute
wave: 2
autonomous: true
depends_on: [03-W0-P01, 03-W1-P02, 03-W1-P03]
files_modified:
  - apps/api/src/modules/maintenance/maintenance.module.ts
  - apps/api/src/modules/maintenance/entities/preventive-maintenance-plan.entity.ts
  - apps/api/src/modules/maintenance/entities/work-order.entity.ts
  - apps/api/src/modules/maintenance/entities/spare-part.entity.ts
  - apps/api/src/modules/maintenance/entities/spare-part-movement.entity.ts
  - apps/api/src/modules/maintenance/entities/spare-part-consumption.entity.ts
  - apps/api/src/modules/maintenance/entities/equipment-availability.entity.ts
  - apps/api/src/modules/maintenance/services/work-order.service.ts
  - apps/api/src/modules/maintenance/services/pm-scheduler.service.ts
  - apps/api/src/modules/maintenance/services/spare-part.service.ts
  - apps/api/src/modules/maintenance/services/spare-part-threshold.service.ts
  - apps/api/src/modules/maintenance/services/mtbf-calculator.service.ts
  - apps/api/src/modules/maintenance/jobs/preventive-maintenance-due.job.ts
  - apps/api/src/modules/maintenance/controllers/work-order.controller.ts
  - apps/api/src/modules/maintenance/controllers/preventive-maintenance-plan.controller.ts
  - apps/api/src/modules/maintenance/controllers/spare-part.controller.ts
  - apps/api/src/modules/maintenance/migrations/1717300000000__extend_production_equipment_mnt.sql
  - apps/api/src/modules/maintenance/migrations/1717300100000__create_preventive_maintenance_plan.sql
  - apps/api/src/modules/maintenance/migrations/1717300200000__create_work_order.sql
  - apps/api/src/modules/maintenance/migrations/1717300300000__create_spare_part.sql
  - apps/api/src/modules/maintenance/migrations/1717300400000__create_equipment_availability.sql
  - apps/api/src/modules/maintenance/tests/work-order.spec.ts
  - apps/api/src/modules/maintenance/tests/preventive-maintenance.spec.ts
  - apps/api/src/modules/maintenance/tests/spare-part-threshold.spec.ts
  - apps/api/src/modules/maintenance/tests/mtbf-calculator.spec.ts
  - apps/web/src/app/features/maintenance/maintenance.module.ts
  - apps/web/src/app/features/maintenance/maintenance-routes.ts
  - apps/web/src/app/features/maintenance/pages/work-order-list.component.ts
  - apps/web/src/app/features/maintenance/pages/work-order-form.component.ts
  - apps/web/src/app/features/maintenance/pages/pm-plan-list.component.ts
  - apps/web/src/app/features/maintenance/pages/spare-part-stock.component.ts
  - apps/web/src/app/features/maintenance/pages/equipment-availability.component.ts
  - apps/web/src/app/features/maintenance/services/maintenance-api.service.ts
  - apps/mobile/lib/features/maintenance/repositories/work_order_entry_repository.dart
  - apps/mobile/lib/features/maintenance/screens/work_order_form.dart
  - apps/mobile/integration_test/work_order_offline_test.dart
  - apps/api/src/modules/alerts/alerts.event-handlers.ts
  - apps/api/src/app.module.ts
  - apps/web/src/app/app.routes.ts
task_count: 4
requirements: [MNT-01, MNT-02, MNT-03, MNT-04, MNT-05]

must_haves:
  truths:
    - "Opening a work order transitions production_equipment.status to MAINTENANCE, blocking further plan assignments"
    - "Closing a work order transitions equipment status to ACTIVE (or OUT_OF_SERVICE if flagged) and refreshes MTBFCalculatorService materialized projection"
    - "spare_parts_stock.quantity_on_hand never goes negative — SparePartService.consume() uses SELECT FOR UPDATE"
    - "SparePartThresholdService emits maintenance.spare_part.threshold_crossed when stock crosses threshold"
    - "MTBF = total_uptime_hours / number_of_failures; MTTR = total_repair_time_hours / number_of_repairs over rolling 12 months"
    - "PreventiveMaintenanceDueJob generates work orders and emits maintenance.pm_due alert when next_due_at <= tomorrow"
    - "WorkOrderService.assign() calls RhHabilitationService.isValidAt for mobile equipment"
  artifacts:
    - path: "apps/api/src/modules/maintenance/services/mtbf-calculator.service.ts"
      provides: "MTBF/MTTR computation from work_order downtime_minutes rolling 12 months"
      exports: ["MTBFCalculatorService"]
    - path: "apps/api/src/modules/maintenance/services/work-order.service.ts"
      provides: "WorkOrderService.open() sets MAINTENANCE, close() sets ACTIVE"
      exports: ["WorkOrderService"]
    - path: "apps/api/src/modules/maintenance/entities/equipment-availability.entity.ts"
      provides: "Materialized availability projection refreshed on WorkOrderService.close()"
  key_links:
    - from: "apps/api/src/modules/maintenance/services/work-order.service.ts"
      to: "apps/api/src/modules/master-data/production-equipment.service.ts"
      via: "productionEquipmentService.setStatus(equipmentId, 'MAINTENANCE')"
    - from: "apps/api/src/modules/maintenance/services/spare-part.service.ts"
      to: "apps/api/src/modules/maintenance/services/spare-part-threshold.service.ts"
      via: "checkCrossing() after quantity_on_hand update commits"
    - from: "apps/api/src/modules/maintenance/services/work-order.service.ts"
      to: "apps/api/src/modules/rh/services/rh-habilitation.service.ts"
      via: "isValidAt(technicianId, 'CONDUCTEUR_ENGIN', operationalDay.shiftStartLocal) when equipment is mobile"
---

# Plan: 03-W2-P04 — Maintenance Équipements (MNT-01..MNT-05)

## Objective

Implement the full maintenance lifecycle: extend `production_equipment` with hour/odometer counters (MNT-01), preventive maintenance plans with interval-based scheduling (MNT-02), corrective work orders consuming spare parts with SELECT FOR UPDATE stock safety (MNT-03), spare parts stock threshold alerts using the same edge-triggered pattern as stockpile thresholds (MNT-04), and MTBF/MTTR materialized projection refreshed on work order close (MNT-05). Mobile work order capture for offline diagnosis entry.

**Purpose:** Close the maintenance loop — equipment downtime is captured and feeds into availability KPIs, spare parts are tracked, and PM plans prevent reactive-only maintenance.
**Output:** Extended `production_equipment` table, 4 new tables, 5 backend services, 1 BullMQ cron job, web maintenance dashboard, mobile work order form.

## Context

**From Phase 2 W0-P01:**
```typescript
// apps/api/src/modules/master-data/production-equipment.service.ts
export class ProductionEquipmentService {
  async assertActive(id: string, tenantId: string): Promise<void>   // throws if not ACTIVE
  async setStatus(id: string, status: EquipmentStatus): Promise<void>  // ACTIVE | MAINTENANCE | OUT_OF_SERVICE
}
// Phase 2 added: ACTIVE, MAINTENANCE, OUT_OF_SERVICE statuses
// Phase 3 extends: production_equipment table gets hour_meter_current, odometer_km_current, spec_jsonb, commissioned_date
```

**From 03-W0-P01:**
```typescript
// apps/api/src/modules/rh/services/rh-habilitation.service.ts
export class RhHabilitationService {
  async isValidAt(employeeId: string, certCode: string, asOfDate: Date): Promise<boolean>
}
// Cert code 'CONDUCTEUR_ENGIN' required for mobile equipment assignment (MNT-03)
```

**From Phase 2 W2-P05 (Stockpile — threshold pattern):**
```typescript
// StockpileThresholdService pattern — edge-triggered, no alert spam
// Apply same pattern to spare_part threshold crossing
// Emit 'maintenance.spare_part.threshold_crossed' (not 'production.stockpile.threshold_crossed')
```

**From Phase 2 W0-P01 (AppendOnlyRepository):**
```dart
// apps/mobile/lib/core/sync/append_only_repository.dart
abstract class AppendOnlyRepository<T> { ... }
// Use for WorkOrderEntry (offline diagnosis capture)
```

## Tasks

### Task 1 — Equipment extension + PM plans + work orders (MNT-01, MNT-02, MNT-03)

**Files:**
- `apps/api/src/modules/maintenance/entities/preventive-maintenance-plan.entity.ts`
- `apps/api/src/modules/maintenance/entities/work-order.entity.ts`
- `apps/api/src/modules/maintenance/services/work-order.service.ts`
- `apps/api/src/modules/maintenance/services/pm-scheduler.service.ts`
- `apps/api/src/modules/maintenance/jobs/preventive-maintenance-due.job.ts`
- `apps/api/src/modules/maintenance/controllers/work-order.controller.ts`
- `apps/api/src/modules/maintenance/controllers/preventive-maintenance-plan.controller.ts`
- `apps/api/src/modules/maintenance/maintenance.module.ts`
- `apps/api/src/modules/maintenance/migrations/1717300000000__extend_production_equipment_mnt.sql`
- `apps/api/src/modules/maintenance/migrations/1717300100000__create_preventive_maintenance_plan.sql`
- `apps/api/src/modules/maintenance/migrations/1717300200000__create_work_order.sql`
- `apps/api/src/modules/maintenance/tests/work-order.spec.ts`
- `apps/api/src/modules/maintenance/tests/preventive-maintenance.spec.ts`

**Action:**

**Migration 1717300000000 — extend production_equipment:**
```sql
ALTER TABLE production_equipment
  ADD COLUMN IF NOT EXISTS hour_meter_current   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS odometer_km_current  NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS spec_jsonb           JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS commissioned_date    DATE NULL;
```

`preventive_maintenance_plan`:
```sql
CREATE TABLE preventive_maintenance_plan (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  equipment_id         UUID NOT NULL REFERENCES production_equipment(id),
  description          VARCHAR(300) NOT NULL,
  interval_hours       INT NULL,
  interval_km          INT NULL,
  interval_days        INT NULL,
  last_executed_at_utc TIMESTAMPTZ NULL,
  last_executed_hour_meter NUMERIC(10,2) NULL,
  next_due_at_utc      TIMESTAMPTZ NULL,   -- computed by PmSchedulerService, stored for job query
  is_active            BOOL NOT NULL DEFAULT true,
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_plan_at_least_one_interval
    CHECK (interval_hours IS NOT NULL OR interval_km IS NOT NULL OR interval_days IS NOT NULL)
);
```

`work_order`:
```sql
CREATE TYPE work_order_type AS ENUM ('PREVENTIVE','CORRECTIVE');
CREATE TYPE work_order_status AS ENUM ('OPEN','IN_PROGRESS','AWAITING_PARTS','CLOSED');

CREATE TABLE work_order (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  site_id              UUID NOT NULL,
  operational_day_id   UUID NOT NULL,
  wo_type              work_order_type NOT NULL,
  equipment_id         UUID NOT NULL REFERENCES production_equipment(id),
  pm_plan_id           UUID NULL REFERENCES preventive_maintenance_plan(id),
  status               work_order_status NOT NULL DEFAULT 'OPEN',
  assigned_technician_id UUID NULL,
  start_at_utc         TIMESTAMPTZ NULL,
  end_at_utc           TIMESTAMPTZ NULL,
  downtime_minutes     INT NULL,
  labor_hours          NUMERIC(6,2) NULL,
  diagnosis_md         TEXT,
  is_equipment_condemned BOOL NOT NULL DEFAULT false,
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`WorkOrderService`:

`open(dto, manager?)`:
1. Fetches equipment, calls `productionEquipmentService.setStatus(equipmentId, 'MAINTENANCE')`
2. Creates `work_order` row with `status = OPEN`
3. Publishes `maintenance.work_order.opened` via EventEmitter2 (non-outbox, in-process only)

`assign(workOrderId, technicianId, operationalDayId)`:
- If `equipment.type` is mobile (drill, truck, excavator): calls `rhHabilitationService.isValidAt(technicianId, 'CONDUCTEUR_ENGIN', operationalDay.shiftStartLocal)` — throws `ERR_HABILITATION_EXPIRED (403)` if false
- Static equipment (crusher, generator): no cert check
- Sets `assigned_technician_id`, `status = IN_PROGRESS`, `start_at_utc = now()`

`close(workOrderId, closeDto)`:
1. Sets `end_at_utc`, `downtime_minutes`, `labor_hours`, `diagnosis_md`, `status = CLOSED`
2. If `closeDto.is_equipment_condemned = true`: calls `productionEquipmentService.setStatus(equipmentId, 'OUT_OF_SERVICE')`
3. Else: calls `productionEquipmentService.setStatus(equipmentId, 'ACTIVE')`
4. Updates `preventive_maintenance_plan.last_executed_at_utc` if `wo_type = PREVENTIVE`
5. Calls `pmSchedulerService.computeNextDue(pmPlanId)` to update `next_due_at_utc`
6. Calls `mtbfCalculatorService.refreshForEquipment(equipmentId, tenantId)` (non-blocking — catch and log any errors)

`PmSchedulerService.computeNextDue(planId)`:
```typescript
// Takes whichever interval comes soonest:
// Hours-based: next_due when hour_meter_current >= last_hour_meter + interval_hours
// Calendar: last_executed_at_utc + interval_days
// Both: min of above
```

`PreventiveMaintenanceDueJob` — `@Cron('0 6 * * *')` UTC daily:
```typescript
const plansdue = await this.pmPlanRepo.find({
  where: { is_active: true, next_due_at_utc: LessThanOrEqual(addDays(new Date(), 1)) }
});
for (const plan of plansdue) {
  await this.workOrderService.open({ wo_type: 'PREVENTIVE', equipment_id: plan.equipment_id, pm_plan_id: plan.id, ... });
  await this.alertsService.emit('maintenance.pm_due', { equipment_id: plan.equipment_id, plan_id: plan.id });
}
```

Tests `work-order.spec.ts`:
- `open()` sets equipment status to MAINTENANCE
- `close()` sets equipment status to ACTIVE (normal) and OUT_OF_SERVICE (condemned)
- `assign()` with mobile equipment + expired cert throws ERR_HABILITATION_EXPIRED
- `assign()` with static equipment (crusher) skips cert check
- `close()` calls `mtbfCalculatorService.refreshForEquipment`

Tests `preventive-maintenance.spec.ts`:
- PM plan with only `interval_hours` CHECK constraint passes; plan with no intervals fails
- `computeNextDue` returns calendar-based date when hours-based is further
- `PreventiveMaintenanceDueJob` creates PREVENTIVE work order when `next_due_at_utc <= tomorrow`
- PM due job emits `maintenance.pm_due` alert

**Commit:** `feat(03-mnt): equipment extension + PM plans + work orders + habilitation gate`

**Verify:**
```
pnpm --filter=@gravel/api test work-order*
pnpm --filter=@gravel/api test preventive-maintenance*
```

**Done:** All work order lifecycle tests pass. PM scheduler generates work orders. Habilitation gate enforced for mobile equipment.

---

### Task 2 — Spare parts stock + threshold alerts + MTBF/MTTR (MNT-04, MNT-05)

**Files:**
- `apps/api/src/modules/maintenance/entities/spare-part.entity.ts`
- `apps/api/src/modules/maintenance/entities/spare-part-movement.entity.ts`
- `apps/api/src/modules/maintenance/entities/spare-part-consumption.entity.ts`
- `apps/api/src/modules/maintenance/entities/equipment-availability.entity.ts`
- `apps/api/src/modules/maintenance/services/spare-part.service.ts`
- `apps/api/src/modules/maintenance/services/spare-part-threshold.service.ts`
- `apps/api/src/modules/maintenance/services/mtbf-calculator.service.ts`
- `apps/api/src/modules/maintenance/controllers/spare-part.controller.ts`
- `apps/api/src/modules/maintenance/migrations/1717300300000__create_spare_part.sql`
- `apps/api/src/modules/maintenance/migrations/1717300400000__create_equipment_availability.sql`
- `apps/api/src/modules/maintenance/tests/spare-part-threshold.spec.ts`
- `apps/api/src/modules/maintenance/tests/mtbf-calculator.spec.ts`
- `apps/api/src/modules/alerts/alerts.event-handlers.ts`

**Action:**

`spare_part`:
```sql
CREATE TABLE spare_part (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  site_id              UUID NOT NULL,
  part_number          VARCHAR(100) NOT NULL,
  description          VARCHAR(300),
  unit                 VARCHAR(20) NOT NULL,
  quantity_on_hand     NUMERIC(12,3) NOT NULL DEFAULT 0,
  reorder_threshold    NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost_minor      BIGINT NOT NULL DEFAULT 0,
  currency             CHAR(3) NOT NULL DEFAULT 'XOF',
  updated_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, site_id, part_number)
);
```

`spare_part_movement` — audit trail (NOT chain-of-hash, FND-06 suffices):
```sql
CREATE TABLE spare_part_movement (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL,
  spare_part_id    UUID NOT NULL REFERENCES spare_part(id),
  work_order_id    UUID NULL REFERENCES work_order(id),
  delta            NUMERIC(12,3) NOT NULL,   -- positive=in, negative=out
  reason           VARCHAR(200) NOT NULL,
  quantity_after   NUMERIC(12,3) NOT NULL,
  created_by       UUID NOT NULL,
  created_at_utc   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`spare_part_consumption` — append-only link between work order and parts used:
```sql
CREATE TABLE spare_part_consumption (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL,
  work_order_id    UUID NOT NULL REFERENCES work_order(id),
  spare_part_id    UUID NOT NULL REFERENCES spare_part(id),
  quantity_consumed NUMERIC(12,3) NOT NULL,
  unit_cost_minor  BIGINT NOT NULL,
  currency         CHAR(3) NOT NULL,
  consumed_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`equipment_availability` — materialized projection:
```sql
CREATE TABLE equipment_availability (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL,
  equipment_id           UUID NOT NULL REFERENCES production_equipment(id),
  period_start_utc       TIMESTAMPTZ NOT NULL,
  period_end_utc         TIMESTAMPTZ NOT NULL,
  total_failures         INT NOT NULL DEFAULT 0,
  total_repair_minutes   INT NOT NULL DEFAULT 0,
  total_downtime_minutes INT NOT NULL DEFAULT 0,
  mtbf_hours             NUMERIC(10,2) NULL,   -- NULL if total_failures = 0
  mttr_hours             NUMERIC(10,2) NULL,   -- NULL if total_failures = 0
  availability_pct       NUMERIC(5,2) NULL,
  refreshed_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, equipment_id)
);
```

`SparePartService.consume(partId, workOrderId, quantity, manager)`:
1. `SELECT * FROM spare_part WHERE id = :partId FOR UPDATE` — pessimistic lock
2. If `quantity_on_hand - quantity < 0`: throw `ERR_INSUFFICIENT_STOCK (409)`, set work order `status = AWAITING_PARTS`
3. `UPDATE spare_part SET quantity_on_hand = quantity_on_hand - :quantity` within same transaction
4. Insert `spare_part_movement` row with `delta = -quantity, reason = 'WORK_ORDER_CONSUMPTION'`
5. Insert `spare_part_consumption` row
6. After tx commit: call `sparePartThresholdService.checkCrossing(partId, oldQty, newQty)`

`SparePartThresholdService.checkCrossing(partId, oldQty, newQty)`: same edge-triggered pattern as `StockpileThresholdService.checkCrossing`. Emits `maintenance.spare_part.threshold_crossed` only when `oldQty > reorder_threshold AND newQty <= reorder_threshold` (downward crossing only).

`MTBFCalculatorService.refreshForEquipment(equipmentId, tenantId)`:
```typescript
// Rolling 12-month window from now()
const windowStart = subMonths(new Date(), 12);
const workOrders = await this.workOrderRepo.find({
  where: {
    equipment_id: equipmentId,
    wo_type: 'CORRECTIVE',
    status: 'CLOSED',
    end_at_utc: MoreThan(windowStart),
    downtime_minutes: Not(IsNull()),
  }
});
const totalFailures = workOrders.length;
const totalRepairMinutes = workOrders.reduce((s, wo) => s + wo.downtime_minutes, 0);
const periodHours = 12 * 30 * 24; // approximate 12-month window in hours
const totalDowntimeHours = totalRepairMinutes / 60;
const uptimeHours = periodHours - totalDowntimeHours;

const mtbfHours = totalFailures > 0 ? uptimeHours / totalFailures : null;
const mttrHours = totalFailures > 0 ? (totalRepairMinutes / 60) / totalFailures : null;
const availabilityPct = ((uptimeHours / periodHours) * 100);

await this.availabilityRepo.upsert({ equipment_id: equipmentId, mtbf_hours: mtbfHours, mttr_hours: mttrHours, availability_pct: availabilityPct, ... });
```

Add `@OnEvent('maintenance.spare_part.threshold_crossed')` and `@OnEvent('maintenance.pm_due')` handlers to `apps/api/src/modules/alerts/alerts.event-handlers.ts`.

Tests `spare-part-threshold.spec.ts`:
- `consume()` with sufficient stock succeeds, `threshold_crossed` emitted only on downward crossing
- `consume()` with quantity > `quantity_on_hand` throws ERR_INSUFFICIENT_STOCK (409) — stock not changed
- Concurrent consumption: SELECT FOR UPDATE prevents negative stock (mock two concurrent calls)
- Threshold staying-below does not re-emit (edge-triggered, not level-triggered)

Tests `mtbf-calculator.spec.ts`:
- 2 failures of 60min each in a 720h window: MTBF = (720-2)/2 = 359h, MTTR = 1h
- 0 failures: MTBF = null, MTTR = null, availability_pct = 100.00
- `refreshForEquipment` called after `WorkOrderService.close()` — verify upsert on `equipment_availability`

**Commit:** `feat(03-mnt): spare parts stock + threshold alerts + MTBF/MTTR materialized projection`

**Verify:**
```
pnpm --filter=@gravel/api test spare-part-threshold*
pnpm --filter=@gravel/api test mtbf-calculator*
```

**Done:** Negative stock prevention test passes (SELECT FOR UPDATE). MTBF formula with zero-failures edge case passes. Threshold edge-triggered pattern passes.

---

### Task 3 — Mobile work order form (MNT-03)

**Files:**
- `apps/mobile/lib/features/maintenance/repositories/work_order_entry_repository.dart`
- `apps/mobile/lib/features/maintenance/screens/work_order_form.dart`
- `apps/mobile/integration_test/work_order_offline_test.dart`

**Action:**

`WorkOrderEntryRepository` extends `AppendOnlyRepository<WorkOrderEntry>`. Sync strategy: `append_only_event`. Fields: `work_order_id` (UUID, pre-assigned by server), `diagnosis_md`, `labor_hours`, `downtime_minutes`, `technician_id`, `occurred_at_utc`. This captures the technician's diagnosis and time entry offline; spare part consumption is online-only (requires stock check).

`WorkOrderFormScreen`: Shows work order details (equipment name, type, assigned technician) loaded from PowerSync local cache. Fields: `diagnosis_md` (multi-line text), `labor_hours` (numeric), `downtime_minutes` (numeric), `is_equipment_condemned` (checkbox with confirmation dialog). Submit stores locally via repository with `pending_sync = true`. Shows "Saisie hors-ligne" banner when offline.

Integration test `work_order_offline_test.dart`:
- Create work order entry offline with `diagnosis_md`, `labor_hours = 2.5`, `downtime_minutes = 120`
- Assert `pending_sync = true`
- Assert `listForWorkOrder(workOrderId)` returns 1 row with correct values
- Spare part consumption field is not present in offline form (assert form does not render `spare_part_id` field)

**Commit:** `feat(03-mnt): mobile work order offline form + integration test`

**Verify:**
```
pnpm --filter=@gravel/mobile integration_test/work_order_offline_test.dart
```

**Done:** 4 integration test assertions pass. Spare part field absent from offline form (online-only restriction enforced).

---

### Task 4 — Maintenance Web UI + module wiring (MNT-01..MNT-05)

**Files:**
- `apps/web/src/app/features/maintenance/maintenance.module.ts`
- `apps/web/src/app/features/maintenance/maintenance-routes.ts`
- `apps/web/src/app/features/maintenance/pages/work-order-list.component.ts`
- `apps/web/src/app/features/maintenance/pages/work-order-form.component.ts`
- `apps/web/src/app/features/maintenance/pages/pm-plan-list.component.ts`
- `apps/web/src/app/features/maintenance/pages/spare-part-stock.component.ts`
- `apps/web/src/app/features/maintenance/pages/equipment-availability.component.ts`
- `apps/web/src/app/features/maintenance/services/maintenance-api.service.ts`
- `apps/api/src/app.module.ts`
- `apps/web/src/app/app.routes.ts`

**Action:**

**Web Angular — Maintenance Feature Module:**

`WorkOrderListComponent`: AG Grid with `[created_at, wo_type (badge), status (badge), equipment_name, assigned_technician, downtime_minutes, labor_hours]`. Filter by `equipment_id`, `wo_type`, `status`, `date_range`. "New Work Order" button (Corrective, QUARRY_CHIEF or MAINTENANCE_TECH). Row click → detail.

`WorkOrderFormComponent`: Formly form. "Open" fields: `equipment_id` (picker, shows current status), `wo_type` (PREVENTIVE/CORRECTIVE), `operational_day_id`. "Assign" mode: `assigned_technician_id` (employee picker, MAINTENANCE_TECH role). "Close" mode: `diagnosis_md`, `labor_hours`, `downtime_minutes`, `is_equipment_condemned` (checkbox with warning). Spare parts sub-section: inline AG Grid for consumed parts (part_number, quantity, unit_cost); "Add Part" button opens picker `GET /spare-parts?q=` with current `quantity_on_hand` shown.

`PmPlanListComponent`: AG Grid with `[equipment_name, description, interval_hours, interval_km, interval_days, last_executed_at, next_due_at, is_active]`. Highlight red when `next_due_at <= tomorrow`. "Add PM Plan" button (Formly form). "Edit" to update intervals.

`SparePartStockComponent`: AG Grid with `[part_number, description, quantity_on_hand, reorder_threshold, unit, unit_cost_minor (formatted), currency]`. Color row red when `quantity_on_hand <= reorder_threshold`. "Receive Stock" button: Formly dialog `(spare_part_id, quantity, unit_cost_minor, reason)` — calls `POST /spare-parts/:id/receive`. Filter by `site_id`.

`EquipmentAvailabilityComponent`: card-based layout (one card per equipment). Each card shows: equipment name, type, current status badge, MTBF hours, MTTR hours, availability % (progress bar). Filter by `site_id`, `equipment_type`. Links to work order history. "Refresh" button calls `POST /equipment/:id/availability/refresh`.

Wire `MaintenanceModule` in `apps/api/src/app.module.ts`. Add `/maintenance` lazy route in `apps/web/src/app/app.routes.ts`.

**Commit:** `feat(03-mnt): maintenance web UI + MaintenanceModule wiring`

**Verify:**
```
pnpm --filter=@gravel/api build
pnpm --filter=@gravel/web build
```

**Done:** API and web build clean. `/maintenance` route renders. All 5 components render.

## Key Constraints

- `SparePartService.consume()` MUST use `SELECT ... FOR UPDATE` (Pitfall 5 from research — prevents negative stock)
- `MTBFCalculatorService` MUST return `null` for `mtbf_hours` and `mttr_hours` when `total_failures = 0`, not divide-by-zero
- `WorkOrderService.assign()` MUST call `isValidAt` for mobile equipment (drill, truck, excavator) and SKIP for static equipment (crusher, generator, screen)
- `maintenance.spare_part.threshold_crossed` alert MUST be edge-triggered (same as stockpile threshold pattern)
- Spare part consumption in mobile is ONLINE-ONLY — mobile form does NOT have a spare parts field
- `mtbfCalculatorService.refreshForEquipment` is called by `WorkOrderService.close()` — catch errors, never let calculator failure block work order closure

## Integration Points

This plan produces for downstream plans:
- `equipment_availability` table — W3-P07 reads `mtbf_hours`, `mttr_hours`, `availability_pct` for maintenance dashboard widget
- `work_order.downtime_minutes` aggregate — W3-P07 uses for total downtime KPI
- `maintenance.pm_due` and `maintenance.spare_part.threshold_crossed` alerts — W3-P07 SSE broadcaster registers these channels

## Success Criteria

- [ ] `pnpm --filter=@gravel/api test work-order*` — equipment status transitions + habilitation gate
- [ ] `pnpm --filter=@gravel/api test preventive-maintenance*` — PM scheduling + work order generation
- [ ] `pnpm --filter=@gravel/api test spare-part-threshold*` — SELECT FOR UPDATE negative stock prevention + edge-triggered alert
- [ ] `pnpm --filter=@gravel/api test mtbf-calculator*` — MTBF formula + zero-failures edge case
- [ ] `pnpm --filter=@gravel/mobile integration_test/work_order_offline_test.dart` — 4 assertions
- [ ] `pnpm --filter=@gravel/api build` — clean
- [ ] `pnpm --filter=@gravel/web build` — clean
- [ ] `/maintenance` route renders equipment availability cards

## Output

After completion, create `.planning/phases/03-operational-completeness/03-W2-P04-SUMMARY.md`
