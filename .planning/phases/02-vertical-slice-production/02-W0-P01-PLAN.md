---
phase: 02-vertical-slice-production
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - apps/api/src/modules/outbox/outbox.module.ts
  - apps/api/src/modules/outbox/outbox-event.entity.ts
  - apps/api/src/modules/outbox/outbox-worker.processor.ts
  - apps/api/src/modules/outbox/tests/outbox-roundtrip.spec.ts
  - apps/api/src/modules/alerts/alerts.module.ts
  - apps/api/src/modules/alerts/alert.entity.ts
  - apps/api/src/modules/alerts/alerts.controller.ts
  - apps/api/src/modules/alerts/alerts.service.ts
  - apps/api/src/modules/alerts/tests/alerts.e2e-spec.ts
  - apps/api/src/common/chain-of-hash/event-chain.verifier.ts
  - apps/api/src/common/chain-of-hash/event-chain.verifier.spec.ts
  - apps/api/src/modules/master-data/production-equipment.entity.ts
  - apps/api/src/modules/master-data/production-equipment.controller.ts
  - apps/api/src/modules/master-data/production-equipment.service.ts
  - apps/api/src/modules/master-data/tests/production-equipment.spec.ts
  - apps/api/src/modules/i18n/locales/fr/foration.json
  - apps/api/src/modules/i18n/locales/en/foration.json
  - apps/api/src/modules/i18n/locales/ar/foration.json
  - apps/api/src/modules/i18n/locales/fr/extraction.json
  - apps/api/src/modules/i18n/locales/en/extraction.json
  - apps/api/src/modules/i18n/locales/ar/extraction.json
  - apps/api/src/modules/i18n/locales/fr/transport.json
  - apps/api/src/modules/i18n/locales/en/transport.json
  - apps/api/src/modules/i18n/locales/ar/transport.json
  - apps/api/src/modules/i18n/locales/fr/stockpile.json
  - apps/api/src/modules/i18n/locales/en/stockpile.json
  - apps/api/src/modules/i18n/locales/ar/stockpile.json
  - apps/api/src/modules/i18n/locales/fr/fuel.json
  - apps/api/src/modules/i18n/locales/en/fuel.json
  - apps/api/src/modules/i18n/locales/ar/fuel.json
  - apps/api/src/modules/i18n/locales/fr/hse.json
  - apps/api/src/modules/i18n/locales/en/hse.json
  - apps/api/src/modules/i18n/locales/ar/hse.json
  - apps/api/src/modules/i18n/locales/fr/dashboard.json
  - apps/api/src/modules/i18n/locales/en/dashboard.json
  - apps/api/src/modules/i18n/locales/ar/dashboard.json
  - apps/api/src/modules/i18n/locales/fr/alerts.json
  - apps/api/src/modules/i18n/locales/en/alerts.json
  - apps/api/src/modules/i18n/locales/ar/alerts.json
  - apps/mobile/integration_test/_fixtures/mock_gps.dart
  - apps/mobile/integration_test/_fixtures/mock_operational_day.dart
  - apps/mobile/integration_test/_fixtures/mock_photo_blobs.dart
  - apps/mobile/lib/core/sync/append_only_repository.dart
  - apps/web/src/app/core/sse/sse-client.service.ts
  - apps/web/src/app/core/sse/sse-client.service.spec.ts
  - infra/modules/s3-objectlock/main.tf
  - infra/modules/s3-objectlock/variables.tf
  - infra/modules/s3-objectlock/outputs.tf
  - infra/modules/s3-objectlock/tests/s3-objectlock.tftest.hcl
  - infra/keycloak/realms/gravel/roles/phase-02.json
  - docs/design/phase-02/provisional-wireframes.md
  - docs/operations/parallel-tracks.md
  - docs/operations/legal-review-queue.md
  - docs/operations/procurement-queue.md
  - docs/adr/ADR-0006-stockpile-event-sourcing.md
  - docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md
  - docs/adr/ADR-0008-hse-incident-immutability-capa.md
  - docs/adr/ADR-0009-weighing-ticket-offline-numbering.md
  - docs/adr/ADR-0010-sse-dashboard-push.md
autonomous: true
requirements: [FOR-05, STK-01, STK-02, CAR-01, HSE-01, HSE-02, DSH-01]
user_setup:
  - service: aws-s3
    why: "HSE attachments bucket with Object Lock requires AWS account access"
    env_vars:
      - name: AWS_HSE_BUCKET_REGION
        source: "Decided per tenant region (af-south-1 / eu-west-3)"
    dashboard_config:
      - task: "Confirm Object Lock Governance retention 7 years aligns with OHADA policy"
        location: "AWS Console -> S3"
  - service: keycloak
    why: "Add 7 new Phase 2 roles into gravel realm"
    dashboard_config:
      - task: "Import phase-02.json roles via kcadm.sh or terraform-provider-keycloak"
        location: "Keycloak Admin -> gravel realm -> Roles"

must_haves:
  truths:
    - "Provisional wireframes derived from CONTEXT.md are documented in docs/design/phase-02/provisional-wireframes.md (co-design workshop tracked as parallel non-blocking track in docs/operations/parallel-tracks.md)"
    - "Generic event-chain verifier exists and detects single-byte corruption on 100-event fixture"
    - "Outbox module accepts events transactionally and BullMQ worker drains them at-least-once"
    - "Alerts module exposes CRUD endpoints and accepts events from EventEmitter2 channels"
    - "S3 HSE bucket exists with Object Lock Governance mode + 7-year retention"
    - "7 Phase 2 Keycloak roles are loadable into gravel realm"
    - "production_equipment table is CRUDable from master-data UI and blocks non-active drills"
    - "5 ADR drafts exist (ADR-0006..0010) — refinement deferred to respective waves"
    - "i18n FR/EN namespaces exist for 8 new domains"
    - "SSE client scaffold connects with Last-Event-ID resume"
  artifacts:
    - path: "apps/api/src/modules/outbox/outbox-event.entity.ts"
      provides: "Transactional outbox row used by W2 stockpile inflow"
      contains: "outbox_event"
    - path: "apps/api/src/common/chain-of-hash/event-chain.verifier.ts"
      provides: "Generic chain verifier reused by stockpile_event, fuel_tank_event, hse_incident"
      exports: ["EventChainVerifier", "verifyChain"]
    - path: "apps/api/src/modules/alerts/alert.entity.ts"
      provides: "Persistent alert state machine open|acked|resolved"
    - path: "apps/api/src/modules/master-data/production-equipment.entity.ts"
      provides: "Light equipment registry (drill|excavator|truck|generator), status active|maintenance|out_of_service"
      contains: "production_equipment"
    - path: "infra/modules/s3-objectlock/main.tf"
      provides: "OpenTofu module: bucket Governance retention 7y"
    - path: "docs/design/phase-02/co-design-workshop-readout.md"
      provides: "Validated wireframes — signed by 5 participants"
    - path: "docs/adr/ADR-0006-stockpile-event-sourcing.md"
      provides: "Stockpile design decision record (draft)"
  key_links:
    - from: "apps/api/src/modules/outbox/outbox-worker.processor.ts"
      to: "@nestjs/event-emitter EventEmitter2"
      via: "BullMQ job dispatch -> emitter.emit"
      pattern: "this\\.emitter\\.emit\\("
    - from: "apps/api/src/modules/alerts/alerts.service.ts"
      to: "EventEmitter2 listeners"
      via: "@OnEvent decorators"
      pattern: "@OnEvent\\('production\\.|hse\\."
    - from: "apps/web/src/app/core/sse/sse-client.service.ts"
      to: "EventSource native"
      via: "new EventSource(url, { withCredentials: true })"
      pattern: "new EventSource\\("
---

<objective>
Establish Phase 2 foundations BEFORE any business module work. This wave is BLOCKING for mobile production code (W1+) due to the co-design workshop requirement (D2-83). Deliver: (1) transactional outbox + worker, (2) alerts module scaffold, (3) generic event-chain verifier reused by 3 event tables, (4) production_equipment master-data, (5) i18n namespaces FR/EN/AR (3 langues exactes — pas de langues locales CI) for 8 new domains, (6) mobile fixtures + sync scaffold, (7) SSE web client scaffold, (8) S3 Object Lock bucket via OpenTofu, (9) 7 new Keycloak roles, (10) 5 ADR drafts (ADR-0006..0010), (11) co-design workshop with 5 field operators.

Purpose: All subsequent waves depend on this scaffolding. Without it, W1 mobile work cannot validate UX, W2 stockpile cannot use outbox, W3 dashboard cannot push via SSE.

Output: Reusable components, scaffolding files, 5 ADR drafts, workshop readout doc.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-VALIDATION.md
@.planning/phases/01-foundation/01-CONTEXT.md
@docs/adr/ADR-0001-rls-multi-tenancy.md
@docs/adr/ADR-0002-powersync-sync-engine.md
@docs/adr/ADR-0003-operational-day-model.md
@docs/adr/ADR-0004-audit-chain-of-hash.md
@apps/api/src/modules/audit/
@apps/api/src/modules/sync/
@apps/api/src/modules/master-data/
@apps/api/src/modules/i18n/

<interfaces>
From Phase 1 (already exists):
- `@SyncEntity({ strategy: 'append_only_event' | 'event_sourced_ledger' | 'pessimistic_lock' | 'last_write_wins' })` decorator
- `TenantScopedRepository<T>` base class with CLS-injected tenant_id
- `@Auditable()` decorator (triggers chain-of-hash insertion in audit_log)
- `OperationalDayResolver` service exposing `resolveForSite(siteId, instant): Promise<OperationalDay>`
- Money tuple: `{ amount_minor: bigint, currency: char(3), fx_rate_id?: uuid }`

To be created in this plan (W0):
- `EventChainVerifier.verifyChain(tableName: string, tenantId: string): Promise<{ valid: boolean; brokenAt?: { id: string; expected: Buffer; found: Buffer } }>`
- `OutboxEventEntity { id: uuid, tenant_id: uuid, aggregate_type: string, aggregate_id: uuid, event_type: string, payload: jsonb, created_at_utc: timestamptz, dispatched_at_utc: timestamptz?, attempts: int }`
- `AlertEntity { id, tenant_id, site_id, source_event_type, severity (low|med|high|critical), status (open|acked|resolved), recipients (uuid[]), payload jsonb, created_at_utc, acked_at_utc?, acked_by?, resolved_at_utc?, resolved_by? }`
- `ProductionEquipmentEntity { id, tenant_id, site_id, code (varchar 50), label (varchar 200), type ENUM('drill','excavator','truck','generator'), status ENUM('active','maintenance','out_of_service'), specs jsonb, created_at, updated_at }`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Provisional wireframes + parallel-tracks register (co-design non-blocking)</name>
  <files>
    docs/design/phase-02/provisional-wireframes.md,
    docs/operations/parallel-tracks.md,
    docs/operations/legal-review-queue.md,
    docs/operations/procurement-queue.md
  </files>
  <read_first>
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-11", §"D2-20", §"D2-30..D2-33", §"D2-51", §"D2-60", §"D2-81..D2-83"
    - .planning/phases/02-vertical-slice-production/02-VALIDATION.md §"Manual-Only Verifications"
  </read_first>
  <action>
    Create `docs/design/phase-02/provisional-wireframes.md` describing in ASCII/markdown the 6 mobile screens derived directly from CONTEXT.md fields (no workshop required). One section per screen with:
      - Header: screen name (Foration hole entry, Extraction cycle, Truck rotation, Weighing ticket, Equipment refuel, HSE incident)
      - Fields list: copy field names + types verbatim from CONTEXT.md D2-11 / D2-20 / D2-30 / D2-31 / D2-51 / D2-60
      - Ergonomics constraints from D2-81 (56dp buttons, sunlight contrast, GPS accuracy indicator red>30m / amber>10m / green)
      - Explicit marker `> Note: provisional wireframes — to be refined by parallel co-design track (see docs/operations/parallel-tracks.md). Code will be tagged // TODO(co-design): valider en atelier.`

    Create `docs/operations/parallel-tracks.md` with a markdown table:
      | Track | Status | Owner | Due | Blocks code? | Notes |
      Rows: co-design-workshop (scheduled, TBD, TBD, NO, "Refine wireframes — generates PR adjustments later"), device-procurement (scheduled, TBD, TBD, NO, "XCover Pro 6 + Tab Active 3 quantities — code targets Android 11+ minimum spec until then"), aggrid-license-decision (n/a, n/a, n/a, NO, "Phase 2 uses Community — Enterprise not on roadmap")

    Create `docs/operations/legal-review-queue.md` with table:
      | Item | Why | Status | Default applied while pending |
      Row: s3-object-lock-7y-retention (HSE attachments OHADA audit alignment, pending, "Governance mode applied per D2-61 — switchable to Compliance after legal sign-off")

    Create `docs/operations/procurement-queue.md` with table:
      | Item | Quantity | Status | Mitigation while pending |
      Rows: samsung-xcover-pro-6 (TBD, scheduled, "Test emulator Pixel 6 Android 13 + any available Android 11+ device"), samsung-tab-active-3 (TBD, scheduled, "Test emulator Pixel Tablet — weighing screen still developed against documented specs")
  </action>
  <acceptance_criteria>
    - File `docs/design/phase-02/provisional-wireframes.md` exists and contains exactly 6 `## ` headings matching: Foration, Extraction, Truck Rotation, Weighing Ticket, Equipment Refuel, HSE Incident
    - File contains string `// TODO(co-design)` at least once
    - File `docs/operations/parallel-tracks.md` contains string `co-design-workshop` and column `Blocks code?` with value `NO`
    - File `docs/operations/legal-review-queue.md` contains string `s3-object-lock-7y-retention` and `Governance mode applied`
    - File `docs/operations/procurement-queue.md` contains strings `samsung-xcover-pro-6` and `samsung-tab-active-3`
  </acceptance_criteria>
  <verify>
    Run: grep -c "^## " docs/design/phase-02/provisional-wireframes.md  → expect ≥ 6
    Run: grep -c "Blocks code?" docs/operations/parallel-tracks.md  → expect ≥ 1
  </verify>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Generic event-chain verifier (reused by 3 event tables W2/W3)</name>
  <files>
    apps/api/src/common/chain-of-hash/event-chain.verifier.ts,
    apps/api/src/common/chain-of-hash/event-chain.verifier.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/audit/audit-chain.verifier.ts (Phase 1 audit chain verifier — extend its algorithm)
    - apps/api/src/modules/audit/audit-chain.verifier.spec.ts (test pattern to mirror)
    - docs/adr/ADR-0004-audit-chain-of-hash.md (chain pattern reference)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-40, D2-50, D2-60" (3 tables using chain)
  </read_first>
  <behavior>
    - Given 100 valid events with proper prev_hash/row_hash chain: verifyChain returns { valid: true }
    - Given a single byte corrupted in event[50].row_hash: verifyChain returns { valid: false, brokenAt: { id: event[50].id, expected: <hash>, found: <hash> } }
    - Given an inserted phantom event between event[30] and event[31]: verifyChain returns { valid: false, brokenAt: id of event[31] }
    - Genesis event (prev_hash = SHA256('\\x00' * 32)) is accepted as chain head
    - Verifier works on any table name passed as parameter, expects columns: id (uuid), tenant_id (uuid), prev_hash (bytea), row_hash (bytea), occurred_at_utc (timestamptz), and a canonical_payload getter
  </behavior>
  <action>
    Create `EventChainVerifier` class with method `async verifyChain(tableName: 'stockpile_event' | 'fuel_tank_event' | 'hse_incident', tenantId: string, opts?: { since?: Date }): Promise<{ valid: boolean; eventsChecked: number; brokenAt?: { id: string; expected_hex: string; found_hex: string; reason: string } }>`. Algorithm: SELECT id, prev_hash, row_hash, canonical_payload_bytes (computed column or assembled from raw fields per table schema) FROM tableName WHERE tenant_id = $1 [AND occurred_at_utc >= since] ORDER BY occurred_at_utc, id. For each row, recompute `expected = sha256(prev_hash || canonical_payload_bytes)`. Compare to stored `row_hash`. Check that current `prev_hash` equals previous row's `row_hash`. Genesis row: `prev_hash` must equal 32 zero bytes. Use pg client directly via `@InjectDataSource()`. Export as injectable @Injectable() class. Write spec that seeds 100 events into a test table, then tests three scenarios above using a Jest beforeEach that injects corruption.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- event-chain.verifier.spec</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` exports class `EventChainVerifier` with method `verifyChain`
    - File contains string `sha256` and string `prev_hash`
    - Spec file contains test names: "detects single-byte corruption in row_hash", "detects phantom event insertion", "accepts valid 100-event chain"
    - `pnpm --filter=@gravel/api test event-chain.verifier` exits 0
    - Spec asserts `result.valid === false` for both corruption scenarios
  </acceptance_criteria>
  <done>Generic verifier passes all 3 corruption scenarios on 100-event fixture.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Outbox module + BullMQ worker (transactional outbox)</name>
  <files>
    apps/api/src/modules/outbox/outbox.module.ts,
    apps/api/src/modules/outbox/outbox-event.entity.ts,
    apps/api/src/modules/outbox/outbox.service.ts,
    apps/api/src/modules/outbox/outbox-worker.processor.ts,
    apps/api/src/modules/outbox/migrations/1715000000000__create_outbox_event.sql,
    apps/api/src/modules/outbox/tests/outbox-roundtrip.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/audit/ (pattern of transactional triggers from Phase 1)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-35 outbox pattern"
    - .planning/phases/01-foundation/01-W2-P03-SUMMARY.md (BullMQ Redis already configured)
  </read_first>
  <behavior>
    - Inserting an OutboxEvent inside an explicit transaction commits both business row and outbox row atomically
    - BullMQ worker drains outbox_event WHERE dispatched_at_utc IS NULL ORDER BY created_at_utc
    - Failed dispatch increments attempts; after 5 attempts moves to outbox_event_dead_letter table
    - Successful dispatch sets dispatched_at_utc and emits to EventEmitter2 via emitter.emit(event_type, payload)
    - Roundtrip test: insert 10 outbox events in tx, worker processes within 5s, all reach a test listener
  </behavior>
  <action>
    Create migration creating table `outbox_event (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, aggregate_type VARCHAR(100) NOT NULL, aggregate_id UUID NOT NULL, event_type VARCHAR(150) NOT NULL, payload JSONB NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), dispatched_at_utc TIMESTAMPTZ NULL, attempts INT NOT NULL DEFAULT 0, last_error TEXT NULL)` with INDEX idx_outbox_pending ON outbox_event (created_at_utc) WHERE dispatched_at_utc IS NULL. Apply RLS policy per ADR-0001. Create `OutboxEvent` TypeORM entity. `OutboxService.publish(opts: { aggregateType, aggregateId, eventType, payload, manager: EntityManager }): Promise<void>` — must accept caller's EntityManager so insert happens in their tx. Create BullMQ processor with cron every 2 seconds: SELECT FOR UPDATE SKIP LOCKED LIMIT 50, dispatch via injected EventEmitter2, UPDATE dispatched_at_utc, on failure UPDATE attempts. Write spec that opens tx, publishes 10 events + business rows, commits, asserts within 5s all events reach a `@OnEvent` listener attached in test setup.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- outbox-roundtrip.spec</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/api/src/modules/outbox/outbox-event.entity.ts` exports `@Entity('outbox_event')` class with columns matching schema above
    - File contains `dispatched_at_utc` and `attempts INT`
    - Migration SQL contains `CREATE TABLE outbox_event` and `CREATE INDEX idx_outbox_pending`
    - Processor contains string `SELECT FOR UPDATE SKIP LOCKED`
    - `pnpm --filter=@gravel/api test outbox-roundtrip` exits 0
  </acceptance_criteria>
  <done>Outbox roundtrip spec proves transactional insert + worker dispatch + listener receipt.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Alerts module scaffold (consumes domain events)</name>
  <files>
    apps/api/src/modules/alerts/alerts.module.ts,
    apps/api/src/modules/alerts/alert.entity.ts,
    apps/api/src/modules/alerts/alerts.service.ts,
    apps/api/src/modules/alerts/alerts.controller.ts,
    apps/api/src/modules/alerts/alerts.event-handlers.ts,
    apps/api/src/modules/alerts/migrations/1715000100000__create_alert.sql,
    apps/api/src/modules/alerts/tests/alerts.e2e-spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/audit/audit.module.ts (pattern for module wiring + TenantGuard)
    - apps/api/src/modules/identity/role.guard.ts (RBAC pattern)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-74 Moteur d'alertes"
  </read_first>
  <behavior>
    - Listens on events: `production.stockpile.threshold_crossed`, `production.fuel.anomaly_detected`, `hse.incident.created`
    - Creates one Alert row per event (idempotent: dedupe by `source_event_id` if present in payload)
    - Exposes REST: GET /alerts?status=open|acked|resolved&site_id, POST /alerts/:id/ack, POST /alerts/:id/resolve
    - Threshold-crossing alert: 1 alert per crossing (not 1 per hour spam) — dedupe by `(stockpile_id, calibre_code, threshold_type)` with status='open'
  </behavior>
  <action>
    Migration creates `alert (id UUID PK, tenant_id UUID NOT NULL, site_id UUID NOT NULL, source_event_type VARCHAR(150) NOT NULL, source_event_id VARCHAR(200) NULL, dedupe_key VARCHAR(300) NULL, severity VARCHAR(20) NOT NULL CHECK (severity IN ('low','medium','high','critical')), status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','acked','resolved')), recipients UUID[] NOT NULL DEFAULT '{}', payload JSONB NOT NULL, channel_email_sent_at TIMESTAMPTZ NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), acked_at_utc TIMESTAMPTZ NULL, acked_by UUID NULL, resolved_at_utc TIMESTAMPTZ NULL, resolved_by UUID NULL)` with UNIQUE (tenant_id, dedupe_key) WHERE status='open' AND dedupe_key IS NOT NULL. RLS policy applied. Entity with @SyncEntity not required (web-only read). AlertsService: createFromEvent(eventType, payload), ack(id, userId), resolve(id, userId). Event-handlers file uses @OnEvent for the 3 channels. Email channel: stub call to SES (real send Wave 3). E2E spec: emit each of 3 events, assert one alert row per emission, assert dedupe on duplicate threshold event.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- alerts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/modules/alerts/alert.entity.ts` exports `@Entity('alert')` class with status enum `open|acked|resolved`
    - File contains `severity` enum and `dedupe_key`
    - Event handlers file contains `@OnEvent('production.stockpile.threshold_crossed')`, `@OnEvent('production.fuel.anomaly_detected')`, `@OnEvent('hse.incident.created')`
    - Controller exposes `POST /alerts/:id/ack` and `POST /alerts/:id/resolve`
    - `pnpm --filter=@gravel/api test alerts` exits 0
    - Spec asserts dedupe prevents duplicate open alerts for same threshold
  </acceptance_criteria>
  <done>Alerts module accepts 3 event types, dedupes thresholds, exposes ack/resolve REST.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: production_equipment master-data entity + CRUD + drill-status guard hook</name>
  <files>
    apps/api/src/modules/master-data/production-equipment.entity.ts,
    apps/api/src/modules/master-data/production-equipment.controller.ts,
    apps/api/src/modules/master-data/production-equipment.service.ts,
    apps/api/src/modules/master-data/migrations/1715000200000__create_production_equipment.sql,
    apps/api/src/modules/master-data/tests/production-equipment.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/master-data/site.entity.ts (pattern reference)
    - apps/api/src/modules/master-data/zone.entity.ts (TenantScopedRepository extension)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-14 Foreuse en panne"
  </read_first>
  <behavior>
    - CRUD endpoints scoped to tenant + site_id from JWT
    - PATCH /equipment/:id/status accepts {status: 'active'|'maintenance'|'out_of_service'} and writes audit log entry
    - Service method `assertActive(equipmentId): Promise<void>` throws BadRequestException('EQUIPMENT_NOT_ACTIVE') if status != 'active'
    - 4 types accepted: drill, excavator, truck, generator
  </behavior>
  <action>
    Migration: `CREATE TYPE equipment_type AS ENUM ('drill','excavator','truck','generator'); CREATE TYPE equipment_status AS ENUM ('active','maintenance','out_of_service'); CREATE TABLE production_equipment (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL REFERENCES site(id), code VARCHAR(50) NOT NULL, label VARCHAR(200) NOT NULL, type equipment_type NOT NULL, status equipment_status NOT NULL DEFAULT 'active', specs JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, site_id, code))`. RLS policy applied. @Auditable() decorator. Entity extends TenantScopedRepository. Controller: POST/GET/GET-by-id/PATCH/DELETE + PATCH /:id/status. Service.assertActive(id) used by W1 foration. Spec tests: create equipment, list, update status, assertActive rejects maintenance.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- production-equipment</automated>
  </verify>
  <acceptance_criteria>
    - Migration SQL contains `CREATE TYPE equipment_type AS ENUM ('drill','excavator','truck','generator')`
    - Migration SQL contains `CREATE TYPE equipment_status AS ENUM ('active','maintenance','out_of_service')`
    - Entity file contains `@Entity('production_equipment')` and column `status` typed as equipment_status
    - Service contains method `assertActive`
    - `pnpm --filter=@gravel/api test production-equipment` exits 0
    - Spec asserts `assertActive` throws when status='maintenance'
  </acceptance_criteria>
  <done>production_equipment CRUD + status guard usable by W1 foration plan service.</done>
</task>

<task type="auto">
  <name>Task 6: i18n FR/EN/AR namespaces for 8 Phase 2 domains + mobile fixtures + SSE web scaffold</name>
  <files>
    apps/api/src/modules/i18n/locales/fr/foration.json,
    apps/api/src/modules/i18n/locales/en/foration.json,
    apps/api/src/modules/i18n/locales/ar/foration.json,
    apps/api/src/modules/i18n/locales/fr/extraction.json,
    apps/api/src/modules/i18n/locales/en/extraction.json,
    apps/api/src/modules/i18n/locales/ar/extraction.json,
    apps/api/src/modules/i18n/locales/fr/transport.json,
    apps/api/src/modules/i18n/locales/en/transport.json,
    apps/api/src/modules/i18n/locales/ar/transport.json,
    apps/api/src/modules/i18n/locales/fr/stockpile.json,
    apps/api/src/modules/i18n/locales/en/stockpile.json,
    apps/api/src/modules/i18n/locales/ar/stockpile.json,
    apps/api/src/modules/i18n/locales/fr/fuel.json,
    apps/api/src/modules/i18n/locales/en/fuel.json,
    apps/api/src/modules/i18n/locales/ar/fuel.json,
    apps/api/src/modules/i18n/locales/fr/hse.json,
    apps/api/src/modules/i18n/locales/en/hse.json,
    apps/api/src/modules/i18n/locales/ar/hse.json,
    apps/api/src/modules/i18n/locales/fr/dashboard.json,
    apps/api/src/modules/i18n/locales/en/dashboard.json,
    apps/api/src/modules/i18n/locales/ar/dashboard.json,
    apps/api/src/modules/i18n/locales/fr/alerts.json,
    apps/api/src/modules/i18n/locales/en/alerts.json,
    apps/api/src/modules/i18n/locales/ar/alerts.json,
    apps/mobile/integration_test/_fixtures/mock_gps.dart,
    apps/mobile/integration_test/_fixtures/mock_operational_day.dart,
    apps/mobile/integration_test/_fixtures/mock_photo_blobs.dart,
    apps/mobile/lib/core/sync/append_only_repository.dart,
    apps/web/src/app/core/sse/sse-client.service.ts,
    apps/web/src/app/core/sse/sse-client.service.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/i18n/locales/fr/master-data.json (pattern from Phase 1)
    - apps/mobile/lib/core/sync/ (existing Phase 1 sync scaffold)
    - apps/web/src/app/core/auth/auth.service.ts (Phase 1 reactive service pattern)
  </read_first>
  <action>
    1. Create **24 JSON locale files** (8 namespaces × 3 langues exactes : fr/en/ar), each with at least 15 keys covering common terms (e.g., foration: { "drilling_plan": "Plan de forage" / "Drilling plan" / "خطة الحفر", "drilled_hole": "Trou foré" / "Drilled hole" / "حفرة محفورة", "depth": "Profondeur" / "Depth" / "العمق", ... }). Naming pattern `<module>.<feature>.<key>` per Phase 1 convention. **Ne pas créer Dioula/Baoulé ou autres langues locales** (décision utilisateur — feedback memory `feedback_i18n_scope.md`).
    2. Mobile fixtures: mock_gps.dart exports `MockGpsPoint(lat, lng, accuracyM)` factory. mock_operational_day.dart exports `MockOperationalDay(siteId, shiftStartLocal, ianaTz)`. mock_photo_blobs.dart exports `MockPhotoBlob(sha256Hex, sizeKb, content)`.
    3. append_only_repository.dart: abstract `AppendOnlyRepository<T extends SyncEntity>` with method `appendLocal(T entity): Future<void>` that writes to Drift local table with `pending_sync=true`, generates client-side UUID, sets `created_at_local` + IANA TZ, never updates after creation. Used by W1+ entities.
    4. SseClientService: Angular service wrapping native EventSource, with `connect<T>(url: string, opts?: { lastEventId?: string }): Observable<T>` using RxJS Subject, exponential backoff retry on 'error' event, persists `Last-Event-ID` in sessionStorage per channel. Spec: mock EventSource (jest), assert reconnect on error with lastEventId header.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web test -- sse-client.service.spec &amp;&amp; ls apps/api/src/modules/i18n/locales/fr/foration.json apps/api/src/modules/i18n/locales/en/dashboard.json</automated>
  </verify>
  <acceptance_criteria>
    - 24 locale files exist (8 namespaces × 3 languages: fr/en/ar)
    - No `dioula/`, `baoule/`, `wolof/` or other local-language directories under `apps/api/src/modules/i18n/locales/`
    - Each locale file is valid JSON with at least 10 keys
    - `apps/mobile/lib/core/sync/append_only_repository.dart` exports class `AppendOnlyRepository`
    - `apps/web/src/app/core/sse/sse-client.service.ts` exports `SseClientService` with method `connect`
    - SSE spec asserts reconnect uses Last-Event-ID
    - `pnpm --filter=@gravel/web test sse-client` exits 0
  </acceptance_criteria>
  <done>i18n namespaces ready, mobile fixtures available for W1 tests, SSE client ready for W3 dashboard.</done>
</task>

<task type="auto">
  <name>Task 7: OpenTofu S3 Object Lock module + Keycloak Phase-2 roles</name>
  <files>
    infra/modules/s3-objectlock/main.tf,
    infra/modules/s3-objectlock/variables.tf,
    infra/modules/s3-objectlock/outputs.tf,
    infra/modules/s3-objectlock/tests/s3-objectlock.tftest.hcl,
    infra/keycloak/realms/gravel/roles/phase-02.json
  </files>
  <read_first>
    - infra/modules/ (Phase 1 OpenTofu modules to mirror style)
    - infra/keycloak/realms/gravel/ (existing realm config)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-61, D2-110"
  </read_first>
  <action>
    1. S3 module: create `aws_s3_bucket` with `object_lock_enabled = true`, `aws_s3_bucket_object_lock_configuration` with `rule { default_retention { mode = "GOVERNANCE", years = 7 } }`. Variables: `bucket_name`, `region`, `tags`. Outputs: `bucket_id`, `bucket_arn`. Include `aws_s3_bucket_versioning` (required by Object Lock) and `aws_s3_bucket_server_side_encryption_configuration` (AES256 SSE). Write `.tftest.hcl` running `tofu test` asserting `output.bucket_arn != ""` and `aws_s3_bucket_object_lock_configuration.rule[0].default_retention[0].mode == "GOVERNANCE"`.
    2. phase-02.json: array of 7 role definitions: OPERATOR_DRILLING, OPERATOR_EXCAVATOR, TRUCK_DRIVER, WEIGHING_OPERATOR, HSE_OFFICER, SITE_MANAGER, QUARRY_CHIEF. Each with `{ "name": "...", "description": "...", "composite": false, "clientRole": false }`. Document import command in inline comment.
  </action>
  <verify>
    <automated>cd infra/modules/s3-objectlock &amp;&amp; tofu init -backend=false &amp;&amp; tofu validate &amp;&amp; tofu test</automated>
  </verify>
  <acceptance_criteria>
    - `infra/modules/s3-objectlock/main.tf` contains `object_lock_enabled = true`
    - File contains `mode  = "GOVERNANCE"` and `years = 7`
    - File contains `aws_s3_bucket_versioning` resource
    - `infra/keycloak/realms/gravel/roles/phase-02.json` is valid JSON containing all 7 role names: OPERATOR_DRILLING, OPERATOR_EXCAVATOR, TRUCK_DRIVER, WEIGHING_OPERATOR, HSE_OFFICER, SITE_MANAGER, QUARRY_CHIEF
    - `tofu validate` exits 0 in module dir
    - `tofu test` exits 0
  </acceptance_criteria>
  <done>S3 Object Lock module reusable + 7 Phase 2 roles defined for Keycloak realm import.</done>
</task>

<task type="auto">
  <name>Task 8: 5 ADR drafts (ADR-0006..0010)</name>
  <files>
    docs/adr/ADR-0006-stockpile-event-sourcing.md,
    docs/adr/ADR-0007-fuel-event-sourcing-reconciliation.md,
    docs/adr/ADR-0008-hse-incident-immutability-capa.md,
    docs/adr/ADR-0009-weighing-ticket-offline-numbering.md,
    docs/adr/ADR-0010-sse-dashboard-push.md
  </files>
  <read_first>
    - docs/adr/ADR-0001-rls-multi-tenancy.md (template format reference)
    - docs/adr/ADR-0004-audit-chain-of-hash.md (chain pattern referenced by ADR-0006/0007/0008)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-40..D2-71"
  </read_first>
  <action>
    For each ADR, use template structure: `# Title`, `## Status` (draft — refined in Wave N), `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`, `## References`.
    - ADR-0006 (stockpile): event types STOCKPILE_INFLOW/OUTFLOW_SALE/ADJUSTMENT/TRANSFER per D2-40; partition BY RANGE (occurred_at_utc) monthly; cost_model_version=1 (carburant only, Phase 4 = version 2); chain-of-hash mandatory; outbox materialization from TruckRotation.
    - ADR-0007 (fuel): event types FUEL_DELIVERY_IN/DISPENSE_OUT/ADJUSTMENT/RECONCILIATION; nightly reconciliation 03:30 site-tz; alert if drift > 0.5% tank volume; cost_per_liter propagation to equipment refuel.
    - ADR-0008 (HSE): append-only HseIncident with chain-of-hash; severity≥4 blocks closure until CAPA verified; S3 Object Lock Governance 7y for attachments; chronology_md is append-only event HSE_INCIDENT_CHRONOLOGY_APPENDED.
    - ADR-0009 (weighing ticket): offline numbering format `<SITE>-<YYYYMMDD>-<DEVICE>-<SEQ>`; content_hash signs payload + signatures; net_kg generated column = gross_kg - tare_kg; no hardware integration Phase 2.
    - ADR-0010 (SSE): one-way server push; channel = (tenant_id, site_id, dashboard_key); Last-Event-ID resume; fallback polling 30s; WebSocket revisited Phase 4 if bidirectional needed.
    Each must include `## Status` line ending with "Draft — to be refined in Wave N".
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); ['ADR-0006-stockpile-event-sourcing','ADR-0007-fuel-event-sourcing-reconciliation','ADR-0008-hse-incident-immutability-capa','ADR-0009-weighing-ticket-offline-numbering','ADR-0010-sse-dashboard-push'].forEach(n => { const c = fs.readFileSync('docs/adr/'+n+'.md','utf8'); if (!c.includes('## Status') || !c.includes('## Decision') || !c.includes('## Consequences')) { console.error('Missing sections in '+n); process.exit(1); } }); console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - All 5 ADR files exist at `docs/adr/ADR-000{6,7,8,9,10}-*.md`
    - Each file contains sections: `## Status`, `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`
    - ADR-0006 contains string `STOCKPILE_INFLOW` and `cost_model_version`
    - ADR-0007 contains string `FUEL_RECONCILIATION` and `0.5`
    - ADR-0008 contains string `Object Lock` and `GOVERNANCE` and `7 years`
    - ADR-0009 contains string `SITE_CODE` and `DEVICE_SHORT_ID`
    - ADR-0010 contains string `Last-Event-ID` and `SSE`
  </acceptance_criteria>
  <done>5 ADR drafts committed; refinement happens in respective waves.</done>
</task>

</tasks>

<verification>
- All 8 tasks complete
- Co-design workshop readout signed (BLOCKING — W1 mobile cannot start without this)
- Event chain verifier proves 3 corruption scenarios on test fixture
- Outbox roundtrip green
- Alerts module wired to 3 domain events with dedupe
- production_equipment CRUD + assertActive guard usable
- 16 i18n locale files exist
- OpenTofu validate + test green for s3-objectlock module
- 5 ADR drafts in docs/adr/
</verification>

<success_criteria>
- `pnpm --filter=@gravel/api test event-chain.verifier outbox-roundtrip alerts production-equipment` exits 0
- `pnpm --filter=@gravel/web test sse-client` exits 0
- `cd infra/modules/s3-objectlock && tofu test` exits 0
- `docs/design/phase-02/provisional-wireframes.md` exists with 6 screen sections (co-design tracked as non-blocking parallel track)
- Plan committed to git
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W0-P01-SUMMARY.md` listing artifacts, decisions confirmed, ADR statuses (draft), and any blockers surfaced (operational prerequisites tracked in `docs/operations/parallel-tracks.md` are NOT blockers per user decision 2026-05-12).
</output>
