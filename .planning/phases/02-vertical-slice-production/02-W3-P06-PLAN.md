---
phase: 02-vertical-slice-production
plan: 06
type: execute
wave: 3
depends_on: ["02-W0-P01", "02-W2-P04", "02-W2-P05"]
files_modified:
  - apps/api/src/modules/fuel/fuel.module.ts
  - apps/api/src/modules/fuel/entities/fuel-tank.entity.ts
  - apps/api/src/modules/fuel/entities/fuel-tank-event.entity.ts
  - apps/api/src/modules/fuel/entities/equipment-refuel.entity.ts
  - apps/api/src/modules/fuel/entities/equipment-fuel-consumption.entity.ts
  - apps/api/src/modules/fuel/entities/energy-consumption-reading.entity.ts
  - apps/api/src/modules/fuel/services/fuel-tank-event.service.ts
  - apps/api/src/modules/fuel/services/equipment-refuel.service.ts
  - apps/api/src/modules/fuel/services/fuel-anomaly.service.ts
  - apps/api/src/modules/fuel/services/fuel-reconciliation.service.ts
  - apps/api/src/modules/fuel/services/energy-consumption.service.ts
  - apps/api/src/modules/fuel/controllers/fuel.controller.ts
  - apps/api/src/modules/fuel/event-handlers/refuel-appended.handler.ts
  - apps/api/src/modules/fuel/jobs/fuel-reconciliation.job.ts
  - apps/api/src/modules/fuel/jobs/fuel-anomaly-detection.job.ts
  - apps/api/src/modules/fuel/migrations/1716400000000__create_fuel_tank.sql
  - apps/api/src/modules/fuel/migrations/1716400100000__create_fuel_tank_event_partitioned.sql
  - apps/api/src/modules/fuel/migrations/1716400200000__create_equipment_refuel.sql
  - apps/api/src/modules/fuel/migrations/1716400300000__create_equipment_fuel_consumption.sql
  - apps/api/src/modules/fuel/migrations/1716400400000__create_energy_consumption_reading.sql
  - apps/api/src/modules/fuel/tests/fuel-tank-event.spec.ts
  - apps/api/src/modules/fuel/tests/equipment-refuel.spec.ts
  - apps/api/src/modules/fuel/tests/fuel-anomaly-detection.spec.ts
  - apps/api/src/modules/fuel/tests/fuel-reconciliation.spec.ts
  - apps/api/src/modules/fuel/tests/fuel-tank-event-chain-integrity.spec.ts
  - apps/web/src/app/features/fuel/fuel.module.ts
  - apps/web/src/app/features/fuel/pages/fuel-tank-list.component.ts
  - apps/web/src/app/features/fuel/pages/fuel-deliveries.component.ts
  - apps/web/src/app/features/fuel/pages/refuel-list.component.ts
  - apps/web/src/app/features/fuel/pages/energy-readings.component.ts
  - apps/web/src/app/features/fuel/fuel-routes.ts
  - apps/mobile/lib/features/fuel/screens/equipment_refuel_form.dart
  - apps/mobile/lib/features/fuel/repositories/equipment_refuel_repository.dart
  - apps/mobile/integration_test/equipment_refuel_test.dart
  - docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md
autonomous: true
requirements: [CAR-01, CAR-02, CAR-03, CAR-04]

must_haves:
  truths:
    - "Le solde de chaque cuve carburant est dérivé d'événements append-only avec chain-of-hash (CAR-01)"
    - "Chaque ravitaillement engin est saisi sur mobile offline et génère atomiquement un FUEL_DISPENSE_OUT + une ligne EquipmentFuelConsumption (CAR-02)"
    - "Un ratio L/h anormal (>1.5× ou <0.4× médiane 30j) déclenche une alerte (CAR-03)"
    - "Une réconciliation nightly compare solde théorique au solde projeté et alerte si écart > 0.5% volume cuve"
    - "Une lecture mensuelle consommation électrique par usage est saisissable web (CAR-04)"
  artifacts:
    - path: "apps/api/src/modules/fuel/entities/fuel-tank-event.entity.ts"
      provides: "Append-only fuel event ledger with chain-of-hash, partitioned monthly"
    - path: "apps/api/src/modules/fuel/services/fuel-anomaly.service.ts"
      provides: "L/h anomaly detection rolling 7d vs median 30d"
    - path: "docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md"
      provides: "Refined ADR (Accepted)"
  key_links:
    - from: "apps/api/src/modules/fuel/event-handlers/refuel-appended.handler.ts"
      to: "fuel_tank_event INSERT (FUEL_DISPENSE_OUT)"
      via: "atomic tx — refuel + fuel_tank_event + equipment_fuel_consumption"
      pattern: "FUEL_DISPENSE_OUT"
    - from: "apps/api/src/modules/fuel/services/fuel-anomaly.service.ts"
      to: "production.fuel.anomaly_detected event"
      via: "EventEmitter2 (consumed by alerts module W0-P01)"
      pattern: "production\\.fuel\\.anomaly_detected"
---

<objective>
Deliver Carburant + Énergie vertical slice covering CAR-01 (event-sourced tanks with chain-of-hash), CAR-02 (mobile offline refuel), CAR-03 (L/h anomaly detection), CAR-04 (manual energy readings). Refine ADR-0007.

Output: Fuel module backend symmetric to stockpile (partitioned event ledger, chain-of-hash, reconciliation, anomaly detection) + web UI + mobile refuel form.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-W2-P05-SUMMARY.md
@docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md
@apps/api/src/common/chain-of-hash/event-chain.verifier.ts
@apps/api/src/modules/stockpile/services/stockpile-event.service.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: fuel_tank + fuel_tank_event partitioned + chain-of-hash (CAR-01)</name>
  <files>
    apps/api/src/modules/fuel/entities/fuel-tank.entity.ts,
    apps/api/src/modules/fuel/entities/fuel-tank-event.entity.ts,
    apps/api/src/modules/fuel/services/fuel-tank-event.service.ts,
    apps/api/src/modules/fuel/migrations/1716400000000__create_fuel_tank.sql,
    apps/api/src/modules/fuel/migrations/1716400100000__create_fuel_tank_event_partitioned.sql,
    apps/api/src/modules/fuel/tests/fuel-tank-event.spec.ts,
    apps/api/src/modules/fuel/tests/fuel-tank-event-chain-integrity.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/stockpile/entities/stockpile-event.entity.ts (W2-P05 — symmetric pattern)
    - apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql (W2-P05 — partitioning template)
    - apps/api/src/common/chain-of-hash/event-chain.verifier.ts (W0-P01)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-50, D2-111"
  </read_first>
  <action>
    Migration `__create_fuel_tank.sql`:
    `CREATE TABLE fuel_tank (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, code VARCHAR(50) NOT NULL, label VARCHAR(200) NOT NULL, capacity_liters INT NOT NULL CHECK (capacity_liters > 0), fuel_type VARCHAR(20) NOT NULL DEFAULT 'gasoil', gps_point GEOGRAPHY(POINT, 4326) NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, site_id, code))`. RLS.

    Migration `__create_fuel_tank_event_partitioned.sql`:
    `CREATE TYPE fuel_tank_event_type AS ENUM ('FUEL_DELIVERY_IN','FUEL_DISPENSE_OUT','FUEL_ADJUSTMENT','FUEL_RECONCILIATION');
    CREATE TABLE fuel_tank_event (id UUID NOT NULL DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, tank_id UUID NOT NULL REFERENCES fuel_tank(id), event_type fuel_tank_event_type NOT NULL, liters_delta NUMERIC(10,2) NOT NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), source_reference JSONB NOT NULL DEFAULT '{}', occurred_at_utc TIMESTAMPTZ NOT NULL, created_by UUID NOT NULL, prev_hash BYTEA NOT NULL, row_hash BYTEA NOT NULL, cost_per_liter_minor_units BIGINT NULL, currency CHAR(3) NULL, PRIMARY KEY (id, occurred_at_utc)) PARTITION BY RANGE (occurred_at_utc);
    CREATE TABLE fuel_tank_event_2026_05 PARTITION OF fuel_tank_event FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
    CREATE TABLE fuel_tank_event_2026_06 PARTITION OF fuel_tank_event FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
    CREATE TABLE fuel_tank_event_2026_07 PARTITION OF fuel_tank_event FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');`
    + RLS.

    `FuelTankEventService.append(dto, manager)` mirroring stockpile-event.service.ts chain-of-hash algorithm. Role guard: `FUEL_ADJUSTMENT` requires SITE_MANAGER + source_reference.gauge_photo_sha256 + reason.

    Specs:
    - fuel-tank-event.spec: append 5 events (mix delivery, dispense, adjustment), assert each chains correctly. FUEL_ADJUSTMENT without photo → 400. FUEL_ADJUSTMENT by non-SITE_MANAGER → 403.
    - fuel-tank-event-chain-integrity.spec: seed 100 events, EventChainVerifier.verifyChain('fuel_tank_event', tenantId) → valid=true. Inject corruption → valid=false.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- fuel-tank-event fuel-tank-event-chain-integrity</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `CREATE TYPE fuel_tank_event_type AS ENUM ('FUEL_DELIVERY_IN','FUEL_DISPENSE_OUT','FUEL_ADJUSTMENT','FUEL_RECONCILIATION')`
    - Migration contains `PARTITION BY RANGE (occurred_at_utc)`
    - Entity contains `prev_hash` and `row_hash` BYTEA columns
    - Entity contains `cost_per_liter_minor_units` and `currency`
    - Chain integrity spec asserts verifier detects corruption on fuel_tank_event
    - Spec asserts FUEL_ADJUSTMENT requires photo + SITE_MANAGER
    - `pnpm --filter=@gravel/api test fuel-tank-event` exits 0
  </acceptance_criteria>
  <done>CAR-01 fuel event ledger with chain-of-hash.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: equipment_refuel + atomic FUEL_DISPENSE_OUT + EquipmentFuelConsumption (CAR-02)</name>
  <files>
    apps/api/src/modules/fuel/entities/equipment-refuel.entity.ts,
    apps/api/src/modules/fuel/entities/equipment-fuel-consumption.entity.ts,
    apps/api/src/modules/fuel/services/equipment-refuel.service.ts,
    apps/api/src/modules/fuel/event-handlers/refuel-appended.handler.ts,
    apps/api/src/modules/fuel/migrations/1716400200000__create_equipment_refuel.sql,
    apps/api/src/modules/fuel/migrations/1716400300000__create_equipment_fuel_consumption.sql,
    apps/api/src/modules/fuel/tests/equipment-refuel.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/fuel/services/fuel-tank-event.service.ts (Task 1)
    - apps/api/src/modules/master-data/production-equipment.entity.ts (W0-P01)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-51"
  </read_first>
  <behavior>
    - EquipmentRefuel append-only via @SyncEntity('append_only_event')
    - On insert in same tx: generate FUEL_DISPENSE_OUT in fuel_tank_event (negative liters_delta) AND EquipmentFuelConsumption row (liters, hour_meter_reading, cost_per_liter copied from latest FUEL_DELIVERY_IN of that tank)
    - hour_meter_reading must be ≥ previous reading for same equipment (validation)
  </behavior>
  <action>
    Migration `__create_equipment_refuel.sql`:
    `CREATE TABLE equipment_refuel (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, tank_id UUID NOT NULL REFERENCES fuel_tank(id), equipment_id UUID NOT NULL REFERENCES production_equipment(id), operator_id UUID NOT NULL, liters NUMERIC(7,2) NOT NULL CHECK (liters > 0), equipment_hour_meter_reading NUMERIC(8,1) NOT NULL CHECK (equipment_hour_meter_reading >= 0), gauge_photo_blob_sha256 VARCHAR(64) NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), created_at_local TIMESTAMP NOT NULL, iana_timezone VARCHAR(64) NOT NULL, notes TEXT NULL, created_by UUID NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now())`. RLS. @SyncEntity append_only_event.

    Migration `__create_equipment_fuel_consumption.sql`:
    `CREATE TABLE equipment_fuel_consumption (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, equipment_id UUID NOT NULL REFERENCES production_equipment(id), refuel_id UUID NOT NULL UNIQUE REFERENCES equipment_refuel(id), operational_day_id UUID NOT NULL, liters NUMERIC(7,2) NOT NULL, hour_meter_reading NUMERIC(8,1) NOT NULL, hours_since_previous NUMERIC(7,2) NULL, cost_per_liter_minor_units BIGINT NULL, currency CHAR(3) NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now())`. RLS.

    `EquipmentRefuelService.create(dto)`: open tx, validate `hour_meter_reading >= previous`, append fuel_tank_event(FUEL_DISPENSE_OUT, -liters, source_reference={refuel_id}), insert equipment_refuel row, compute hours_since_previous, insert equipment_fuel_consumption row, commit. Emit `production.fuel.refuel_appended` post-commit.

    Spec: create refuel 50L on tank with 100L balance → tank balance becomes 50L, equipment_fuel_consumption row exists with hours_since_previous calculated. Reject refuel with hour_meter < previous → 400 ERR_HOUR_METER_REGRESSION.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- equipment-refuel</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `CREATE TABLE equipment_refuel` with `liters NUMERIC(7,2) NOT NULL CHECK (liters > 0)`
    - Migration contains `equipment_fuel_consumption` with `refuel_id UUID NOT NULL UNIQUE`
    - Entity `equipment_refuel.entity.ts` contains `@SyncEntity({ strategy: 'append_only_event' })`
    - Service contains `FUEL_DISPENSE_OUT` and runs inside transaction
    - Spec asserts atomic creation of refuel + fuel_tank_event + equipment_fuel_consumption
    - Spec asserts hour_meter regression rejected
    - `pnpm --filter=@gravel/api test equipment-refuel` exits 0
  </acceptance_criteria>
  <done>CAR-02 atomic refuel + dispense + consumption row.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: L/h anomaly detection + nightly reconciliation + energy readings (CAR-03, CAR-04)</name>
  <files>
    apps/api/src/modules/fuel/services/fuel-anomaly.service.ts,
    apps/api/src/modules/fuel/services/fuel-reconciliation.service.ts,
    apps/api/src/modules/fuel/services/energy-consumption.service.ts,
    apps/api/src/modules/fuel/entities/energy-consumption-reading.entity.ts,
    apps/api/src/modules/fuel/jobs/fuel-reconciliation.job.ts,
    apps/api/src/modules/fuel/jobs/fuel-anomaly-detection.job.ts,
    apps/api/src/modules/fuel/migrations/1716400400000__create_energy_consumption_reading.sql,
    apps/api/src/modules/fuel/tests/fuel-anomaly-detection.spec.ts,
    apps/api/src/modules/fuel/tests/fuel-reconciliation.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/fuel/entities/equipment-fuel-consumption.entity.ts (Task 2)
    - apps/api/src/modules/stockpile/jobs/balance-recompute.job.ts (W2-P05 — cron pattern)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-52, D2-53, D2-54"
  </read_first>
  <behavior>
    - Anomaly detection (CAR-03): rolling 7d ratio = sum(liters)/sum(hours_since_previous) per equipment. Compare to median ratio over preceding 30d. If `ratio > 1.5 * median_30d` OR `ratio < 0.4 * median_30d` → emit `production.fuel.anomaly_detected` (consumed by alerts module). Configurable multipliers per site (table `fuel_anomaly_config` or default constants).
    - Reconciliation (CAR-01/D2-53): nightly job @ 03:30 site-tz. For each tank: theoretical_balance = sum(liters_delta), compare to last known projected balance. INSERT informational FUEL_RECONCILIATION event with liters_delta=0 and source_reference={ theoretical_balance, projected_balance, drift_liters }. If `abs(drift) > 0.005 * capacity_liters` → emit alert.
    - Energy (CAR-04): manual monthly readings table with 4 usage categories (concassage, criblage, ateliers, bureaux).
  </behavior>
  <action>
    Migration `__create_energy_consumption_reading.sql`:
    `CREATE TYPE energy_usage_type AS ENUM ('concassage','criblage','ateliers','bureaux');
    CREATE TABLE energy_consumption_reading (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, year_month CHAR(7) NOT NULL, usage_type energy_usage_type NOT NULL, kwh NUMERIC(10,2) NOT NULL CHECK (kwh >= 0), source_meter_code VARCHAR(50) NULL, recorded_by UUID NOT NULL, recorded_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), notes TEXT NULL, UNIQUE (tenant_id, site_id, year_month, usage_type))`. RLS.

    `FuelAnomalyService.computeAndDetect(equipmentId)`: query equipment_fuel_consumption last 7d → ratio_7d. Query 30d preceding → median (use percentile_cont 0.5 SQL). If anomalous → emit event. `FuelAnomalyDetectionJob` (BullMQ cron `0 4 * * *` site-tz): iterate all active equipment, call computeAndDetect.

    `FuelReconciliationService.runForTank(tankId)`: compute theoretical, fetch projected balance, compute drift, INSERT FUEL_RECONCILIATION event, if drift > 0.5% capacity → emit alert.

    `EnergyConsumptionService.upsert(year_month, usage_type, kwh)`: idempotent upsert per UNIQUE constraint. Service for CAR-04 read/write.

    Specs:
    - anomaly-detection.spec: seed equipment with 30d of normal consumption (ratio 6 L/h ± 0.5), then last 7d with ratio 15 L/h → emit anomaly_detected event with `severity: 'high'`. Seed only normal data → no event.
    - reconciliation.spec: tank capacity 10000L, theoretical 8500L, projected 8400L → drift 100L = 1% of capacity → emit alert. Theoretical 8500L, projected 8460L → drift 40L = 0.4% → no alert but FUEL_RECONCILIATION event inserted.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- fuel-anomaly-detection fuel-reconciliation</automated>
  </verify>
  <acceptance_criteria>
    - `fuel-anomaly.service.ts` contains string `production.fuel.anomaly_detected`
    - Anomaly service uses thresholds `1.5` and `0.4` (configurable but with these defaults)
    - `fuel-reconciliation.service.ts` contains string `FUEL_RECONCILIATION`
    - Reconciliation service uses threshold `0.005` (0.5% of capacity)
    - Migration contains `CREATE TYPE energy_usage_type AS ENUM ('concassage','criblage','ateliers','bureaux')`
    - Migration contains `UNIQUE (tenant_id, site_id, year_month, usage_type)`
    - Anomaly spec asserts emit on 1.5×median breach
    - Reconciliation spec asserts alert on 1% drift
    - `pnpm --filter=@gravel/api test fuel-anomaly-detection fuel-reconciliation` exits 0
  </acceptance_criteria>
  <done>CAR-03, CAR-04 covered; nightly reconciliation operational.</done>
</task>

<task type="auto">
  <name>Task 4: Web fuel UI + Mobile equipment_refuel form</name>
  <files>
    apps/web/src/app/features/fuel/fuel.module.ts,
    apps/web/src/app/features/fuel/fuel-routes.ts,
    apps/web/src/app/features/fuel/pages/fuel-tank-list.component.ts,
    apps/web/src/app/features/fuel/pages/fuel-tank-list.component.html,
    apps/web/src/app/features/fuel/pages/fuel-deliveries.component.ts,
    apps/web/src/app/features/fuel/pages/refuel-list.component.ts,
    apps/web/src/app/features/fuel/pages/energy-readings.component.ts,
    apps/mobile/lib/features/fuel/screens/equipment_refuel_form.dart,
    apps/mobile/lib/features/fuel/repositories/equipment_refuel_repository.dart,
    apps/mobile/integration_test/equipment_refuel_test.dart,
    apps/api/src/modules/fuel/controllers/fuel.controller.ts,
    apps/api/src/modules/fuel/fuel.module.ts
  </files>
  <read_first>
    - apps/web/src/app/features/stockpile/pages/stockpile-list.component.ts (W2-P05 pattern)
    - apps/mobile/lib/features/foration/screens/drilled_hole_form.dart (W1-P02 form pattern)
    - apps/mobile/integration_test/_fixtures/mock_photo_blobs.dart (W0-P01)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-50, D2-54"
  </read_first>
  <action>
    Web:
    - fuel-tank-list: AG Grid with tank code, label, capacity_liters, balance_liters (live SSE), % filled (color: red <10%, amber 10-30%, green >30%), last reconciliation drift.
    - fuel-deliveries: form to record FUEL_DELIVERY_IN (supplier BL number, liters, cost_per_liter, currency, photo upload).
    - refuel-list: AG Grid of equipment_refuel rows with equipment, liters, hours_since_previous, ratio L/h (badge if anomaly).
    - energy-readings: Formly form per month + AG Grid display per (year_month, usage_type, kwh).
    fuel.controller: REST endpoints POST/GET fuel-tank-events, POST/GET equipment-refuels, POST/GET energy-readings.

    Mobile equipment_refuel_form: tank dropdown (filtered by site), equipment dropdown (filtered active), liters input (numeric, large), hour_meter_reading (numeric), optional gauge photo (image_picker + compression + SHA-256), notes. Confirmation modal. AppendOnlyRepository.

    Integration test: create refuel offline → assert pending_sync row; restore network → assert sync.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web build &amp;&amp; cd apps/mobile &amp;&amp; flutter test integration_test/equipment_refuel_test.dart</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/features/fuel/fuel.module.ts` exports `class FuelModule`
    - fuel-tank-list.component.html contains `balance_liters` and color logic
    - energy-readings.component.ts handles 4 usage types
    - mobile `equipment_refuel_form.dart` contains `equipment_hour_meter_reading` and uses AppendOnlyRepository
    - Mobile integration test asserts pending_sync row
    - Build + flutter test exit 0
  </acceptance_criteria>
  <done>Web fuel UI live + mobile refuel offline working.</done>
</task>

<task type="auto">
  <name>Task 5: Refine ADR-0007 fuel event sourcing + reconciliation</name>
  <files>docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md</files>
  <read_first>
    - docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md (W0-P01 draft)
    - apps/api/src/modules/fuel/services/fuel-reconciliation.service.ts (Task 3)
  </read_first>
  <action>
    Promote to Accepted. Add `## Implementation Notes` with: event types (4), partitioning monthly, chain-of-hash columns, atomic refuel pattern (3 inserts in 1 tx), reconciliation cron 03:30 site-tz, drift threshold 0.5%, anomaly multipliers 1.5×/0.4×, anomaly detection cron 04:00.
  </action>
  <verify>
    <automated>node -e "const c=require('fs').readFileSync('docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md','utf8'); if(!c.includes('Accepted')||!c.includes('Implementation Notes')||!c.includes('FUEL_RECONCILIATION')||!c.includes('1.5')){console.error('missing');process.exit(1);}console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - ADR Status `Accepted`
    - ADR contains `## Implementation Notes`
    - ADR references thresholds 0.5% and 1.5×/0.4×
  </acceptance_criteria>
  <done>ADR-0007 Accepted.</done>
</task>

</tasks>

<verification>
- All fuel tests green
- Chain-of-hash verified for fuel_tank_event
- L/h anomaly detection green
- Reconciliation cron job tested
- ADR-0007 Accepted
</verification>

<success_criteria>
- CAR-01, CAR-02, CAR-03, CAR-04 covered
- Anomaly detection emits production.fuel.anomaly_detected
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W3-P06-SUMMARY.md`.
</output>
