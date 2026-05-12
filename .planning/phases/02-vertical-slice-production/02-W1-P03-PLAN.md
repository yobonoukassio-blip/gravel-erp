---
phase: 02-vertical-slice-production
plan: 03
type: execute
wave: 1
depends_on: ["02-W0-P01"]
files_modified:
  - apps/api/src/modules/extraction/extraction.module.ts
  - apps/api/src/modules/extraction/entities/extraction-cycle.entity.ts
  - apps/api/src/modules/extraction/services/extraction-cycle.service.ts
  - apps/api/src/modules/extraction/services/extraction-yield.service.ts
  - apps/api/src/modules/extraction/controllers/extraction-cycle.controller.ts
  - apps/api/src/modules/extraction/migrations/1716100000000__create_extraction_cycle.sql
  - apps/api/src/modules/extraction/tests/extraction-cycle.spec.ts
  - apps/api/src/modules/extraction/tests/extraction-yield.spec.ts
  - apps/web/src/app/features/extraction/extraction.module.ts
  - apps/web/src/app/features/extraction/pages/extraction-cycle-list.component.ts
  - apps/web/src/app/features/extraction/extraction-routes.ts
  - apps/mobile/lib/features/extraction/screens/extraction_cycle_form.dart
  - apps/mobile/lib/features/extraction/repositories/extraction_cycle_repository.dart
  - apps/mobile/integration_test/extraction_test.dart
autonomous: true
requirements: [EXT-01, EXT-02]

must_haves:
  truths:
    - "Un opérateur de pelle/chargeuse saisit ses cycles d'extraction sur mobile offline avec tonnage estimé, banc, matériau, downtime"
    - "Le rendement extraction est calculé par engin/opérateur/jour avec temps d'arrêt déduit"
    - "Le tonnage estimé n'est PAS la source du tonnage stockpile (qui vient de TRP-02 pesage)"
  artifacts:
    - path: "apps/api/src/modules/extraction/entities/extraction-cycle.entity.ts"
      provides: "ExtractionCycle append-only entity with material_type, downtime"
      contains: "extraction_cycle"
    - path: "apps/mobile/lib/features/extraction/screens/extraction_cycle_form.dart"
      provides: "Mobile offline extraction cycle form"
  key_links:
    - from: "apps/api/src/modules/extraction/entities/extraction-cycle.entity.ts"
      to: "operational_day"
      via: "FK operational_day_id"
      pattern: "operational_day_id"
---

<objective>
Deliver Extraction vertical slice covering EXT-01 (mobile cycle capture) + EXT-02 (yield per equipment/operator with downtime). Tonnage saisi est explicitement ESTIMÉ — pas valorisé pour stockpile (D2-21).

Output: extraction module backend + web list + mobile offline form.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-W0-P01-SUMMARY.md
@apps/api/src/modules/master-data/production-equipment.entity.ts
@apps/mobile/lib/core/sync/append_only_repository.dart
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend extraction — ExtractionCycle entity + service + yield calc</name>
  <files>
    apps/api/src/modules/extraction/extraction.module.ts,
    apps/api/src/modules/extraction/entities/extraction-cycle.entity.ts,
    apps/api/src/modules/extraction/services/extraction-cycle.service.ts,
    apps/api/src/modules/extraction/services/extraction-yield.service.ts,
    apps/api/src/modules/extraction/controllers/extraction-cycle.controller.ts,
    apps/api/src/modules/extraction/migrations/1716100000000__create_extraction_cycle.sql,
    apps/api/src/modules/extraction/tests/extraction-cycle.spec.ts,
    apps/api/src/modules/extraction/tests/extraction-yield.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/foration/entities/drilled-hole.entity.ts (append-only pattern from W1-P02)
    - apps/api/src/modules/master-data/bench.entity.ts (bench FK)
    - apps/api/src/modules/master-data/production-equipment.entity.ts (equipment FK)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-20, D2-21"
  </read_first>
  <behavior>
    - Append-only — PATCH/DELETE rejected 405
    - Downtime subtraction: yield = sum(estimated_tonnage_t) / ((cycle_time_total - downtime_total) hours)
    - 6 downtime reason codes accepted: meal_break, fuel, mechanical, weather, safety, other
    - 3 material types: granite_brut, tout_venant, sterile
  </behavior>
  <action>
    Migration:
    `CREATE TYPE material_type_enum AS ENUM ('granite_brut','tout_venant','sterile');
    CREATE TYPE downtime_reason_enum AS ENUM ('meal_break','fuel','mechanical','weather','safety','other');
    CREATE TABLE extraction_cycle (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), bench_id UUID NOT NULL REFERENCES bench(id), equipment_id UUID NOT NULL REFERENCES production_equipment(id), operator_id UUID NOT NULL, material_type material_type_enum NOT NULL, estimated_tonnage_t NUMERIC(7,1) NOT NULL CHECK (estimated_tonnage_t >= 0), cycle_started_at_local TIMESTAMP NOT NULL, cycle_ended_at_local TIMESTAMP NOT NULL, iana_timezone VARCHAR(64) NOT NULL, downtime_minutes INT NULL CHECK (downtime_minutes >= 0), downtime_reason_code downtime_reason_enum NULL, notes TEXT NULL, created_by UUID NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (cycle_ended_at_local > cycle_started_at_local))`. RLS. @SyncEntity({ strategy: 'append_only_event' }).

    `ExtractionYieldService.computeYield(siteId, operationalDayId): { equipment_id, operator_id, total_estimated_t, productive_hours, yield_t_per_h }[]` — productive_hours = sum((ended-started) - downtime) / 60.

    Spec: insert 5 cycles total 250 t in 10h with 60min downtime → productive=9h → yield=27.78 t/h. PATCH rejected.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- extraction</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `CREATE TYPE material_type_enum AS ENUM ('granite_brut','tout_venant','sterile')`
    - Migration contains `CREATE TYPE downtime_reason_enum`
    - Entity contains `@SyncEntity({ strategy: 'append_only_event' })`
    - Entity contains `operational_day_id`
    - Yield spec asserts downtime subtraction in calculation
    - PATCH rejection test passes
    - `pnpm --filter=@gravel/api test extraction` exits 0
  </acceptance_criteria>
  <done>EXT-01 backend + EXT-02 yield with downtime calculation.</done>
</task>

<task type="auto">
  <name>Task 2: Web extraction list + Mobile extraction cycle form</name>
  <files>
    apps/web/src/app/features/extraction/extraction.module.ts,
    apps/web/src/app/features/extraction/extraction-routes.ts,
    apps/web/src/app/features/extraction/pages/extraction-cycle-list.component.ts,
    apps/web/src/app/features/extraction/pages/extraction-cycle-list.component.html,
    apps/mobile/lib/features/extraction/screens/extraction_cycle_form.dart,
    apps/mobile/lib/features/extraction/repositories/extraction_cycle_repository.dart,
    apps/mobile/integration_test/extraction_test.dart
  </files>
  <read_first>
    - docs/design/phase-02/wireframes/extraction-cycle.png (from W0-P01 workshop)
    - apps/web/src/app/features/foration/pages/drilling-plan-list.component.ts (W1-P02 pattern)
    - apps/mobile/lib/features/foration/screens/drilled_hole_form.dart (W1-P02 pattern)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-20, D2-81"
  </read_first>
  <action>
    Web: AG Grid list of extraction cycles with columns date, bench, equipment, operator, material_type, estimated_tonnage_t, downtime_minutes (badge if > 0), notes. Filter by operational_day, equipment. Read-only.

    Mobile form: fields equipment (dropdown active equipment of type excavator), operator (current user default), bench (dropdown filtered by site), material_type (segmented control 3 options), estimated_tonnage_t (number input), cycle_started_at + cycle_ended_at (time pickers, default now()), downtime_minutes (optional number), downtime_reason_code (chip selector 6 options, only enabled if downtime_minutes > 0), notes (multi-line). Submit calls AppendOnlyRepository. Confirmation modal "Cycle non modifiable après envoi. Confirmer ?".

    Integration test: launch app, navigate Extraction → New cycle, fill form, submit, assert pending_sync row in local SQLite.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web build &amp;&amp; cd apps/mobile &amp;&amp; flutter test integration_test/extraction_test.dart</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/features/extraction/extraction.module.ts` exports `class ExtractionModule`
    - extraction-cycle-list.component.html contains `<ag-grid-angular`
    - mobile form contains string `granite_brut` (or i18n key)
    - mobile form contains string `meal_break` (downtime reason)
    - integration test contains assertion on pending_sync row
    - Build + flutter test exit 0
  </acceptance_criteria>
  <done>EXT-01 mobile capture + web read-only review working.</done>
</task>

</tasks>

<verification>
- Backend extraction tests green
- Web extraction list builds
- Mobile extraction integration test green
- EXT-01 and EXT-02 covered
</verification>

<success_criteria>
- All 2 EXT-* requirements covered
- Tonnage estimé clearly labeled "Estimé" in UI (i18n key `extraction.tonnage_estimated_label`)
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W1-P03-SUMMARY.md`.
</output>
