---
phase: 02-vertical-slice-production
plan: 02
type: execute
wave: 1
depends_on: ["02-W0-P01"]
files_modified:
  - apps/api/src/modules/foration/foration.module.ts
  - apps/api/src/modules/foration/entities/drilling-plan.entity.ts
  - apps/api/src/modules/foration/entities/drilled-hole.entity.ts
  - apps/api/src/modules/foration/services/drilling-plan.service.ts
  - apps/api/src/modules/foration/services/drilling-yield.service.ts
  - apps/api/src/modules/foration/controllers/drilling-plan.controller.ts
  - apps/api/src/modules/foration/controllers/drilled-hole.controller.ts
  - apps/api/src/modules/foration/event-handlers/drilled-hole.handler.ts
  - apps/api/src/modules/foration/migrations/1716000000000__create_drilling_plan.sql
  - apps/api/src/modules/foration/migrations/1716000100000__create_drilled_hole.sql
  - apps/api/src/modules/foration/migrations/1716000200000__create_drilling_yield_mv.sql
  - apps/api/src/modules/foration/tests/drilling-plan.spec.ts
  - apps/api/src/modules/foration/tests/drilled-hole.spec.ts
  - apps/api/src/modules/foration/tests/drilling-yield.spec.ts
  - apps/web/src/app/features/foration/foration.module.ts
  - apps/web/src/app/features/foration/pages/drilling-plan-list.component.ts
  - apps/web/src/app/features/foration/pages/drilling-plan-edit.component.ts
  - apps/web/src/app/features/foration/pages/drilled-hole-review.component.ts
  - apps/web/src/app/features/foration/foration-routes.ts
  - apps/mobile/lib/features/foration/screens/drilled_hole_form.dart
  - apps/mobile/lib/features/foration/screens/drilling_plan_list.dart
  - apps/mobile/lib/features/foration/widgets/gps_accuracy_indicator.dart
  - apps/mobile/lib/features/foration/repositories/drilled_hole_repository.dart
  - apps/mobile/integration_test/foration_test.dart
autonomous: true
requirements: [FOR-01, FOR-02, FOR-03, FOR-04, FOR-05]

must_haves:
  truths:
    - "Un Chef Carrière crée un plan de forage sur web avec statuts draft|active|closed|archived"
    - "Un opérateur saisit un trou foré sur mobile offline avec GPS, profondeur, diamètre — append-only"
    - "Une foreuse en statut maintenance/out_of_service est rejetée à l'affectation au plan"
    - "Le rendement m/h est calculé et exposé via API dashboard"
    - "Une consommation gasoil par session est saisie (lien CAR-02 via fuel_liters_consumed)"
    - "Une saisie hors-tolérance > 10% profondeur ou > 5% diamètre déclenche confirmation explicite mais ne bloque pas"
  artifacts:
    - path: "apps/api/src/modules/foration/entities/drilling-plan.entity.ts"
      provides: "DrillingPlan TypeORM entity with status state machine"
      contains: "drilling_plan"
    - path: "apps/api/src/modules/foration/entities/drilled-hole.entity.ts"
      provides: "DrilledHole append-only entity with @SyncEntity append_only_event"
      contains: "drilled_hole"
    - path: "apps/api/src/modules/foration/services/drilling-yield.service.ts"
      provides: "Drilling yield m/h calculation per (operational_day, machine, operator)"
    - path: "apps/mobile/lib/features/foration/screens/drilled_hole_form.dart"
      provides: "Mobile offline form with GPS, depth, diameter, tolerance check"
  key_links:
    - from: "apps/api/src/modules/foration/services/drilling-plan.service.ts"
      to: "ProductionEquipmentService.assertActive (from W0-P01)"
      via: "service injection"
      pattern: "assertActive\\("
    - from: "apps/mobile/lib/features/foration/screens/drilled_hole_form.dart"
      to: "GpsAccuracyIndicator widget"
      via: "widget composition"
      pattern: "GpsAccuracyIndicator\\("
    - from: "apps/api/src/modules/foration/event-handlers/drilled-hole.handler.ts"
      to: "drilling_yield_per_machine_day materialized view"
      via: "REFRESH MATERIALIZED VIEW CONCURRENTLY (debounced 30s via setTimeout)"
      pattern: "REFRESH MATERIALIZED VIEW"
---

<objective>
Deliver Foration vertical slice: backend (drilling plan + drilled hole + yield), web UI (plan management + hole review), mobile UI (offline hole entry per D2-83 wireframes). Covers FOR-01 (plan), FOR-02 (mobile capture), FOR-03 (yield m/h), FOR-04 (fuel per session), FOR-05 (broken drill blocks plan).

Purpose: First real domain module validating Phase 1 patterns (RLS, sync, audit, OperationalDay, money) under field conditions.

Output: Working foration module backend + web + mobile end-to-end with offline-first sync.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-W0-P01-SUMMARY.md
@docs/design/phase-02/co-design-workshop-readout.md
@docs/adr/ADR-0002-powersync-sync-engine.md
@docs/adr/ADR-0003-operational-day-model.md
@apps/api/src/modules/master-data/production-equipment.entity.ts
@apps/api/src/common/operational-day/operational-day.service.ts
@apps/mobile/lib/core/sync/append_only_repository.dart

<interfaces>
From W0-P01:
- `ProductionEquipmentService.assertActive(equipmentId: string): Promise<void>` — throws if status != 'active'
- `AppendOnlyRepository<T>` — base Dart repository for offline-first entities
- mock_gps.dart, mock_operational_day.dart fixtures

From Phase 1:
- `OperationalDayResolver.resolveForSite(siteId, instant): Promise<OperationalDay>`
- `@SyncEntity({ strategy: 'append_only_event' | 'pessimistic_lock' })`
- `TenantScopedRepository<T>`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend foration — DrillingPlan + DrilledHole entities, services, controllers, migrations</name>
  <files>
    apps/api/src/modules/foration/foration.module.ts,
    apps/api/src/modules/foration/entities/drilling-plan.entity.ts,
    apps/api/src/modules/foration/entities/drilled-hole.entity.ts,
    apps/api/src/modules/foration/services/drilling-plan.service.ts,
    apps/api/src/modules/foration/controllers/drilling-plan.controller.ts,
    apps/api/src/modules/foration/controllers/drilled-hole.controller.ts,
    apps/api/src/modules/foration/migrations/1716000000000__create_drilling_plan.sql,
    apps/api/src/modules/foration/migrations/1716000100000__create_drilled_hole.sql,
    apps/api/src/modules/foration/tests/drilling-plan.spec.ts,
    apps/api/src/modules/foration/tests/drilled-hole.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/master-data/production-equipment.entity.ts (from W0-P01 — for assertActive)
    - apps/api/src/modules/master-data/zone.entity.ts (FK pattern)
    - apps/api/src/modules/master-data/bench.entity.ts (FK pattern)
    - apps/api/src/common/operational-day/operational-day.service.ts (FK obligation)
    - apps/api/src/modules/sync/sync-entity.decorator.ts (@SyncEntity decorator from Phase 1)
    - docs/adr/ADR-0001-rls-multi-tenancy.md (RLS pattern)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-10, D2-11, D2-12, D2-14"
  </read_first>
  <behavior>
    - DrillingPlan: create draft → activate (requires assertActive on machine + operator role check) → close (only by creator or SITE_MANAGER) → archive
    - DrilledHole: append-only, server rejects PUT/PATCH/DELETE; corrections only via new row with corrects_hole_id reference
    - Out-of-tolerance: server stores but logs `tolerance_violation: true` on the row (mobile already confirmed)
    - FOR-05: POST /drilling-plans/:id/activate fails 400 ERR_EQUIPMENT_NOT_ACTIVE when machine.status != 'active'
  </behavior>
  <action>
    Migration `__create_drilling_plan.sql`:
    `CREATE TYPE drilling_plan_status AS ENUM ('draft','active','closed','archived'); CREATE TABLE drilling_plan (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL REFERENCES site(id), zone_id UUID NOT NULL REFERENCES zone(id), bench_id UUID NOT NULL REFERENCES bench(id), planned_hole_count INT NOT NULL CHECK (planned_hole_count > 0), target_depth_m NUMERIC(6,2) NOT NULL, diameter_mm INT NOT NULL, assigned_operator_id UUID NULL, assigned_machine_id UUID NULL REFERENCES production_equipment(id), valid_from TIMESTAMPTZ NOT NULL, valid_to TIMESTAMPTZ NULL, status drilling_plan_status NOT NULL DEFAULT 'draft', created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_by UUID NULL, closed_at_utc TIMESTAMPTZ NULL)`. RLS policy. @Auditable. @SyncEntity({ strategy: 'pessimistic_lock' }).

    Migration `__create_drilled_hole.sql`:
    `CREATE TABLE drilled_hole (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, plan_id UUID NOT NULL REFERENCES drilling_plan(id), hole_index_in_plan INT NOT NULL, gps_point GEOGRAPHY(POINT, 4326) NULL, gps_accuracy_m NUMERIC(5,1) NULL, actual_depth_m NUMERIC(6,2) NOT NULL, actual_diameter_mm INT NOT NULL, inclination_deg NUMERIC(4,1) NULL CHECK (inclination_deg BETWEEN 0 AND 90), started_at_local TIMESTAMP NOT NULL, ended_at_local TIMESTAMP NOT NULL, iana_timezone VARCHAR(64) NOT NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), operator_id UUID NOT NULL, machine_id UUID NOT NULL REFERENCES production_equipment(id), fuel_liters_consumed NUMERIC(7,2) NULL, notes_text TEXT NULL, photo_blob_sha256 VARCHAR(64) NULL, tolerance_violation BOOLEAN NOT NULL DEFAULT false, corrects_hole_id UUID NULL REFERENCES drilled_hole(id), created_by UUID NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (plan_id, hole_index_in_plan))`. RLS. @SyncEntity({ strategy: 'append_only_event' }). NO UPDATE TRIGGER (server-enforced append-only via guard rejecting PATCH).

    `DrillingPlanService.activate(planId, userId)`: load plan, check status=='draft', call `productionEquipmentService.assertActive(plan.assigned_machine_id)`, UPDATE status='active'. `closePlan(planId, userId)`: check role and ownership. Controllers expose REST. Spec tests: create plan, activate with maintenance drill → 400 ERR_EQUIPMENT_NOT_ACTIVE; create hole, PATCH → 405 Method Not Allowed; out-of-tolerance hole stored with `tolerance_violation: true`.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- foration</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/modules/foration/entities/drilling-plan.entity.ts` contains `@SyncEntity({ strategy: 'pessimistic_lock' })` and column `status` typed `drilling_plan_status`
    - `apps/api/src/modules/foration/entities/drilled-hole.entity.ts` contains `@SyncEntity({ strategy: 'append_only_event' })` and `operational_day_id`
    - Drilled hole entity contains `gps_point` (PostGIS) and `gps_accuracy_m`
    - Migration `__create_drilled_hole.sql` contains `GEOGRAPHY(POINT, 4326)`
    - Spec asserts `ERR_EQUIPMENT_NOT_ACTIVE` on activate with maintenance drill
    - Spec asserts PATCH /drilled-holes/:id returns 405
    - `pnpm --filter=@gravel/api test foration` exits 0
  </acceptance_criteria>
  <done>Backend foration module covers FOR-01, FOR-02 (server side), FOR-05.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Drilling yield m/h materialized view + service (FOR-03) + fuel per session field (FOR-04)</name>
  <files>
    apps/api/src/modules/foration/services/drilling-yield.service.ts,
    apps/api/src/modules/foration/event-handlers/drilled-hole.handler.ts,
    apps/api/src/modules/foration/migrations/1716000200000__create_drilling_yield_mv.sql,
    apps/api/src/modules/foration/tests/drilling-yield.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/foration/entities/drilled-hole.entity.ts (created in Task 1)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-13 Rendement m/h" + §"D2-11 fuel_liters_consumed"
    - apps/api/src/modules/audit/event-bus.module.ts (EventEmitter2 wiring)
  </read_first>
  <behavior>
    - On `production.foration.hole_drilled` event: schedule REFRESH MATERIALIZED VIEW CONCURRENTLY with debounce 30s (only one refresh in flight per tenant)
    - `getYield(siteId, operationalDayId, machineId?): Promise<{ machine_id, operator_id, total_depth_m, total_machine_hours, yield_m_per_h }[]>`
    - fuel_liters_consumed (FOR-04) already in entity from Task 1; surface via /equipment/:id/fuel-consumption?from&to endpoint
  </behavior>
  <action>
    Migration `__create_drilling_yield_mv.sql`:
    `CREATE MATERIALIZED VIEW drilling_yield_per_machine_day AS SELECT tenant_id, operational_day_id, machine_id, operator_id, SUM(actual_depth_m) AS total_depth_m, EXTRACT(EPOCH FROM SUM(ended_at_local - started_at_local))/3600.0 AS total_machine_hours, CASE WHEN EXTRACT(EPOCH FROM SUM(ended_at_local - started_at_local))/3600.0 > 0 THEN SUM(actual_depth_m) / (EXTRACT(EPOCH FROM SUM(ended_at_local - started_at_local))/3600.0) ELSE 0 END AS yield_m_per_h, COUNT(*) AS hole_count FROM drilled_hole WHERE corrects_hole_id IS NULL GROUP BY tenant_id, operational_day_id, machine_id, operator_id; CREATE UNIQUE INDEX idx_drilling_yield_unique ON drilling_yield_per_machine_day (tenant_id, operational_day_id, machine_id, operator_id);`

    Handler: subscribe to `production.foration.hole_drilled`, debounce 30s per tenant_id key (Map<tenantId, NodeJS.Timeout>), then run `REFRESH MATERIALIZED VIEW CONCURRENTLY drilling_yield_per_machine_day`. Also handle entity afterInsert trigger that emits the event with payload `{ tenant_id, hole_id, operational_day_id, machine_id, operator_id }`.

    Service `getYield()` queries the MV with RLS-aware filter. Also `getFuelConsumptionForEquipment(equipmentId, from, to)` aggregates drilled_hole.fuel_liters_consumed.

    Spec: insert 10 drilled holes spanning 4 hours total / 50 m depth → yield = 12.5 m/h. Insert correction with corrects_hole_id → original not double-counted.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- drilling-yield</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `CREATE MATERIALIZED VIEW drilling_yield_per_machine_day`
    - Migration contains `yield_m_per_h`
    - Handler file contains `@OnEvent('production.foration.hole_drilled')`
    - Handler contains string `REFRESH MATERIALIZED VIEW CONCURRENTLY` and `debounce`
    - Spec asserts yield calculation with corrections excluded
    - `pnpm --filter=@gravel/api test drilling-yield` exits 0
  </acceptance_criteria>
  <done>FOR-03 yield m/h calculated and surfaced; FOR-04 fuel per session captured via drilled_hole field.</done>
</task>

<task type="auto">
  <name>Task 3: Web foration module — plan list, plan edit, hole review (Angular)</name>
  <files>
    apps/web/src/app/features/foration/foration.module.ts,
    apps/web/src/app/features/foration/foration-routes.ts,
    apps/web/src/app/features/foration/pages/drilling-plan-list.component.ts,
    apps/web/src/app/features/foration/pages/drilling-plan-list.component.html,
    apps/web/src/app/features/foration/pages/drilling-plan-edit.component.ts,
    apps/web/src/app/features/foration/pages/drilling-plan-edit.component.html,
    apps/web/src/app/features/foration/pages/drilled-hole-review.component.ts,
    apps/web/src/app/features/foration/pages/drilled-hole-review.component.html,
    apps/web/src/app/features/foration/services/foration-api.service.ts
  </files>
  <read_first>
    - apps/web/src/app/features/master-data/pages/site-list.component.ts (Phase 1 pattern with AG Grid + Material)
    - apps/web/src/app/features/master-data/pages/site-edit.component.ts (Formly pattern)
    - apps/api/src/modules/i18n/locales/fr/foration.json (from W0-P01)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-90"
  </read_first>
  <action>
    1. `foration.module.ts`: lazy-loaded, declares 3 page components + service, imports MaterialModule, AgGridModule, FormlyMaterialModule, TranslocoModule.
    2. Routes: `/foration/plans` (list), `/foration/plans/:id` (edit), `/foration/holes` (review).
    3. plan-list: AG Grid showing id, zone, bench, status (badge color), planned_hole_count, progress (drilled/planned). Action buttons Activate/Close/Archive call API.
    4. plan-edit: Formly form with fields zone_id (select), bench_id (select), planned_hole_count (number), target_depth_m (number), diameter_mm (number), assigned_operator_id (select), assigned_machine_id (select filtered status='active'), valid_from (datetime), valid_to (datetime).
    5. drilled-hole-review: AG Grid showing holes for selected plan; columns hole_index, gps coords, depth, diameter, tolerance_violation (red badge if true), operator, machine, fuel_liters. Read-only.
    6. foration-api.service: HttpClient wrapping `/api/drilling-plans`, `/api/drilled-holes`.
    All UI text via Transloco keys e.g. `transloco('foration.drilling_plan_list_title')`.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web build &amp;&amp; pnpm --filter=@gravel/web lint -- --max-warnings=0 apps/web/src/app/features/foration</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/features/foration/foration.module.ts` exports `class ForationModule` decorated with @NgModule
    - foration-routes.ts contains paths 'plans', 'plans/:id', 'holes'
    - drilling-plan-list.component.html contains string `transloco` (translation pipe) and `<ag-grid-angular`
    - drilling-plan-edit.component.ts contains `formly`
    - drilled-hole-review.component.html contains string `tolerance_violation`
    - `pnpm --filter=@gravel/web build` exits 0
  </acceptance_criteria>
  <done>Web foration UI provides Chef Carrière plan CRUD and hole review (read-only).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Mobile foration — offline drilled_hole form + GPS accuracy indicator + sync</name>
  <files>
    apps/mobile/lib/features/foration/screens/drilled_hole_form.dart,
    apps/mobile/lib/features/foration/screens/drilling_plan_list.dart,
    apps/mobile/lib/features/foration/widgets/gps_accuracy_indicator.dart,
    apps/mobile/lib/features/foration/repositories/drilled_hole_repository.dart,
    apps/mobile/lib/features/foration/providers/foration_providers.dart,
    apps/mobile/integration_test/foration_test.dart
  </files>
  <read_first>
    - docs/design/phase-02/wireframes/foration-hole-form.png (from W0-P01 workshop)
    - apps/mobile/lib/core/sync/append_only_repository.dart (from W0-P01)
    - apps/mobile/integration_test/_fixtures/mock_gps.dart (from W0-P01)
    - apps/mobile/lib/features/activity-journal/ (Phase 1 pattern for offline form)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-11, D2-12, D2-81"
  </read_first>
  <behavior>
    - Form auto-saves draft every 5s to local SQLite
    - GPS accuracy displayed: red > 30m, amber 10-30m, green < 10m
    - Out-of-tolerance (|depth-target| > 10% OR |diameter-target| > 5%): modal "Hors tolérance — Confirmer ?" with text reason field, NOT blocking
    - Submit button disabled if any required field empty
    - Confirmation modal "Une fois envoyé, non modifiable. Confirmer." per D2-81
    - 56dp minimum tap target (glove-friendly)
    - Works fully offline: drafts persist, submit queues to AppendOnlyRepository
  </behavior>
  <action>
    1. `gps_accuracy_indicator.dart`: `class GpsAccuracyIndicator extends StatelessWidget` taking `accuracyM` double. Returns Container with color: red if >30, amber 10..30, green <10. Display text "GPS ±${accuracyM.toStringAsFixed(1)}m".
    2. `drilled_hole_form.dart`: long form using Riverpod `AsyncNotifier`. Fields: depth, diameter, inclination (Slider 0-90), notes, photo (optional via image_picker). GPS captured via geolocator on form open, updates accuracy indicator live. Auto-save: `Timer.periodic(Duration(seconds: 5), saveDraft)`. Tolerance check on submit. Submit calls `drilledHoleRepository.appendLocal(hole)`.
    3. `drilling_plan_list.dart`: shows active plans from local cache; tap navigates to drilled_hole_form with planId.
    4. `drilled_hole_repository.dart` extends `AppendOnlyRepository<DrilledHole>` from W0-P01.
    5. Integration test `foration_test.dart` (using `patrol` or `integration_test`): launch app, log in (mock), navigate to active plan, fill form (depth 5.2, target 5.0, diameter 89, target 90), GPS accuracy 8m → green indicator. Submit. Verify SQLite has 1 pending_sync drilled_hole row. Toggle offline. Submit second hole with depth 7.0 (target 5.0 = 40% out-of-tolerance) → confirmation modal appears.
  </action>
  <verify>
    <automated>cd apps/mobile &amp;&amp; flutter test integration_test/foration_test.dart</automated>
  </verify>
  <acceptance_criteria>
    - `apps/mobile/lib/features/foration/widgets/gps_accuracy_indicator.dart` exports `class GpsAccuracyIndicator extends StatelessWidget`
    - File contains conditions for `> 30` (red), `> 10` (amber)
    - `drilled_hole_form.dart` contains string `GpsAccuracyIndicator(`
    - File contains string `Timer.periodic` (auto-save)
    - File contains string `Hors tolérance` (tolerance modal)
    - Integration test contains string `tolerance` and `pending_sync`
    - `cd apps/mobile && flutter test integration_test/foration_test.dart` exits 0
  </acceptance_criteria>
  <done>FOR-02 mobile offline form working; FOR-04 fuel field present; GPS indicator visible.</done>
</task>

</tasks>

<verification>
- Backend: drilling-plan and drilled-hole specs green; yield calc green
- Web: build green, foration routes lazy-loaded
- Mobile: integration test green on simulator (XCover Pro 6 device matrix UAT happens at phase end)
- FOR-05: cannot activate plan with maintenance drill (asserted in spec)
- FOR-03: yield m/h queryable via API
</verification>

<success_criteria>
- `pnpm --filter=@gravel/api test foration` exits 0
- `pnpm --filter=@gravel/web build` exits 0
- `cd apps/mobile && flutter test integration_test/foration_test.dart` exits 0
- All 5 FOR-* requirements demonstrably covered
- Co-design wireframes referenced in mobile screen comments
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W1-P02-SUMMARY.md`.
</output>
