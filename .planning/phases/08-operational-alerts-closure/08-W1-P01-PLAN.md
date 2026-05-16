---
phase: 08-operational-alerts-closure
plan: 08-W1-P01
title: "Equipment meter denormalization + event-driven updaters"
wave: 1
requirements_covered: [ALT-01]
depends_on: []
autonomous: true
files_modified:
  - apps/api/src/modules/master-data/production-equipment.entity.ts
  - apps/api/src/modules/maintenance/migrations/1719100000000__phase08_backfill_equipment_meters.sql
  - apps/api/src/modules/maintenance/migrations/1719100100000__phase08_add_truck_rotation_km_total_after.sql
  - apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts
  - apps/api/src/modules/maintenance/maintenance.module.ts
  - apps/api/src/modules/transport/services/truck-rotation.service.ts
  - apps/api/src/modules/transport/entities/truck-rotation.entity.ts
  - apps/api/src/modules/fuel/services/equipment-refuel.service.ts
tasks:
  - id: T01
    title: "Expose meter columns on ProductionEquipment entity + backfill migration"
  - id: T02
    title: "Add km_total_after on TruckRotation + populate on completion"
  - id: T03
    title: "Extend fuel event payload with equipmentHourMeterReading + MeterUpdateHandler (IF-HIGHER updates from refuel + rotation events)"
must_haves:
  truths:
    - "production_equipment.hour_meter_current is the single source of truth for equipment hour meter at PM check time"
    - "production_equipment.odometer_km_current is the single source of truth for equipment odometer at PM check time"
    - "Hour meter updates only when the incoming reading is strictly higher than the stored value (no regressions)"
    - "Km meter updates only when the incoming km_total_after is strictly higher than the stored value (no regressions)"
    - "Refueling an equipment with a higher hour-meter reading updates production_equipment.hour_meter_current within the same event cycle"
    - "Completing a TruckRotation with km_total_after updates production_equipment.odometer_km_current within the same event cycle"
    - "The fuel event name subscribed to is exactly 'production.fuel.refuel_appended' — verified at planning time against apps/api/src/modules/fuel/services/equipment-refuel.service.ts line 136. No runtime fallback or guess."
    - "The `production.fuel.refuel_appended` payload is extended in this plan to include `equipmentHourMeterReading: string` (numeric-as-string from the entity). Phase 7's existing payload `{ tenantId, siteId, tankId, equipmentId, liters, refuelId }` is preserved; the new field is appended additively so existing consumers (refuel-appended.handler.ts) are unaffected."
    - "Severity mapping is the canonical convention defined in 08-W1-P02 (see § 'Severity Mapping (canonical for Phase 8)'). Although this plan does not emit severities directly, the meter-update handler's downstream (the PM cron in W2-P01) consumes the values updated here and emits Alerts under that mapping. No severity translation is performed in this plan."
    - "All meter UPDATEs include tenant_id in the WHERE clause (RLS-safe)."
  artifacts:
    - path: apps/api/src/modules/master-data/production-equipment.entity.ts
      provides: "TypeORM columns hourMeterCurrent + odometerKmCurrent mapped to existing DB columns hour_meter_current / odometer_km_current"
      contains: "hour_meter_current"
    - path: apps/api/src/modules/maintenance/migrations/1719100000000__phase08_backfill_equipment_meters.sql
      provides: "Backfill of hour_meter_current from MAX(equipment_refuel.equipment_hour_meter_reading) — Phase 3 migration created the columns but never backfilled them"
      contains: "UPDATE production_equipment"
    - path: apps/api/src/modules/maintenance/migrations/1719100100000__phase08_add_truck_rotation_km_total_after.sql
      provides: "Adds km_total_after NUMERIC(12,2) NULL on truck_rotation (D-06 says ADD if absent — confirmed absent in current schema)"
      contains: "ALTER TABLE truck_rotation"
    - path: apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts
      provides: "@OnEvent handlers for production.fuel.refuel_appended (extended payload) and production.transport.rotation_completed that bump meters IF HIGHER"
      contains: "@OnEvent('production.fuel.refuel_appended')"
    - path: apps/api/src/modules/fuel/services/equipment-refuel.service.ts
      provides: "Extended emit of production.fuel.refuel_appended to include equipmentHourMeterReading so the meter-update handler can read it without a separate DB lookup"
      contains: "equipmentHourMeterReading"
  key_links:
    - from: fuel/services/equipment-refuel.service.ts
      to: maintenance/event-handlers/meter-update.handler.ts
      via: "EventEmitter2 event 'production.fuel.refuel_appended' payload { tenantId, siteId, tankId, equipmentId, liters, refuelId, equipmentHourMeterReading }"
      pattern: "@OnEvent\\('production\\.fuel\\.refuel_appended'\\)"
    - from: transport/services/truck-rotation.service.ts
      to: maintenance/event-handlers/meter-update.handler.ts
      via: "EventEmitter2 event 'production.transport.rotation_completed' payload { tenantId, truck_equipment_id, km_total_after }"
      pattern: "@OnEvent\\('production\\.transport\\.rotation_completed'\\)"
---

<objective>
Denormalize equipment hour & km meters onto `production_equipment` so the Phase 8 cron does NOT JOIN/MAX on every run (D-05). Update those meters via event handlers triggered by `production.fuel.refuel_appended` and `production.transport.rotation_completed`, using the `IF HIGHER` rule (D-06) to prevent backwards drift from late mobile syncs.

Purpose: ALT-01's cron compares `production_equipment.hour_meter_current >= lastExecutedMeter + intervalValue` (D-04). That column must exist on the entity, be populated by backfill (the Phase 3 migration created the columns but never filled them), and stay current via cheap event handlers.

Notable fact verified at planning time: the canonical fuel event is `production.fuel.refuel_appended` (not the speculative `fuel.equipment_refuel.created` from earlier drafts). It is emitted at `apps/api/src/modules/fuel/services/equipment-refuel.service.ts:136` with payload `{ tenantId, siteId, tankId, equipmentId, liters, refuelId }`. The hour-meter reading is NOT in that payload today. This plan extends the emit additively to include `equipmentHourMeterReading: string` so the new meter-update handler can read it directly without a follow-up DB lookup.

Output: 1 entity update, 2 migrations, 1 new event handler file, 1 module wiring, 1 service update on truck rotation completion path, 1 small extension to the fuel service emit.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-operational-alerts-closure/08-CONTEXT.md
@.planning/phases/08-operational-alerts-closure/08-W1-P02-PLAN.md
@apps/api/src/modules/master-data/production-equipment.entity.ts
@apps/api/src/modules/maintenance/migrations/1717300000000__create_maintenance_tables.sql
@apps/api/src/modules/fuel/entities/equipment-refuel.entity.ts
@apps/api/src/modules/fuel/services/equipment-refuel.service.ts
@apps/api/src/modules/fuel/event-handlers/refuel-appended.handler.ts
@apps/api/src/modules/transport/services/truck-rotation.service.ts
@apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts
@apps/api/src/modules/maintenance/maintenance.module.ts

<interfaces>
<!-- Reality check: D-05/D-07 use the names "current_hours_meter" / "current_km_meter".
     The Phase 3 migration 1717300000000__create_maintenance_tables.sql already added
     columns named hour_meter_current and odometer_km_current. The DB columns are the
     source of truth — Phase 8 must reconcile by using the existing names. -->

From apps/api/src/modules/master-data/production-equipment.entity.ts (current state — meter cols MISSING from entity):
```typescript
@Entity({ name: 'production_equipment' })
export class ProductionEquipment {
  id!: string;
  tenantId!: string;     // tenant_id
  siteId!: string;       // site_id
  code!: string;
  label!: string;
  type!: EquipmentType;  // 'drill' | 'excavator' | 'truck' | 'generator'
  status!: EquipmentStatus; // 'active' | 'maintenance' | 'out_of_service'
  specs!: Record<string, unknown>;
  createdAt!: Date;
  updatedAt!: Date;
  // MISSING: hour_meter_current, odometer_km_current, commissioned_date
}
```

From apps/api/src/modules/fuel/entities/equipment-refuel.entity.ts:
```typescript
@Entity({ name: 'equipment_refuel' })
export class EquipmentRefuel {
  id!: string;
  tenantId!: string;       // tenant_id
  siteId!: string;         // site_id
  tankId!: string;         // tank_id
  equipmentId!: string;    // equipment_id
  operatorId!: string;     // operator_id
  liters!: string;         // numeric(7,2)
  equipmentHourMeterReading!: string; // numeric(8,1) — column equipment_hour_meter_reading
  operationalDayId!: string;
  createdAtLocal!: Date;
  ianaTimezone!: string;
  createdBy!: string;
  createdAtUtc!: Date;
}
```

From apps/api/src/modules/fuel/services/equipment-refuel.service.ts (CURRENT emit at line 136):
```typescript
this.events.emit('production.fuel.refuel_appended', {
  tenantId: result.tenantId,
  siteId: result.siteId,
  tankId: result.tankId,
  equipmentId: result.equipmentId,
  liters: parseFloat(result.liters),
  refuelId: result.id,
});
```
The payload does NOT include `equipmentHourMeterReading`. This plan extends it additively.

Existing consumer (must continue to work after the extension):
- apps/api/src/modules/fuel/event-handlers/refuel-appended.handler.ts subscribes via `@OnEvent('production.fuel.refuel_appended')`. It accepts the existing fields and will ignore the new `equipmentHourMeterReading` field (TypeScript object widening is benign on additive payload extension).

From apps/api/src/modules/transport/entities/truck-rotation.entity.ts (current — NO km column):
```typescript
@Entity({ name: 'truck_rotation' })
export class TruckRotation {
  id!: string;
  tenantId!: string;
  siteId!: string;
  operationalDayId!: string;
  truckEquipmentId?: string | null; // truck_equipment_id — FK to production_equipment
  driverId?: string | null;
  loadedAtBenchId!: string;
  unloadedAtZoneId!: string;
  materialType!: 'granite_brut' | 'tout_venant' | 'sterile';
  loadedTonnageT!: string;
  weighingTicketId!: string;
  loadedAtUtc!: Date;
  unloadedAtUtc?: Date | null;
  cycleTimeMinutes?: string | null;
  createdBy!: string;
  createdAtUtc!: Date;
  // MISSING: km_total_after (Phase 8 adds this)
}
```

The transport service emits `ROTATION_COMPLETED_EVENT = 'production.transport.rotation_completed'` already; the existing handler (`transport/event-handlers/rotation-completed.handler.ts`) is a structured-log sink — we ADD a NEW handler in maintenance/ that subscribes to the same event for meter updates.

From apps/api/src/modules/maintenance/maintenance.module.ts (current state):
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([WorkOrder, PreventiveMaintenancePlan, SparePart, SparePartConsumption, EquipmentAvailability]), EventEmitterModule],
  controllers: [MaintenanceController],
  providers: [WorkOrderService, SparePartService, MtbfCalculatorService],
  exports: [WorkOrderService, SparePartService, MtbfCalculatorService],
})
export class MaintenanceModule {}
```

Severity mapping note: this plan does NOT translate severities. The canonical convention is defined in `08-W1-P02-PLAN.md` § "Severity Mapping (canonical for Phase 8)" and applied by W2-P01's `PmOpenedAlertHandler`. The meter-update handler in this plan is severity-agnostic — it only writes a numeric value to a denormalized column.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (T01): Expose hour_meter_current + odometer_km_current on ProductionEquipment entity and backfill via migration</name>
  <read_first>
    - apps/api/src/modules/master-data/production-equipment.entity.ts (current entity — meter columns MISSING from TS)
    - apps/api/src/modules/maintenance/migrations/1717300000000__create_maintenance_tables.sql lines 1-8 (proof that DB columns hour_meter_current, odometer_km_current, commissioned_date already exist)
    - apps/api/src/modules/fuel/entities/equipment-refuel.entity.ts (column equipment_hour_meter_reading is NUMERIC(8,1) — source for backfill)
    - 08-CONTEXT.md § D-05: "Source du compteur engin = colonnes denormalisees current_hours_meter et current_km_meter (NUMERIC 12,2) sur production_equipment"
    - 08-CONTEXT.md § D-07: "la migration de phase 8 ajoute current_hours_meter + current_km_meter sur production_equipment avec backfill"
    - 08-CONTEXT.md § "Constraints Discovered": "`production_equipment` may already have a `specs` jsonb that some teams use for ad-hoc meter values — Phase 8 prefers dedicated columns"
  </read_first>
  <behavior>
    - Test 1: Reading a ProductionEquipment row via the repository returns the new fields `hourMeterCurrent: string | null` and `odometerKmCurrent: string | null` typed correctly (numeric → string in TypeORM).
    - Test 1b: The `commissionedDate: string | null` field is also exposed AND a GET /api/equipment/:id integration test reads it back from the API response (proving the API surface includes it — INFO 11 resolution: we KEEP the field and add an acceptance test rather than removing it, since the column already exists in the DB and TypeORM mapping is mandatory for consistency).
    - Test 2: After running migration `1719100000000__phase08_backfill_equipment_meters.sql`, any equipment that has at least one row in `equipment_refuel` has `hour_meter_current` equal to `MAX(equipment_hour_meter_reading)` for that equipment.
    - Test 3: Equipment with NO refuel rows keeps `hour_meter_current = NULL` (no fabricated zeros).
    - Test 4: Migration is idempotent: running it twice does NOT change values on the second run.
  </behavior>
  <action>
    Per D-05 verbatim: "Source du compteur engin = colonnes denormalisees `current_hours_meter` (NUMERIC 12,2) et `current_km_meter` (NUMERIC 12,2) sur `production_equipment`. Pas de JOIN/MAX a chaque cron run."

    Per D-07 verbatim: "Migration de schema = la migration de phase 8 ajoute `current_hours_meter` + `current_km_meter` sur `production_equipment` avec backfill : `current_hours_meter = (SELECT MAX(equipment_hour_meter_reading) FROM equipment_refuel WHERE equipment_id = pe.id)` ; null si pas de refuel encore."

    NAMING RECONCILIATION: The actual DB columns created by Phase 3 migration `1717300000000__create_maintenance_tables.sql` are named `hour_meter_current` and `odometer_km_current` (NUMERIC(12,2)), not `current_hours_meter` / `current_km_meter`. The DB is the source of truth — Phase 8 uses the existing column names.

    INFO 11 resolution: `commissionedDate` is KEPT (the column already exists in the DB, and consistency with the TypeORM model is mandatory). Test 1b above asserts the API exposes it, which gives us future-proof surface coverage without YAGNI churn.

    Step 1 — Edit `apps/api/src/modules/master-data/production-equipment.entity.ts` and add three columns under `updatedAt`:

    ```typescript
      @Column({ type: 'numeric', precision: 12, scale: 2, name: 'hour_meter_current', nullable: true })
      hourMeterCurrent!: string | null;

      @Column({ type: 'numeric', precision: 12, scale: 2, name: 'odometer_km_current', nullable: true })
      odometerKmCurrent!: string | null;

      @Column({ type: 'date', name: 'commissioned_date', nullable: true })
      commissionedDate!: string | null;
    ```

    Step 2 — Create migration `apps/api/src/modules/maintenance/migrations/1719100000000__phase08_backfill_equipment_meters.sql` with EXACT content:

    ```sql
    -- Phase 08 W1-P01 T01 — Backfill denormalized equipment meter columns (D-07).
    -- The columns themselves were created in Phase 3 migration
    -- 1717300000000__create_maintenance_tables.sql (lines 4-8) but were never
    -- populated. Phase 8 cron (ALT-01) reads these columns directly per D-05.

    -- Idempotency: only backfill rows where hour_meter_current IS NULL so a
    -- second run is a no-op. Rows updated since then via the meter event
    -- handler (T03) are preserved.
    UPDATE production_equipment pe
    SET hour_meter_current = sub.max_hours
    FROM (
      SELECT equipment_id, MAX(equipment_hour_meter_reading::numeric) AS max_hours
      FROM equipment_refuel
      GROUP BY equipment_id
    ) sub
    WHERE pe.id = sub.equipment_id
      AND pe.hour_meter_current IS NULL;

    -- No km backfill source exists yet in v1 — truck_rotation gains
    -- km_total_after in migration 1719100100000 (T02). Trucks start with
    -- odometer_km_current = NULL and accumulate via the meter event handler.
    ```

    Step 3 — Run `pnpm --filter @gravel/api migration:run` against a scratch DB and verify the SQL is accepted.

    Step 4 — Add an integration test that hits `GET /api/equipment/:id` (or the equivalent existing endpoint that returns equipment rows) and asserts the response body includes `hourMeterCurrent`, `odometerKmCurrent`, `commissionedDate` keys (values may be null). This covers Test 1b.
  </action>
  <verify>
    <automated>grep -n "hour_meter_current" apps/api/src/modules/master-data/production-equipment.entity.ts &amp;&amp; grep -n "odometer_km_current" apps/api/src/modules/master-data/production-equipment.entity.ts &amp;&amp; grep -n "commissioned_date" apps/api/src/modules/master-data/production-equipment.entity.ts &amp;&amp; grep -n "MAX(equipment_hour_meter_reading" apps/api/src/modules/maintenance/migrations/1719100000000__phase08_backfill_equipment_meters.sql &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    Entity exposes `hourMeterCurrent`, `odometerKmCurrent`, `commissionedDate` typed as `string | null`. Migration file exists, is idempotent (guard `WHERE pe.hour_meter_current IS NULL`), and backfills from `MAX(equipment_refuel.equipment_hour_meter_reading)`. API integration test confirms all three new fields are present on the equipment response. `tsc --noEmit` passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (T02): Add km_total_after column on truck_rotation and populate it on rotation completion</name>
  <read_first>
    - apps/api/src/modules/transport/entities/truck-rotation.entity.ts (confirms km_total_after is ABSENT)
    - apps/api/src/modules/transport/services/truck-rotation.service.ts (where ROTATION_COMPLETED_EVENT is emitted — the payload must gain km_total_after)
    - apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts (existing handler — shows payload shape pattern)
    - 08-CONTEXT.md § D-06 verbatim: "TruckRotationCompleted -&gt; MeterUpdateHandler.updateKmIfHigher(equipmentId, rotation.km_total_after) (necessite d'ajouter km_total_after sur truck_rotation si absent — verifier en planning)"
    - 08-CONTEXT.md § "Constraints Discovered": "`truck_rotation` may not have `km_total_after` — verify in planning ; if absent, ALT-01 km-based path needs the column added or an alternative source"
  </read_first>
  <behavior>
    - Test 1: After migration, `\d truck_rotation` shows a column `km_total_after NUMERIC(12,2) NULL`.
    - Test 2: Completing a rotation with `km_total_after = 12345.6` persists that value on the row.
    - Test 3: The `production.transport.rotation_completed` event payload contains `km_total_after` (number or string) when supplied; the field is omitted/null otherwise — handler must tolerate absent field for legacy rotations.
    - Test 4: Migration is idempotent (`ADD COLUMN IF NOT EXISTS`).
  </behavior>
  <action>
    Per D-06 verbatim: "`TruckRotationCompleted` -&gt; `MeterUpdateHandler.updateKmIfHigher(equipmentId, rotation.km_total_after)` (necessite d'ajouter `km_total_after` sur `truck_rotation` si absent — verifier en planning)."

    Verification done in planning: `km_total_after` is ABSENT from `truck_rotation` (confirmed by reading `apps/api/src/modules/transport/entities/truck-rotation.entity.ts` and `apps/api/src/modules/transport/migrations/1716200100000__create_truck_rotation.sql`). Phase 8 must ADD the column.

    Step 1 — Create migration `apps/api/src/modules/maintenance/migrations/1719100100000__phase08_add_truck_rotation_km_total_after.sql` with EXACT content:

    ```sql
    -- Phase 08 W1-P01 T02 — Add km_total_after to truck_rotation (D-06).
    -- Source of odometer updates for production_equipment.odometer_km_current
    -- consumed by the meter event handler in maintenance/.

    ALTER TABLE truck_rotation
      ADD COLUMN IF NOT EXISTS km_total_after NUMERIC(12, 2);

    COMMENT ON COLUMN truck_rotation.km_total_after IS
      'Total odometer reading on the truck AFTER this rotation completed. Used by Phase 8 MeterUpdateHandler to denormalize odometer_km_current on production_equipment. NULL for legacy rotations.';
    ```

    Note: filed under `maintenance/migrations/` so the Phase 8 timestamp series stays grouped.

    Step 2 — Edit `apps/api/src/modules/transport/entities/truck-rotation.entity.ts` and add the column under `cycleTimeMinutes`:

    ```typescript
      /** Truck odometer reading AFTER unloading (D-06). Phase 8 reads this to denormalize odometer_km_current on production_equipment. NULL for legacy rotations. */
      @Column({ type: 'numeric', precision: 12, scale: 2, name: 'km_total_after', nullable: true })
      kmTotalAfter?: string | null;
    ```

    Step 3 — Edit `apps/api/src/modules/transport/services/truck-rotation.service.ts`:
    - Add `kmTotalAfter?: string | null` to the `complete()` (or `completeWithManager()`) input DTO.
    - When persisting the completion update, include `km_total_after` in the UPDATE.
    - Add `km_total_after: input.kmTotalAfter ?? null` to the outbox event payload emitted at completion (search for the existing `ROTATION_COMPLETED_EVENT` emission and extend the payload object).

    Do NOT change the existing `rotation-completed.handler.ts` — it ignores unknown fields. The new MeterUpdateHandler (T03) reads `payload.km_total_after`.
  </action>
  <verify>
    <automated>grep -q "km_total_after NUMERIC(12, 2)" apps/api/src/modules/maintenance/migrations/1719100100000__phase08_add_truck_rotation_km_total_after.sql &amp;&amp; grep -q "kmTotalAfter" apps/api/src/modules/transport/entities/truck-rotation.entity.ts &amp;&amp; grep -q "km_total_after" apps/api/src/modules/transport/services/truck-rotation.service.ts &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    Migration adds `km_total_after NUMERIC(12,2)` idempotently. Entity exposes `kmTotalAfter: string | null`. `TruckRotationService` accepts and persists `kmTotalAfter` and includes `km_total_after` in the `production.transport.rotation_completed` payload. `tsc --noEmit` passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3 (T03): Extend production.fuel.refuel_appended payload + MeterUpdateHandler IF-HIGHER updates from refuel + rotation events</name>
  <read_first>
    - apps/api/src/modules/fuel/services/equipment-refuel.service.ts (the EXACT existing emit at line ~136 — payload to extend additively with equipmentHourMeterReading)
    - apps/api/src/modules/fuel/event-handlers/refuel-appended.handler.ts (existing consumer — must continue to work after the payload extension; it uses object widening so additive fields are benign)
    - apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts (reference pattern for @OnEvent handler structure + payload typing)
    - apps/api/src/modules/maintenance/maintenance.module.ts (must add MeterUpdateHandler to providers)
    - apps/api/src/modules/fuel/entities/equipment-refuel.entity.ts (column equipment_hour_meter_reading is NUMERIC(8,1), arrives as string)
    - 08-CONTEXT.md § D-06 verbatim (both bullets — IF HIGHER rule for hours and km)
    - 08-CONTEXT.md § D-18: "Tous les events passent par EventEmitter2 (deja en place). Pas d'outbox/Kafka pour cette phase"
  </read_first>
  <behavior>
    - Test 1: After this task, calling `EquipmentRefuelService.create(...)` emits `production.fuel.refuel_appended` with payload INCLUDING `equipmentHourMeterReading: string` (the numeric-string read from the persisted entity).
    - Test 1b: The existing `refuel-appended.handler.ts` consumer still functions correctly with the extended payload (no schema mismatch, no thrown exception).
    - Test 2: When a `production.fuel.refuel_appended` event arrives with `equipmentHourMeterReading = "1500.0"` and current DB `hour_meter_current = 1450.0`, after handler completes, `hour_meter_current` becomes `1500.00`.
    - Test 3: When the same event arrives with `equipmentHourMeterReading = "1400.0"` (LOWER than current 1500.00), `hour_meter_current` stays at `1500.00` (IF HIGHER rule — D-06). The handler's SQL guard `WHERE hour_meter_current IS NULL OR hour_meter_current < $3::numeric` ensures the UPDATE is a no-op.
    - Test 4: When `hour_meter_current` is NULL and a refuel reading of "800.0" arrives, the column updates to `800.00`.
    - Test 5: When a `production.transport.rotation_completed` event arrives with `km_total_after = "245.50"` and current DB `odometer_km_current = 240.00`, the column updates to `245.50`.
    - Test 6: When the rotation event has `km_total_after = null` or absent, the handler is a no-op (no UPDATE issued, no exception).
    - Test 7: When the rotation event has `truck_equipment_id = null`, the handler is a no-op.
    - Test 8: All UPDATEs scope by `tenant_id = $1 AND id = $2` (RLS-safe — never updates cross-tenant).
  </behavior>
  <action>
    Per D-06 verbatim: "Mise a jour des compteurs = event-driven via deux handlers :
    - `EquipmentRefuelCreated` (existe deja) -&gt; `MeterUpdateHandler.updateHoursIfHigher(equipmentId, refuel.equipment_hour_meter_reading)` ; le `IF HIGHER` empeche les regressions accidentelles si un mecano saisit une valeur passee.
    - `TruckRotationCompleted` -&gt; `MeterUpdateHandler.updateKmIfHigher(equipmentId, rotation.km_total_after)`"

    Per D-18 verbatim: "Tous les events passent par `EventEmitter2` (deja en place). Pas d'outbox/Kafka pour cette phase."

    EVENT NAME LOCK (resolves Warning 7): The canonical fuel event is `production.fuel.refuel_appended` — verified at planning time at `apps/api/src/modules/fuel/services/equipment-refuel.service.ts:136`. Hardcode that exact string in the `@OnEvent` decorator. NO "verify at runtime" / NO fallback / NO speculation.

    PAYLOAD EXTENSION (resolves Warning 7 sub-issue): The current `production.fuel.refuel_appended` payload does NOT include the hour meter reading. We extend it additively. This is a small, safe change that prevents the new handler from doing a follow-up DB lookup on every refuel.

    Step 1 — Edit `apps/api/src/modules/fuel/services/equipment-refuel.service.ts` line ~136. Change:

    ```typescript
    this.events.emit('production.fuel.refuel_appended', {
      tenantId: result.tenantId,
      siteId: result.siteId,
      tankId: result.tankId,
      equipmentId: result.equipmentId,
      liters: parseFloat(result.liters),
      refuelId: result.id,
    });
    ```

    to:

    ```typescript
    this.events.emit('production.fuel.refuel_appended', {
      tenantId: result.tenantId,
      siteId: result.siteId,
      tankId: result.tankId,
      equipmentId: result.equipmentId,
      liters: parseFloat(result.liters),
      refuelId: result.id,
      // Phase 8 W1-P01 T03: additive — consumed by MeterUpdateHandler to
      // bump production_equipment.hour_meter_current IF HIGHER (D-06).
      equipmentHourMeterReading: result.equipmentHourMeterReading,
    });
    ```

    The existing consumer `refuel-appended.handler.ts` continues to work — object widening means additional fields are ignored by handlers that didn't declare them in their event interface.

    Step 2 — Create `apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts`:

    ```typescript
    import { Injectable, Logger } from '@nestjs/common';
    import { OnEvent } from '@nestjs/event-emitter';
    import { InjectDataSource } from '@nestjs/typeorm';
    import { DataSource } from 'typeorm';

    interface RefuelAppendedEvent {
      tenantId: string;
      siteId: string;
      tankId: string;
      equipmentId: string;
      liters: number;
      refuelId: string;
      // Phase 8 additive field — see equipment-refuel.service.ts.
      equipmentHourMeterReading?: string | null;
    }

    interface RotationCompletedEvent {
      outboxId?: string;
      payload: {
        tenant_id?: string;
        truck_equipment_id?: string | null;
        km_total_after?: string | null;
      };
    }

    /**
     * MeterUpdateHandler (Phase 8 ALT-01 / D-05 / D-06).
     *
     * Denormalizes hour and km meters onto production_equipment via the
     * IF-HIGHER rule. Prevents regressions when late mobile sync brings in
     * a refuel reading older than the latest known.
     *
     * Event names are locked at planning time:
     *   - 'production.fuel.refuel_appended'           (apps/api/.../equipment-refuel.service.ts:136)
     *   - 'production.transport.rotation_completed'   (apps/api/.../truck-rotation.service.ts)
     *
     * No bulk recompute; transitions are event-driven only (D-09 spirit).
     */
    @Injectable()
    export class MeterUpdateHandler {
      private readonly logger = new Logger(MeterUpdateHandler.name);

      constructor(@InjectDataSource() private readonly ds: DataSource) {}

      @OnEvent('production.fuel.refuel_appended')
      async onRefuelAppended(evt: RefuelAppendedEvent): Promise<void> {
        if (!evt.equipmentId || !evt.equipmentHourMeterReading) return;
        await this.updateHoursIfHigher(
          evt.tenantId,
          evt.equipmentId,
          evt.equipmentHourMeterReading,
        );
      }

      @OnEvent('production.transport.rotation_completed')
      async onRotationCompleted(evt: RotationCompletedEvent): Promise<void> {
        const p = evt.payload;
        if (!p?.truck_equipment_id || p.km_total_after == null) return;
        if (!p.tenant_id) return;
        await this.updateKmIfHigher(
          p.tenant_id,
          p.truck_equipment_id,
          p.km_total_after,
        );
      }

      /** D-06 IF HIGHER guard on hour meter. */
      async updateHoursIfHigher(
        tenantId: string,
        equipmentId: string,
        readingNumericString: string,
      ): Promise<void> {
        const result = await this.ds.query(
          `UPDATE production_equipment
             SET hour_meter_current = $3::numeric,
                 updated_at = now()
           WHERE id = $1 AND tenant_id = $2
             AND (hour_meter_current IS NULL OR hour_meter_current < $3::numeric)`,
          [equipmentId, tenantId, readingNumericString],
        );
        this.logger.debug(
          `meter.hours equipment=${equipmentId} reading=${readingNumericString} updated=${(result as unknown as { rowCount?: number })?.rowCount ?? 0}`,
        );
      }

      /** D-06 IF HIGHER guard on km/odometer. */
      async updateKmIfHigher(
        tenantId: string,
        equipmentId: string,
        kmNumericString: string,
      ): Promise<void> {
        const result = await this.ds.query(
          `UPDATE production_equipment
             SET odometer_km_current = $3::numeric,
                 updated_at = now()
           WHERE id = $1 AND tenant_id = $2
             AND (odometer_km_current IS NULL OR odometer_km_current < $3::numeric)`,
          [equipmentId, tenantId, kmNumericString],
        );
        this.logger.debug(
          `meter.km equipment=${equipmentId} reading=${kmNumericString} updated=${(result as unknown as { rowCount?: number })?.rowCount ?? 0}`,
        );
      }
    }
    ```

    Step 3 — Edit `apps/api/src/modules/maintenance/maintenance.module.ts`:
    - Add import: `import { MeterUpdateHandler } from './event-handlers/meter-update.handler';`
    - Add `MeterUpdateHandler` to the `providers` array.
    - Do NOT export it (internal subscriber only).

    Step 4 — Create unit test `apps/api/src/modules/maintenance/event-handlers/meter-update.handler.spec.ts` covering Tests 2 through 8 from `<behavior>`. Mock `DataSource.query` with `jest.fn()` and assert the SQL plus parameters; assert that the LOWER-reading case relies on the WHERE-clause guard (`hour_meter_current < $3::numeric`) — the simplest assertion is to verify the SQL string contains that exact substring.

    Step 5 — Add or update `apps/api/src/modules/fuel/tests/equipment-refuel.spec.ts` (or the equivalent test that already covers refuel emit) to assert Test 1 + 1b — that the emit payload now includes `equipmentHourMeterReading` and the existing `refuel-appended.handler.ts` does not throw.
  </action>
  <verify>
    <automated>grep -q "@OnEvent('production.fuel.refuel_appended')" apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts &amp;&amp; grep -q "@OnEvent('production.transport.rotation_completed')" apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts &amp;&amp; grep -q "hour_meter_current < " apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts &amp;&amp; grep -q "odometer_km_current < " apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts &amp;&amp; grep -q "MeterUpdateHandler" apps/api/src/modules/maintenance/maintenance.module.ts &amp;&amp; grep -q "equipmentHourMeterReading: result.equipmentHourMeterReading" apps/api/src/modules/fuel/services/equipment-refuel.service.ts &amp;&amp; pnpm --filter @gravel/api test -- meter-update.handler.spec.ts</automated>
  </verify>
  <done>
    `EquipmentRefuelService` emits `production.fuel.refuel_appended` with the additive `equipmentHourMeterReading` field. `MeterUpdateHandler` exists with two `@OnEvent` subscribers (the fuel event name is HARDCODED to `production.fuel.refuel_appended`, no fallback). Both SQL UPDATEs include the `IF HIGHER` guard in the WHERE clause. Module registers the handler. Unit tests cover all 8 behaviors from `<behavior>` and pass. Existing `refuel-appended.handler.ts` consumer still works (Test 1b). `tsc --noEmit` passes.
  </done>
</task>

</tasks>

<verification>
After all three tasks:
1. `pnpm --filter @gravel/api tsc --noEmit` returns exit code 0.
2. `pnpm --filter @gravel/api test -- meter-update.handler.spec.ts` returns exit code 0.
3. `grep -rn "hour_meter_current\\|odometer_km_current" apps/api/src/modules/master-data/ apps/api/src/modules/maintenance/event-handlers/` returns at least 4 lines.
4. `grep -n "production.fuel.refuel_appended" apps/api/src/modules/maintenance/event-handlers/meter-update.handler.ts apps/api/src/modules/fuel/services/equipment-refuel.service.ts` returns at least 2 lines (one emit, one subscribe).
5. Running the two new migrations against a clean DB succeeds and produces a `truck_rotation` table with `km_total_after` column and `production_equipment` rows where any equipment having refuel history has a non-null `hour_meter_current`.
</verification>

<success_criteria>
- `production_equipment.hour_meter_current`, `odometer_km_current`, AND `commissioned_date` are exposed on the TypeORM entity and accessible from services AND the API surface (verified by integration test).
- Backfill migration populates `hour_meter_current` from `MAX(equipment_refuel.equipment_hour_meter_reading)` for every equipment with refuel history; idempotent on re-run.
- `truck_rotation.km_total_after` column exists; `TruckRotationService` persists it on completion and emits it in the `production.transport.rotation_completed` payload.
- `EquipmentRefuelService` emits `production.fuel.refuel_appended` with the additive `equipmentHourMeterReading` field; existing consumers continue to work.
- `MeterUpdateHandler` is registered in `MaintenanceModule` providers and subscribes to both events using the LOCKED event names (no runtime guessing).
- Both update paths enforce `IF HIGHER` so out-of-order syncs cannot decrease the stored meter (D-06).
- All UPDATEs include `tenant_id` in the WHERE clause (RLS-safe).
</success_criteria>

<output>
After completion, create `.planning/phases/08-operational-alerts-closure/08-W1-P01-SUMMARY.md` listing: files modified, migrations created, the locked fuel event name (`production.fuel.refuel_appended`) and confirmation that its payload was extended with `equipmentHourMeterReading`, test results, and any deviations from D-05/D-06/D-07 with rationale.
</output>
