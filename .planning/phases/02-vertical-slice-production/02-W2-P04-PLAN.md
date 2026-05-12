---
phase: 02-vertical-slice-production
plan: 04
type: execute
wave: 2
depends_on: ["02-W0-P01", "02-W1-P02", "02-W1-P03"]
files_modified:
  - apps/api/src/modules/transport/transport.module.ts
  - apps/api/src/modules/transport/entities/truck-rotation.entity.ts
  - apps/api/src/modules/transport/entities/weighing-ticket.entity.ts
  - apps/api/src/modules/transport/services/truck-rotation.service.ts
  - apps/api/src/modules/transport/services/weighing-ticket.service.ts
  - apps/api/src/modules/transport/services/ticket-number-generator.service.ts
  - apps/api/src/modules/transport/controllers/truck-rotation.controller.ts
  - apps/api/src/modules/transport/controllers/weighing-ticket.controller.ts
  - apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts
  - apps/api/src/modules/transport/migrations/1716200000000__create_weighing_ticket.sql
  - apps/api/src/modules/transport/migrations/1716200100000__create_truck_rotation.sql
  - apps/api/src/modules/transport/tests/truck-rotation.spec.ts
  - apps/api/src/modules/transport/tests/weighing-ticket.spec.ts
  - apps/api/src/modules/transport/tests/ticket-number-generator.spec.ts
  - apps/web/src/app/features/transport/transport.module.ts
  - apps/web/src/app/features/transport/pages/rotation-list.component.ts
  - apps/web/src/app/features/transport/pages/dispatch-board.component.ts
  - apps/web/src/app/features/transport/pages/weighing-ticket-list.component.ts
  - apps/web/src/app/features/transport/transport-routes.ts
  - apps/mobile/lib/features/transport/screens/rotation_form.dart
  - apps/mobile/lib/features/transport/screens/weighing_ticket_form.dart
  - apps/mobile/lib/features/transport/widgets/signature_pad.dart
  - apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart
  - apps/mobile/lib/features/transport/repositories/rotation_repository.dart
  - apps/mobile/lib/features/transport/repositories/weighing_ticket_repository.dart
  - apps/mobile/integration_test/weighing_ticket_offline_test.dart
  - apps/mobile/integration_test/rotation_test.dart
  - docs/adr/ADR-0009-weighing-ticket-offline-numbering.md
autonomous: true
requirements: [TRP-01, TRP-02, TRP-03]

must_haves:
  truths:
    - "Chaque rotation camion est enregistrée avec point de chargement, déchargement, tonnage pesé, cycle time"
    - "Le pesage produit un ticket avec signature numérique, génération offline supportée, numérotation unique device+jour"
    - "Le ticket porte un content_hash SHA-256 du payload canonique + SHA des signatures"
    - "Le dispatching web affiche rotations en cours et permet affectation manuelle camion"
    - "Une rotation complétée publie production.transport.rotation_completed pour consommation stockpile (W2-P05)"
  artifacts:
    - path: "apps/api/src/modules/transport/entities/weighing-ticket.entity.ts"
      provides: "WeighingTicket entity with content_hash, signatures, offline numbering"
    - path: "apps/api/src/modules/transport/entities/truck-rotation.entity.ts"
      provides: "TruckRotation append-only with FK weighing_ticket_id NOT NULL"
    - path: "apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart"
      provides: "Format SITE-YYYYMMDD-DEVICE-SEQ unique per device+day"
    - path: "docs/adr/ADR-0009-weighing-ticket-offline-numbering.md"
      provides: "Refined ADR (was draft in W0)"
  key_links:
    - from: "apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts"
      to: "outbox_event (from W0-P01)"
      via: "Outbox publish in same tx as rotation update"
      pattern: "outboxService\\.publish"
    - from: "apps/mobile/lib/features/transport/screens/weighing_ticket_form.dart"
      to: "SignaturePad widget"
      via: "widget composition"
      pattern: "SignaturePad\\("
---

<objective>
Deliver Transport + Pesage vertical slice covering TRP-01 (rotation), TRP-02 (offline weighing ticket + signature + content hash), TRP-03 (manual dispatch board web). Refine ADR-0009. Publishes outbox event for stockpile inflow (consumed in W2-P05).

Output: transport module backend with outbox dispatch + web list/dispatch + mobile offline ticket + signature pad.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-W0-P01-SUMMARY.md
@.planning/phases/02-vertical-slice-production/02-W1-P02-SUMMARY.md
@docs/adr/ADR-0009-weighing-ticket-offline-numbering.md
@apps/api/src/modules/outbox/outbox.service.ts
@apps/api/src/modules/master-data/production-equipment.entity.ts

<interfaces>
From W0-P01:
- `OutboxService.publish({ aggregateType, aggregateId, eventType, payload, manager })` — publishes within caller's tx

To be created here:
- `WeighingTicket { id, ticket_number (SITE-YYYYMMDD-DEVICE-SEQ), gross_kg, tare_kg, net_kg (generated), truck_equipment_id, driver_id, material_type, weighed_at_local + tz, operator_user_id, weighing_station_code, client_signature_blob_sha256, driver_signature_blob_sha256, notes, is_offline_generated, content_hash }`
- `TruckRotation { id, operational_day_id, truck_equipment_id, driver_id, loaded_at_bench_id, unloaded_at_zone_id, material_type, loaded_tonnage_t, weighing_ticket_id (NOT NULL FK), loaded_at_utc, unloaded_at_utc, cycle_time_minutes (generated) }`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend transport — WeighingTicket entity + offline numbering + content hash</name>
  <files>
    apps/api/src/modules/transport/entities/weighing-ticket.entity.ts,
    apps/api/src/modules/transport/services/weighing-ticket.service.ts,
    apps/api/src/modules/transport/services/ticket-number-generator.service.ts,
    apps/api/src/modules/transport/controllers/weighing-ticket.controller.ts,
    apps/api/src/modules/transport/migrations/1716200000000__create_weighing_ticket.sql,
    apps/api/src/modules/transport/tests/weighing-ticket.spec.ts,
    apps/api/src/modules/transport/tests/ticket-number-generator.spec.ts
  </files>
  <read_first>
    - docs/adr/ADR-0009-weighing-ticket-offline-numbering.md (draft from W0-P01 — refine here)
    - apps/api/src/modules/foration/entities/drilled-hole.entity.ts (append-only pattern from W1-P02)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-31, D2-32, D2-33"
  </read_first>
  <behavior>
    - Ticket number format: `<SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>` (e.g. `CIV01-20260615-MOB42-0007`)
    - net_kg is a generated column: gross_kg - tare_kg
    - content_hash = sha256(canonical_json({ticket_number, gross_kg, tare_kg, net_kg, truck_equipment_id, driver_id, material_type, weighed_at_local, iana_timezone, weighing_station_code, client_signature_blob_sha256, driver_signature_blob_sha256}))
    - Server recomputes content_hash on insert and rejects if client hash != server hash
    - Server recomputes net_kg (does not trust client)
    - is_offline_generated = true means client-generated number; server only validates uniqueness, never renumbers
    - 4xx error if duplicate (tenant_id, ticket_number)
  </behavior>
  <action>
    Migration:
    `CREATE TABLE weighing_ticket (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, ticket_number VARCHAR(80) NOT NULL, gross_kg INT NOT NULL CHECK (gross_kg > 0), tare_kg INT NOT NULL CHECK (tare_kg >= 0), net_kg INT GENERATED ALWAYS AS (gross_kg - tare_kg) STORED, truck_equipment_id UUID NOT NULL REFERENCES production_equipment(id), driver_id UUID NOT NULL, material_type material_type_enum NOT NULL, weighed_at_local TIMESTAMP NOT NULL, iana_timezone VARCHAR(64) NOT NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), operator_user_id UUID NOT NULL, weighing_station_code VARCHAR(50) NOT NULL, client_signature_blob_sha256 VARCHAR(64) NULL, driver_signature_blob_sha256 VARCHAR(64) NULL, notes TEXT NULL, is_offline_generated BOOLEAN NOT NULL DEFAULT false, content_hash VARCHAR(64) NOT NULL, created_by UUID NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (gross_kg > tare_kg), UNIQUE (tenant_id, ticket_number))`. RLS. @SyncEntity({ strategy: 'append_only_event' }).

    `TicketNumberGeneratorService`: server-side counterpart that validates format with regex `^[A-Z0-9]{2,10}-\d{8}-[A-Z0-9]{2,10}-\d{4,}$`.

    `WeighingTicketService.create(dto)`: 1) validate format, 2) compute server content_hash from canonical payload, 3) compare to client hash, 4) reject mismatch with `ERR_CONTENT_HASH_MISMATCH`.

    Spec: insert ticket with gross=30000, tare=15000 → net=15000 stored. Compute hash; server side recompute must match. Mutate one byte client-side → reject ERR_CONTENT_HASH_MISMATCH. Duplicate ticket_number same site → 409 conflict.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- weighing-ticket ticket-number-generator</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `net_kg INT GENERATED ALWAYS AS (gross_kg - tare_kg) STORED`
    - Migration contains `UNIQUE (tenant_id, ticket_number)`
    - Entity contains `content_hash` column
    - Service contains `ERR_CONTENT_HASH_MISMATCH` string
    - Spec asserts content_hash mismatch returns 4xx error
    - Spec asserts duplicate ticket_number returns 409
    - `pnpm --filter=@gravel/api test weighing-ticket` exits 0
  </acceptance_criteria>
  <done>WeighingTicket backend supports offline-generated numbering, content_hash verification, generated net_kg.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Backend transport — TruckRotation + outbox dispatch on rotation_completed</name>
  <files>
    apps/api/src/modules/transport/transport.module.ts,
    apps/api/src/modules/transport/entities/truck-rotation.entity.ts,
    apps/api/src/modules/transport/services/truck-rotation.service.ts,
    apps/api/src/modules/transport/controllers/truck-rotation.controller.ts,
    apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts,
    apps/api/src/modules/transport/migrations/1716200100000__create_truck_rotation.sql,
    apps/api/src/modules/transport/tests/truck-rotation.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/outbox/outbox.service.ts (W0-P01 outbox)
    - apps/api/src/modules/transport/entities/weighing-ticket.entity.ts (Task 1 above)
    - apps/api/src/modules/master-data/production-equipment.entity.ts
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-30, D2-34, D2-35"
  </read_first>
  <behavior>
    - Rotation requires weighing_ticket_id NOT NULL (loaded_tonnage_t copied from ticket.net_kg/1000)
    - Setting unloaded_at_utc on a rotation publishes outbox event `production.transport.rotation_completed` in same tx
    - Outbox payload: { tenant_id, site_id, rotation_id, weighing_ticket_id, loaded_tonnage_kg, material_type, unloaded_at_zone_id (stockpile target), operational_day_id, occurred_at_utc }
    - Manual dispatch: POST /rotations/:id/assign accepts { truck_equipment_id } (TRP-03), validates equipment.status=='active' and type=='truck'
    - cycle_time_minutes is generated column = EXTRACT(EPOCH FROM (unloaded_at_utc - loaded_at_utc))/60
  </behavior>
  <action>
    Migration:
    `CREATE TABLE truck_rotation (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), truck_equipment_id UUID NULL REFERENCES production_equipment(id), driver_id UUID NULL, loaded_at_bench_id UUID NOT NULL REFERENCES bench(id), unloaded_at_zone_id UUID NOT NULL REFERENCES zone(id), material_type material_type_enum NOT NULL, loaded_tonnage_t NUMERIC(7,2) NOT NULL, weighing_ticket_id UUID NOT NULL REFERENCES weighing_ticket(id), loaded_at_utc TIMESTAMPTZ NOT NULL, unloaded_at_utc TIMESTAMPTZ NULL, cycle_time_minutes NUMERIC(7,2) GENERATED ALWAYS AS (CASE WHEN unloaded_at_utc IS NOT NULL THEN EXTRACT(EPOCH FROM (unloaded_at_utc - loaded_at_utc))/60.0 ELSE NULL END) STORED, created_by UUID NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (weighing_ticket_id))`. RLS.

    `TruckRotationService.complete(rotationId, unloadedAtUtc, manager)`: load rotation, UPDATE unloaded_at_utc inside tx, then call `outboxService.publish({ aggregateType:'truck_rotation', aggregateId: rotation.id, eventType:'production.transport.rotation_completed', payload: {...}, manager })` — same tx. Spec: complete rotation → assert outbox_event row exists with same tx, then assert worker dispatches.

    `TruckRotationService.assignTruck(rotationId, equipmentId)`: assertActive + type check, UPDATE truck_equipment_id.

    Spec: create rotation without truck → assign maintenance truck → 400; assign active truck → 200. Complete rotation → outbox row inserted in same tx (assert by rolling back tx — outbox row not visible).
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- truck-rotation</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `weighing_ticket_id UUID NOT NULL REFERENCES weighing_ticket(id)`
    - Migration contains `cycle_time_minutes NUMERIC(7,2) GENERATED ALWAYS AS`
    - Migration contains `UNIQUE (weighing_ticket_id)`
    - Service contains `outboxService.publish` with eventType `production.transport.rotation_completed`
    - Spec asserts outbox row inserted in same tx as rotation completion
    - Spec asserts assignTruck rejects non-active truck
    - `pnpm --filter=@gravel/api test truck-rotation` exits 0
  </acceptance_criteria>
  <done>TruckRotation supports TRP-01, TRP-03 dispatch; outbox event published for STK-01 consumption.</done>
</task>

<task type="auto">
  <name>Task 3: Web transport — rotation list, dispatch board, weighing ticket list</name>
  <files>
    apps/web/src/app/features/transport/transport.module.ts,
    apps/web/src/app/features/transport/transport-routes.ts,
    apps/web/src/app/features/transport/pages/rotation-list.component.ts,
    apps/web/src/app/features/transport/pages/rotation-list.component.html,
    apps/web/src/app/features/transport/pages/dispatch-board.component.ts,
    apps/web/src/app/features/transport/pages/dispatch-board.component.html,
    apps/web/src/app/features/transport/pages/weighing-ticket-list.component.ts,
    apps/web/src/app/features/transport/pages/weighing-ticket-list.component.html
  </files>
  <read_first>
    - apps/web/src/app/features/foration/pages/drilling-plan-list.component.ts (W1-P02 pattern)
    - apps/web/src/app/core/sse/sse-client.service.ts (W0-P01 for live updates)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-34, D2-90"
  </read_first>
  <action>
    1. rotation-list: AG Grid rotation columns: id, operational_day, truck, driver, bench (loaded_at), zone (unloaded_at), material, tonnage, cycle_time_minutes, status (pending/in-transit/done).
    2. dispatch-board: split view — left list of pending rotations (no truck assigned), right grid of available active trucks. Click rotation then truck → POST /rotations/:id/assign. Optional: SSE subscription for live updates.
    3. weighing-ticket-list: AG Grid columns ticket_number, gross_kg, tare_kg, net_kg, truck, driver, material, weighed_at, content_hash (truncated), signatures (icon if present), is_offline_generated (badge).
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web build</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/features/transport/transport.module.ts` exports `class TransportModule`
    - transport-routes.ts contains paths 'rotations', 'dispatch', 'tickets'
    - dispatch-board.component.ts contains string `assignTruck` or `assign`
    - weighing-ticket-list.component.html displays `is_offline_generated`
    - `pnpm --filter=@gravel/web build` exits 0
  </acceptance_criteria>
  <done>Web TRP-03 dispatch board + read-only ticket/rotation lists.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Mobile transport — offline rotation form + weighing ticket form + signature pad + offline numbering</name>
  <files>
    apps/mobile/lib/features/transport/screens/rotation_form.dart,
    apps/mobile/lib/features/transport/screens/weighing_ticket_form.dart,
    apps/mobile/lib/features/transport/widgets/signature_pad.dart,
    apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart,
    apps/mobile/lib/features/transport/repositories/rotation_repository.dart,
    apps/mobile/lib/features/transport/repositories/weighing_ticket_repository.dart,
    apps/mobile/integration_test/weighing_ticket_offline_test.dart,
    apps/mobile/integration_test/rotation_test.dart
  </files>
  <read_first>
    - docs/design/phase-02/wireframes/weighing-ticket.png (from W0-P01 workshop — Tab Active 3 landscape)
    - apps/mobile/lib/core/sync/append_only_repository.dart (W0-P01)
    - apps/mobile/lib/features/foration/screens/drilled_hole_form.dart (W1-P02 pattern)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-32, D2-33, D2-82"
  </read_first>
  <behavior>
    - offline_ticket_numbering generates `<SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>` using device_short_id from secure storage (set on first launch) and SQLite-persisted counter scoped per (device, date)
    - weighing_ticket_form is landscape-optimized (Tab Active 3), large numeric inputs
    - signature_pad captures PNG → SHA-256 → returns blob hex
    - On submit: compute content_hash client-side, persist to local SQLite via AppendOnlyRepository with pending_sync=true and is_offline_generated=true
    - Confirmation modal "Ticket non modifiable. Confirmer."
  </behavior>
  <action>
    1. `offline_ticket_numbering.dart`: class with `Future<String> generate({ required String siteCode, required DateTime date })`. Reads device_short_id from flutter_secure_storage (initialize on first call). Reads counter from Drift table `ticket_counter (device_id, yyyymmdd, last_seq)`. Increments and returns formatted string.
    2. `signature_pad.dart`: wraps `signature` package; on save compresses PNG to max 200KB, computes SHA-256 via `crypto` package, returns `{ blob_bytes, sha256_hex }`.
    3. `weighing_ticket_form.dart`: landscape layout. Fields: gross_kg, tare_kg (live net_kg display), truck (dropdown), driver (dropdown), material_type (chips), weighed_at (now() default), notes. Then 2 signature pads (client + driver). On submit: build canonical payload → compute SHA-256 content_hash via crypto → persist.
    4. `rotation_form.dart`: select existing weighing_ticket_id (or chain after weighing form), bench (loaded), zone (unloaded), material, loaded_at, unloaded_at (optional, can complete later).
    5. Integration test `weighing_ticket_offline_test.dart`: toggle airplane mode, create ticket, assert pending_sync row + content_hash present. Restore connectivity, assert sync pushes row, server-side hash recomputation matches.
    6. Integration test `rotation_test.dart`: create rotation linked to a ticket, complete it, assert event queued for outbox.
  </action>
  <verify>
    <automated>cd apps/mobile &amp;&amp; flutter test integration_test/weighing_ticket_offline_test.dart integration_test/rotation_test.dart</automated>
  </verify>
  <acceptance_criteria>
    - `apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart` exports `class OfflineTicketNumbering` with method `generate`
    - File contains regex or pattern matching `${siteCode}-${yyyymmdd}-${deviceId}-${seq}`
    - `signature_pad.dart` contains `SignaturePad` widget and imports `crypto`
    - `weighing_ticket_form.dart` contains `SignaturePad(` (composition with widget)
    - `weighing_ticket_form.dart` contains string `content_hash`
    - Integration test asserts offline ticket creation persists with `pending_sync` and `is_offline_generated`
    - `cd apps/mobile && flutter test integration_test/weighing_ticket_offline_test.dart` exits 0
  </acceptance_criteria>
  <done>TRP-02 offline ticket with signatures + numbering working end-to-end.</done>
</task>

<task type="auto">
  <name>Task 5: Refine ADR-0009 (weighing ticket offline numbering)</name>
  <files>docs/adr/ADR-0009-weighing-ticket-offline-numbering.md</files>
  <read_first>
    - docs/adr/ADR-0009-weighing-ticket-offline-numbering.md (draft from W0-P01)
    - apps/api/src/modules/transport/services/ticket-number-generator.service.ts (Task 1)
    - apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart (Task 4)
  </read_first>
  <action>
    Update ADR: change `## Status` from "Draft" to "Accepted (2026-MM-DD)". Add `## Implementation Notes` section linking to ticket-number-generator.service.ts and offline_ticket_numbering.dart. Document the regex `^[A-Z0-9]{2,10}-\d{8}-[A-Z0-9]{2,10}-\d{4,}$`. Document content_hash canonical payload field order. Reference Task 1 and Task 4 above.
  </action>
  <verify>
    <automated>node -e "const c=require('fs').readFileSync('docs/adr/ADR-0009-weighing-ticket-offline-numbering.md','utf8'); if(!c.includes('Accepted')||!c.includes('Implementation Notes')||!c.includes('content_hash')){console.error('Missing required sections');process.exit(1);}console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - ADR contains `## Status` followed by `Accepted`
    - ADR contains `## Implementation Notes`
    - ADR contains `content_hash` mention
    - ADR contains regex pattern or format string `SITE_CODE`
  </acceptance_criteria>
  <done>ADR-0009 promoted to Accepted with implementation refs.</done>
</task>

</tasks>

<verification>
- All transport tests green
- Web transport builds
- Mobile offline weighing test green (key offline-first proof for TRP-02)
- Outbox event production.transport.rotation_completed visible (will be consumed in W2-P05)
- ADR-0009 refined to Accepted
</verification>

<success_criteria>
- TRP-01, TRP-02, TRP-03 all covered
- Content hash verification path proven (client computes, server verifies)
- Offline numbering format compliant SITE-YYYYMMDD-DEVICE-SEQ
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W2-P04-SUMMARY.md`.
</output>
