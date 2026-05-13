---
phase: 03-operational-completeness
plan: W1-P02
type: execute
wave: 1
autonomous: true
depends_on: [03-W0-P01]
files_modified:
  - apps/api/src/modules/tir/tir.module.ts
  - apps/api/src/modules/tir/entities/explosives-event.entity.ts
  - apps/api/src/modules/tir/entities/detonator.entity.ts
  - apps/api/src/modules/tir/entities/blast-plan.entity.ts
  - apps/api/src/modules/tir/entities/blast-charge.entity.ts
  - apps/api/src/modules/tir/entities/blast-report.entity.ts
  - apps/api/src/modules/tir/services/explosives-ledger.service.ts
  - apps/api/src/modules/tir/services/detonator.service.ts
  - apps/api/src/modules/tir/services/blast-plan.service.ts
  - apps/api/src/modules/tir/services/blast-charge.service.ts
  - apps/api/src/modules/tir/services/blast-report.service.ts
  - apps/api/src/modules/tir/services/blast-clearance.service.ts
  - apps/api/src/modules/tir/services/explosives-reconciliation.service.ts
  - apps/api/src/modules/tir/jobs/explosives-reconciliation.job.ts
  - apps/api/src/modules/tir/jobs/blast-clearance-timeout.job.ts
  - apps/api/src/modules/tir/saga/blast-plan-saga.handler.ts
  - apps/api/src/modules/tir/controllers/explosives-ledger.controller.ts
  - apps/api/src/modules/tir/controllers/blast-plan.controller.ts
  - apps/api/src/modules/tir/controllers/detonator.controller.ts
  - apps/api/src/modules/tir/controllers/blast-report.controller.ts
  - apps/api/src/modules/tir/migrations/1717100000000__create_explosives_event_partitioned.sql
  - apps/api/src/modules/tir/migrations/1717100100000__create_detonator.sql
  - apps/api/src/modules/tir/migrations/1717100200000__create_blast_plan.sql
  - apps/api/src/modules/tir/migrations/1717100300000__create_blast_charge.sql
  - apps/api/src/modules/tir/migrations/1717100400000__create_blast_report.sql
  - apps/api/src/modules/tir/tests/explosives-event-chain-integrity.spec.ts
  - apps/api/src/modules/tir/tests/detonator.spec.ts
  - apps/api/src/modules/tir/tests/blast-plan.spec.ts
  - apps/api/src/modules/tir/tests/blast-charge.spec.ts
  - apps/api/src/modules/tir/tests/blast-clearance-saga.spec.ts
  - apps/api/src/modules/tir/tests/explosives-recon.spec.ts
  - apps/api/src/modules/tir/tests/blast-report.spec.ts
  - apps/web/src/app/features/tir/tir.module.ts
  - apps/web/src/app/features/tir/tir-routes.ts
  - apps/web/src/app/features/tir/pages/explosives-ledger.component.ts
  - apps/web/src/app/features/tir/pages/blast-plan-list.component.ts
  - apps/web/src/app/features/tir/pages/blast-plan-detail.component.ts
  - apps/web/src/app/features/tir/pages/blast-report-form.component.ts
  - apps/web/src/app/features/tir/services/tir-api.service.ts
  - apps/mobile/lib/features/tir/repositories/blast_charge_repository.dart
  - apps/mobile/lib/features/tir/screens/blast_charge_form.dart
  - apps/mobile/integration_test/blast_charge_offline_test.dart
  - apps/api/src/modules/alerts/alerts.event-handlers.ts
  - apps/api/src/app.module.ts
  - apps/web/src/app/app.routes.ts
task_count: 4
requirements: [TIR-01, TIR-02, TIR-03, TIR-04, TIR-05, TIR-06, TIR-07]

must_haves:
  truths:
    - "Explosives events are append-only; UPDATE/DELETE raise restrict_violation; chain-of-hash detects single-byte tampering"
    - "Blast plan cannot advance to LOADED without TIR_MINE_CI habilitation check passing against RhHabilitationService.isValidAt"
    - "Blast plan cannot advance to FIRED without a blast_clearance token (tir.blast_plan.zone_cleared event received)"
    - "A blast charge detonator serial is tracked from IN_STOCK through LOADED to FIRED or RETURNED"
    - "ExplosivesReconciliationJob writes to OperationalDay.closure_blockers when gap > tolerance"
    - "blast_report is append-only with chain-of-hash"
    - "PDF snapshot of explosives event is generated asynchronously (not inside the append transaction)"
  artifacts:
    - path: "apps/api/src/modules/tir/entities/explosives-event.entity.ts"
      provides: "append-only explosives ledger with chain-of-hash"
      contains: "prev_hash, row_hash"
    - path: "apps/api/src/modules/tir/services/blast-plan.service.ts"
      provides: "blast plan state machine with habilitation gate"
      exports: ["BlastPlanService"]
    - path: "apps/api/src/modules/tir/saga/blast-plan-saga.handler.ts"
      provides: "EventEmitter2 listener for zone_cleared event"
    - path: "apps/api/src/modules/tir/jobs/explosives-reconciliation.job.ts"
      provides: "nightly reconciliation cron calling blockClosure"
  key_links:
    - from: "apps/api/src/modules/tir/services/blast-plan.service.ts"
      to: "apps/api/src/modules/rh/services/rh-habilitation.service.ts"
      via: "isValidAt(operatorId, 'TIR_MINE_CI', operationalDay.shiftStartLocal)"
      pattern: "rhHabilitationService\\.isValidAt"
    - from: "apps/api/src/modules/tir/saga/blast-plan-saga.handler.ts"
      to: "apps/api/src/modules/tir/services/blast-plan.service.ts"
      via: "@OnEvent('tir.blast_plan.zone_cleared') → transitionToFired(planId)"
    - from: "apps/api/src/modules/tir/jobs/explosives-reconciliation.job.ts"
      to: "apps/api/src/modules/operational-day/operational-day.service.ts"
      via: "operationalDayService.blockClosure(dayId, 'EXPLOSIVES_RECONCILIATION_GAP')"
    - from: "apps/api/src/modules/tir/services/explosives-ledger.service.ts"
      to: "apps/api/src/modules/outbox/outbox.service.ts"
      via: "outboxService.publish({ manager, eventType: 'tir.explosives_event.appended' })"
---

# Plan: 03-W1-P02 — Tir de Mine & Explosifs (TIR-01..TIR-07)

## Objective

Implement the full regulated explosives and blasting chain: an append-only SHA-256 chain-of-hash explosives ledger (TIR-01), individual detonator serial tracking from receipt to use (TIR-02), a blast-plan mutable state machine with HSE clearance saga (TIR-03 / TIR-05), per-hole blast charge entry with variance control (TIR-04), an immutable blast report with chain-of-hash (TIR-06), and a nightly reconciliation job that blocks OperationalDay closure when stock is unbalanced (TIR-07). This is the most complex plan in Phase 3 due to regulatory immutability + saga coordination.

**Purpose:** Compliance with Côte d'Ivoire explosives regulation — every gram accounted for, every blast authorized by HSE, no gap can silently slip through.
**Output:** 5 database tables (2 append-only partitioned, 1 mutable state machine, 1 append-only events, 1 append-only report), 8 backend services, 2 BullMQ jobs, 1 saga handler, 7 web components, offline mobile blast charge capture.

## Context

**From 03-W0-P01 (required):**
- `RhHabilitationService.isValidAt(employeeId, certCode, asOfDate)` — used to gate blast loading
- `OperationalDayService.blockClosure(dayId, reason)` — called by reconciliation job
- `EventChainVerifier.CANONICAL_PAYLOAD_SQL` pre-registered for `explosives_event` and `blast_report` — field order is frozen, do not change
- Keycloak roles: `TIR_OPERATOR`, `TIR_SUPERVISOR`, `HSE_OFFICER` (from Phase 2)
- i18n namespace `tir` (18 keys)

**From Phase 2 W0-P01:**
- `OutboxService.publish({ manager, eventType, payload })` — use for PDF snapshot event
- `EventChainVerifier.verifyChain(tableName, tenantId)` — reusable
- `AppendOnlyRepository<T>` Flutter contract for `blast_charge` offline capture
- S3 Object Lock OpenTofu module — same bucket for PDF snapshots

**From Phase 2 W2-P05 (stockpile):**
- `buildCanonicalPayload` + `sha256` helpers for chain-of-hash computation
- Monthly RANGE partitioning pattern with composite PK `(id, occurred_at_utc)`

**Critical pitfalls to avoid (from research):**
1. Do NOT add BEFORE UPDATE trigger on `blast_plan` — it is a mutable state machine, not append-only (Pitfall 1)
2. Do NOT call `isValidAt(id, code, new Date())` — must use `operationalDay.shiftStartLocal` (Pitfall 2)
3. PDF snapshot must be async via outbox — do not block the event append transaction (Pitfall 7)

**Interfaces from 03-W0-P01:**
```typescript
// apps/api/src/modules/rh/services/rh-habilitation.service.ts
export class RhHabilitationService {
  async isValidAt(employeeId: string, certCode: string, asOfDate: Date): Promise<boolean>
}

// apps/api/src/modules/operational-day/operational-day.service.ts (extended in W0-P01)
async blockClosure(dayId: string, reason: string): Promise<void>
async resolveClosure(dayId: string, reason: string): Promise<void>
```

## Tasks

### Task 1 — Explosives ledger (append-only, chain-of-hash) + Detonator tracking (TIR-01, TIR-02)

**Files:**
- `apps/api/src/modules/tir/entities/explosives-event.entity.ts`
- `apps/api/src/modules/tir/entities/detonator.entity.ts`
- `apps/api/src/modules/tir/services/explosives-ledger.service.ts`
- `apps/api/src/modules/tir/services/detonator.service.ts`
- `apps/api/src/modules/tir/controllers/explosives-ledger.controller.ts`
- `apps/api/src/modules/tir/controllers/detonator.controller.ts`
- `apps/api/src/modules/tir/migrations/1717100000000__create_explosives_event_partitioned.sql`
- `apps/api/src/modules/tir/migrations/1717100100000__create_detonator.sql`
- `apps/api/src/modules/tir/tests/explosives-event-chain-integrity.spec.ts`
- `apps/api/src/modules/tir/tests/detonator.spec.ts`

**Action:**

`explosives_event` table — monthly RANGE-partitioned append-only ledger:
```sql
CREATE TYPE explosives_product_type AS ENUM ('ANFO','EMULSION','DETONATEUR','CORDEAU');
CREATE TYPE explosives_event_type AS ENUM ('EXPLOSIVES_IN','EXPLOSIVES_OUT_LOAD','EXPLOSIVES_RETURN','EXPLOSIVES_DESTROY');

CREATE TABLE explosives_event (
  id               UUID NOT NULL DEFAULT uuid_generate_v4(),
  occurred_at_utc  TIMESTAMPTZ NOT NULL,
  tenant_id        UUID NOT NULL,
  site_id          UUID NOT NULL,
  operational_day_id UUID NOT NULL,
  event_type       explosives_event_type NOT NULL,
  product_type     explosives_product_type NOT NULL,
  quantity_g       BIGINT NOT NULL,           -- grams, signed: positive=IN, negative=OUT
  unit_price_minor BIGINT,
  currency         CHAR(3),
  supplier         VARCHAR(200),
  doc_reference    VARCHAR(200),
  blast_plan_id    UUID NULL,                 -- FK blast_plan when event_type = OUT_LOAD
  pdf_sha256       VARCHAR(64),               -- NULL until async PDF snapshot uploaded (see Pitfall 7)
  source_reference JSONB NOT NULL DEFAULT '{}',
  prev_hash        BYTEA NOT NULL,
  row_hash         BYTEA NOT NULL,
  created_by       UUID NOT NULL,
  PRIMARY KEY (id, occurred_at_utc)
) PARTITION BY RANGE (occurred_at_utc);
```

Add BEFORE UPDATE/DELETE trigger. Add exception: UPDATE of `pdf_sha256` is allowed ONLY when `OLD.pdf_sha256 IS NULL` (one-time fill after async upload). Implement this as a check in the trigger:
```sql
IF TG_OP = 'UPDATE' THEN
  IF OLD.pdf_sha256 IS NULL AND NEW.pdf_sha256 IS NOT NULL
     AND NEW.id = OLD.id AND NEW.row_hash = OLD.row_hash THEN
    RETURN NEW; -- allow only this one-time pdf backfill
  END IF;
  RAISE EXCEPTION 'restrict_violation';
END IF;
```

`ExplosivesLedgerService.append(dto, manager?)`:
1. Fetch `prevHash` from last row for this `(tenant_id, site_id)` (or genesis hash `0x00…00` if none)
2. Compute `canonicalPayload = buildCanonicalPayload({ event_type, product_type, quantity_g, site_id, operational_day_id, source_reference, occurred_at_utc })` (field order frozen per ADR-0012)
3. `rowHash = sha256(Buffer.concat([prevHash, Buffer.from(canonicalPayload)]))`
4. Insert row with `prev_hash = prevHash, row_hash = rowHash`
5. After insert commits: publish via `OutboxService` with `eventType: 'tir.explosives_event.appended'`, `payload: { event_id, site_id, tenant_id }` — for async PDF snapshot handler

`ExplosivesPdfSnapshotHandler` (listen for `tir.explosives_event.appended`): generate PDF register snapshot using `@pdfme/generator` (install via `pnpm add @pdfme/generator --filter=@gravel/api`; fallback to `pdfkit` if `@pdfme/generator` is not on npm at execute time — verify before installing), upload to S3 Object Lock GOVERNANCE bucket with `Content-Type: application/pdf`, then `UPDATE explosives_event SET pdf_sha256 = :hash WHERE id = :id AND pdf_sha256 IS NULL`.

`detonator` table (5 fields exactly — no scope creep):
```sql
CREATE TYPE detonator_status AS ENUM ('IN_STOCK','LOADED','FIRED','RETURNED','DESTROYED');

CREATE TABLE detonator (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL,
  serial_number    VARCHAR(100) NOT NULL,
  status           detonator_status NOT NULL DEFAULT 'IN_STOCK',
  received_in_event_id UUID NOT NULL REFERENCES explosives_event(id, occurred_at_utc) DEFERRABLE,
  blast_charge_id  UUID NULL,
  destroyed_at_utc TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, serial_number)
);
```

Note on FK to partitioned table: reference `explosives_event` without partition column in FK (Postgres supports this for partitioned tables with an explicit index). If FK with composite PK causes migration issues, use a simple `UUID NOT NULL` column without DB-level FK constraint, enforce referential integrity in service layer, and document this in migration comment.

`DetonatorService.receiveFromEvent(serialNumber, explosivesEventId)`: creates detonator in `IN_STOCK`.
`DetonatorService.load(serialNumber, blastChargeId)`: transitions `IN_STOCK → LOADED`, sets `blast_charge_id`.
`DetonatorService.fire(serialNumber)`: transitions `LOADED → FIRED`.
`DetonatorService.return(serialNumber)`: transitions `LOADED → RETURNED`.
`DetonatorService.destroy(serialNumber)`: transitions any status → `DESTROYED`, sets `destroyed_at_utc`.

Tests `explosives-event-chain-integrity.spec.ts` — 100-event fixture with injected corruption (mirror pattern from `stockpile-event-chain-integrity.spec.ts`):
- Genesis hash is 32 zero bytes
- 100 sequential appends compute correct chain
- Single-byte `row_hash` flip detected
- Phantom event splice detected (prev_hash mismatch)
- `pdf_sha256 IS NULL` on fresh append (async not yet executed)

Tests `detonator.spec.ts`:
- Serial tracked through full lifecycle `IN_STOCK → LOADED → FIRED`
- `IN_STOCK → RETURNED` transition
- Duplicate serial per tenant throws unique constraint
- Cannot transition from `FIRED` to any other status

**Commit:** `feat(03-tir): explosives ledger append-only + chain-of-hash + detonator serial tracking`

**Verify:**
```
pnpm --filter=@gravel/api test explosives-event*
pnpm --filter=@gravel/api test detonator*
```

**Done:** Chain integrity spec proves 100-event chain and 3 corruption scenarios. Detonator lifecycle tests pass. PDF backfill UPDATE pathway tested.

---

### Task 2 — Blast Plan state machine + HSE clearance saga (TIR-03, TIR-04, TIR-05)

**Files:**
- `apps/api/src/modules/tir/entities/blast-plan.entity.ts`
- `apps/api/src/modules/tir/entities/blast-charge.entity.ts`
- `apps/api/src/modules/tir/services/blast-plan.service.ts`
- `apps/api/src/modules/tir/services/blast-charge.service.ts`
- `apps/api/src/modules/tir/services/blast-clearance.service.ts`
- `apps/api/src/modules/tir/saga/blast-plan-saga.handler.ts`
- `apps/api/src/modules/tir/jobs/blast-clearance-timeout.job.ts`
- `apps/api/src/modules/tir/controllers/blast-plan.controller.ts`
- `apps/api/src/modules/tir/migrations/1717100200000__create_blast_plan.sql`
- `apps/api/src/modules/tir/migrations/1717100300000__create_blast_charge.sql`
- `apps/api/src/modules/tir/tests/blast-plan.spec.ts`
- `apps/api/src/modules/tir/tests/blast-charge.spec.ts`
- `apps/api/src/modules/tir/tests/blast-clearance-saga.spec.ts`
- `apps/mobile/lib/features/tir/repositories/blast_charge_repository.dart`
- `apps/mobile/lib/features/tir/screens/blast_charge_form.dart`
- `apps/mobile/integration_test/blast_charge_offline_test.dart`

**Action:**

`blast_plan` — mutable state machine (NOT append-only, pessimistic_lock sync):
```sql
CREATE TYPE blast_plan_status AS ENUM (
  'DRAFT','HSE_APPROVED','LOADED','FIRE_REQUESTED','CLEARED','FIRED','REPORTED'
);

CREATE TABLE blast_plan (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  site_id               UUID NOT NULL,
  operational_day_id    UUID NOT NULL,
  drilling_plan_id      UUID NOT NULL,
  status                blast_plan_status NOT NULL DEFAULT 'DRAFT',
  planned_by            UUID NOT NULL,
  hse_approved_by       UUID NULL,
  hse_approved_at_utc   TIMESTAMPTZ NULL,
  loading_operator_id   UUID NULL,
  loading_approved_at_utc TIMESTAMPTZ NULL,
  fire_requested_at_utc TIMESTAMPTZ NULL,
  clearance_token       UUID NULL,
  fired_at_utc          TIMESTAMPTZ NULL,
  notes_md              TEXT,
  version               INT NOT NULL DEFAULT 1,
  created_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

FND-06 audit trail on every status transition (TypeORM subscriber).

`blast_charge` — append-only events table (one row per hole load event):
```sql
CREATE TABLE blast_charge (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurred_at_utc TIMESTAMPTZ NOT NULL,
  tenant_id       UUID NOT NULL,
  blast_plan_id   UUID NOT NULL REFERENCES blast_plan(id),
  hole_id         UUID NOT NULL,
  product_type    explosives_product_type NOT NULL,
  planned_qty_g   BIGINT NOT NULL,
  actual_qty_g    BIGINT NOT NULL,
  variance_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN planned_qty_g = 0 THEN 0
    ELSE ((actual_qty_g - planned_qty_g)::numeric / planned_qty_g) * 100 END
  ) STORED,
  detonator_serial VARCHAR(100) NULL,
  operator_id     UUID NOT NULL,
  created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Add BEFORE UPDATE/DELETE trigger on `blast_charge`.

`BlastPlanService` transitions with guards:

`approveHse(planId, hseOfficerId)`:
- Requires `status = DRAFT`
- Requires `CASL.can('approve', BlastPlan)` for `HSE_OFFICER` role
- Sets `status = HSE_APPROVED`, `hse_approved_by`, `hse_approved_at_utc`

`approveLoading(planId, operatorId, operationalDayId)`:
- Requires `status = HSE_APPROVED`
- Calls `await this.rhHabilitationService.isValidAt(operatorId, 'TIR_MINE_CI', operationalDay.shiftStartLocal)` — throws `ERR_HABILITATION_EXPIRED` (403) if false
- Sets `status = LOADED`, `loading_operator_id`

`requestFire(planId, supervisorId, operationalDayId)`:
- Requires `status = LOADED`
- Calls `isValidAt(supervisorId, 'TIR_SUPERVISOR_CI', operationalDay.shiftStartLocal)` — throws `ERR_HABILITATION_EXPIRED` if false
- Sets `status = FIRE_REQUESTED`, `fire_requested_at_utc = now()`
- Publishes `EventEmitter2.emit('tir.blast_plan.fire_requested', { planId, siteId, tenantId })`
- BullMQ job `blast-clearance-timeout.job.ts`: schedules a delayed job for +4 hours that publishes `tir.blast_plan.fire_clearance_timeout` if plan is still in `FIRE_REQUESTED`

`transitionToFired(planId)` — called by saga handler:
- Requires `status = FIRE_REQUESTED` or `CLEARED`
- Sets `status = FIRED`, `fired_at_utc = now()`

`BlastClearanceSaga.handler.ts`:
```typescript
@OnEvent('tir.blast_plan.zone_cleared')
async handleZoneCleared(event: { planId: string; clearanceToken: string }) {
  await this.blastPlanService.transitionToFired(event.planId);
}
```

`BlastClearanceService.issueZoneClearance(planId, hseOfficerId)` (in TIR module, NOT in HSE module):
- Requires `CASL.can('issue_clearance', BlastPlan)` for `HSE_OFFICER`
- Validates plan is `FIRE_REQUESTED`
- Generates `clearanceToken = uuidv4()`
- Updates `blast_plan.clearance_token = clearanceToken, status = CLEARED`
- Emits `'tir.blast_plan.zone_cleared'`

`BlastChargeService.recordCharge(blastPlanId, holeId, actualQtyG, detonatorSerial, operatorId)`:
- Requires `blast_plan.status = LOADED`
- Fetches `planned_qty_g` from `drilling_plan.holes WHERE id = holeId`
- Inserts `blast_charge` row
- Calls `DetonatorService.load(detonatorSerial, blastChargeId)` if `detonatorSerial != null`

Tests:
- `blast-plan.spec.ts`: DRAFT→HSE_APPROVED→LOADED (with habilitation pass), LOADED→FIRE_REQUESTED, transition with expired cert throws ERR_HABILITATION_EXPIRED
- `blast-charge.spec.ts`: append row, variance_pct computed correctly (10% over = 10.00), BEFORE DELETE trigger raises restrict_violation
- `blast-clearance-saga.spec.ts`: mock EventEmitter2 — `fire_requested` triggers delayed BullMQ job; `zone_cleared` transitions plan to FIRED; 4h timeout fires `fire_clearance_timeout` alert; plan remains FIRED after timeout if already fired

**Mobile (Flutter):**

`BlastChargeRepository` extends `AppendOnlyRepository<BlastCharge>`. Sync strategy: `append_only_event` (one offline blast_charge row per hole loaded). Cannot update or delete. Fields: `blast_plan_id`, `hole_id`, `product_type`, `actual_qty_g`, `detonator_serial` (scanned via `mobile_scanner` barcode), `operator_id`, `occurred_at_utc`.

`BlastChargeFormScreen`: loads holes from local `blast_plan` cache (PowerSync), entry field per hole, barcode scan button for detonator serial (calls `mobile_scanner.MobileScannerController`), records check-in at current UTC. Shows `planned_qty_g` from local drilling plan for variance preview.

Integration test `blast_charge_offline_test.dart`:
- Create 3 blast_charge rows offline against a mock `blast_plan_id`
- Assert all 3 have `pending_sync = true`
- Assert `listForBlastPlan(planId)` returns 3 rows
- Assert a row with `detonator_serial = 'DET-001'` is retrievable

**Commit:** `feat(03-tir): blast plan state machine + habilitation gate + clearance saga + blast charge offline`

**Verify:**
```
pnpm --filter=@gravel/api test blast-plan*
pnpm --filter=@gravel/api test blast-charge*
pnpm --filter=@gravel/api test blast-clearance-saga*
pnpm --filter=@gravel/mobile integration_test/blast_charge_offline_test.dart
```

**Done:** State machine tests pass including habilitation gate. Saga handler tests pass. Mobile integration test passes 4 assertions.

---

### Task 3 — Blast Report (append-only, chain-of-hash) + Reconciliation job (TIR-06, TIR-07)

**Files:**
- `apps/api/src/modules/tir/entities/blast-report.entity.ts`
- `apps/api/src/modules/tir/services/blast-report.service.ts`
- `apps/api/src/modules/tir/services/explosives-reconciliation.service.ts`
- `apps/api/src/modules/tir/jobs/explosives-reconciliation.job.ts`
- `apps/api/src/modules/tir/controllers/blast-report.controller.ts`
- `apps/api/src/modules/tir/migrations/1717100400000__create_blast_report.sql`
- `apps/api/src/modules/tir/tests/blast-report.spec.ts`
- `apps/api/src/modules/tir/tests/explosives-recon.spec.ts`

**Action:**

`blast_report` — append-only, chain-of-hash (registered in EventChainVerifier from W0-P01):
```sql
CREATE TABLE blast_report (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurred_at_utc     TIMESTAMPTZ NOT NULL,
  tenant_id           UUID NOT NULL,
  site_id             UUID NOT NULL,
  blast_plan_id       UUID NOT NULL REFERENCES blast_plan(id),
  fragmentation_obs   TEXT NOT NULL,
  vibration_mm_s      NUMERIC(6,2),
  incident_ids        UUID[] NOT NULL DEFAULT '{}',
  reporter_id         UUID NOT NULL,
  notes_md            TEXT,
  prev_hash           BYTEA NOT NULL,
  row_hash            BYTEA NOT NULL,
  created_at_utc      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

BEFORE UPDATE/DELETE trigger (same `enforce_append_only()` function as `explosives_event`).

`BlastReportService.append(blastPlanId, dto, reporterId)`:
1. Verify `blast_plan.status = FIRED`
2. Compute chain-of-hash same as `ExplosivesLedgerService` (canonical field order per ADR-0012)
3. Insert row
4. Transition `blast_plan.status → REPORTED`
5. If `dto.incidentIds.length > 0`: validate each UUID references existing `hse_incident` row

`ExplosivesReconciliationService.computeBalance(siteId, operationalDayId)`:
- Sum all `explosives_event.quantity_g` WHERE `operational_day_id = :dayId AND tenant_id = :tenantId` grouped by `product_type`
- Returns `{ [productType]: number }` map

`ExplosivesReconciliationJob` — BullMQ cron `@Cron('30 22 * * *')` (22:30 UTC, ~23:30 Abidjan GMT+1):
```typescript
async reconcile(siteId: string, operationalDayId: string): Promise<void> {
  const TOLERANCE_G = 50; // 50g tolerance — configurable per site
  const computed = await this.reconciliationService.computeBalance(siteId, operationalDayId);
  const physical = await this.getPhysicalCount(operationalDayId); // manual entry via dedicated endpoint
  const gapG = Object.entries(computed).reduce((sum, [pt, qty]) => {
    return sum + Math.abs(qty - (physical[pt] ?? 0));
  }, 0);
  if (gapG > TOLERANCE_G) {
    await this.operationalDayService.blockClosure(operationalDayId, 'EXPLOSIVES_RECONCILIATION_GAP');
    await this.alertsService.emit('tir.reconciliation.gap_detected', { siteId, gapG, operationalDayId });
  }
}
```

`POST /explosives-reconciliation/:operationalDayId/physical-count` — TIR_SUPERVISOR can submit physical count override with mandatory `reason` and `override_authorized_by` UUID. Stores in `explosives_physical_count` (simple table: `operational_day_id, product_type, quantity_g, submitted_by, reason, created_at_utc`). After successful submission, calls `resolveClosure(dayId, 'EXPLOSIVES_RECONCILIATION_GAP')`.

Tests `blast-report.spec.ts`:
- Append blast report after `blast_plan.status = FIRED` succeeds and sets status to REPORTED
- Append blast report when plan is not FIRED throws ERR_PLAN_NOT_FIRED
- Chain integrity: 10-report chain, single-byte row_hash flip detected
- `incident_ids = ['invalid-uuid']` throws ERR_INCIDENT_NOT_FOUND

Tests `explosives-recon.spec.ts`:
- Gap > 50g calls `blockClosure` with 'EXPLOSIVES_RECONCILIATION_GAP'
- Gap <= 50g does NOT call `blockClosure`
- Physical count submission calls `resolveClosure`
- `computeBalance` returns correct sum per product_type from mock events

**Commit:** `feat(03-tir): blast report append-only + chain-of-hash + reconciliation job + closure blocker`

**Verify:**
```
pnpm --filter=@gravel/api test blast-report*
pnpm --filter=@gravel/api test explosives-recon*
```

**Done:** Blast report chain integrity passes. Reconciliation gap triggers blockClosure. Physical count resolves blocker.

---

### Task 4 — TIR Web UI + module wiring (TIR-03, TIR-06)

**Files:**
- `apps/web/src/app/features/tir/tir.module.ts`
- `apps/web/src/app/features/tir/tir-routes.ts`
- `apps/web/src/app/features/tir/pages/explosives-ledger.component.ts`
- `apps/web/src/app/features/tir/pages/blast-plan-list.component.ts`
- `apps/web/src/app/features/tir/pages/blast-plan-detail.component.ts`
- `apps/web/src/app/features/tir/pages/blast-report-form.component.ts`
- `apps/web/src/app/features/tir/services/tir-api.service.ts`
- `apps/api/src/modules/tir/tir.module.ts`
- `apps/api/src/modules/alerts/alerts.event-handlers.ts`
- `apps/api/src/app.module.ts`
- `apps/web/src/app/app.routes.ts`

**Action:**

**Web Angular:**

`ExplosivesLedgerComponent`: AG Grid listing `explosives_event` rows. Columns: `occurred_at`, `event_type` (badge), `product_type`, `quantity_g` (signed, formatted), `doc_reference`, `pdf_sha256` (link to S3 if non-null, else "Generating…"). Filter by `product_type`, `event_type`, `date_range`. Read-only — no editing. A "Add Receipt" button opens a Formly form for `EXPLOSIVES_IN` (product_type, quantity_g, supplier, unit_price_minor, doc_reference, operational_day). CASL guard: `TIR_SUPERVISOR` or `HR_MANAGER`.

`BlastPlanListComponent`: AG Grid with columns `[created_at, status (badge), operational_day, planned_by, hse_approved_by, drilling_plan_ref]`. Status badges are color-coded (DRAFT=grey, HSE_APPROVED=blue, LOADED=yellow, FIRED=green, REPORTED=teal). Row click navigates to detail. "New Plan" button: Formly form with `drilling_plan_id` FK picker, `site_id`, `operational_day_id`.

`BlastPlanDetailComponent`: read-only summary + action buttons per current status:
- DRAFT: "Approve (HSE)" button (HSE_OFFICER only)
- HSE_APPROVED: "Start Loading" button (TIR_SUPERVISOR + TIR_MINE_CI check on server)
- LOADED: "Request Fire" button (TIR_SUPERVISOR)
- FIRE_REQUESTED: "Issue Zone Clearance" button (HSE_OFFICER only)
- FIRED: "Submit Blast Report" button (navigates to blast-report-form)

Each button calls the appropriate `tir-api.service.ts` endpoint and refreshes the component via SSE subscription to `blast.plan.{id}.status_changed`.

`BlastReportFormComponent`: Formly form for `fragmentation_obs`, `vibration_mm_s`, `incident_ids` (multi-select from existing HSE incidents), `notes_md`. Submit calls `POST /blast-report`. Read-only display of submitted report.

**TirModule wiring:** Wire `TirModule` in `apps/api/src/app.module.ts`. Add `/tir` lazy route in `apps/web/src/app/app.routes.ts`.

**Alerts wiring:** Add 3 new event handlers to `apps/api/src/modules/alerts/alerts.event-handlers.ts`:
- `@OnEvent('tir.reconciliation.gap_detected')` — creates alert for `TIR_SUPERVISOR` + `HSE_OFFICER`, dedupe key = `tir:${siteId}:${operationalDayId}:recon_gap`
- `@OnEvent('tir.blast_plan.fire_clearance_timeout')` — creates alert for `TIR_SUPERVISOR`, no dedupe
- `@OnEvent('rh.certification.expiring_soon')` — creates alert for `HR_MANAGER` + `SHIFT_SUPERVISOR`, dedupe key = `rh:cert:${employeeId}:${certCode}`

**Commit:** `feat(03-tir): TIR web UI + TirModule wiring + 3 alert event handlers`

**Verify:**
```
pnpm --filter=@gravel/api build
pnpm --filter=@gravel/web build
```

**Done:** API and web build clean. `/tir` route renders. Explosives ledger, blast plan list, blast plan detail, blast report form all render.

## Key Constraints

- `blast_plan` table: NO BEFORE UPDATE/DELETE trigger (mutable state machine — Pitfall 1)
- `blast_charge` and `explosives_event` and `blast_report`: MUST have BEFORE UPDATE/DELETE triggers
- `isValidAt` calls MUST pass `operationalDay.shiftStartLocal` not `new Date()` (Pitfall 2)
- PDF snapshot MUST be async via outbox — NOT inside the `explosives_event` append transaction (Pitfall 7)
- `detonator` entity has exactly 5 fields: `serial_number, status, received_in_event_id, blast_charge_id, destroyed_at_utc` — no warehouse bins or expiry dates (Pitfall 6)
- `ExplosivesReconciliationJob` MUST call `operationalDayService.blockClosure()` not write directly to `closure_blockers`
- No direct import of `StockpileModule` or `HseModule` from `TirModule` — cross-module via EventEmitter2 only (ADR-0012)

## Integration Points

This plan produces for downstream plans:
- `blast_plan` table — W3-P07 dashboard reads `COUNT(*) GROUP BY status` for KPI widget
- `explosives_event` chain integrity — W3-P07 adds EventChainVerifier health check to dashboard
- `blast_report` — W3-P07 reads "last blast summary" for site dashboard widget
- `tir.reconciliation.gap_detected` alert — registered in W3-P07 SSE broadcaster for real-time push

## Success Criteria

- [ ] `pnpm --filter=@gravel/api test explosives-event*` — chain integrity with 100-event fixture + 3 corruption scenarios
- [ ] `pnpm --filter=@gravel/api test detonator*` — full lifecycle + duplicate serial
- [ ] `pnpm --filter=@gravel/api test blast-plan*` — all state transitions including habilitation gate
- [ ] `pnpm --filter=@gravel/api test blast-charge*` — append + variance + trigger
- [ ] `pnpm --filter=@gravel/api test blast-clearance-saga*` — saga event flow + timeout
- [ ] `pnpm --filter=@gravel/api test blast-report*` — append-only + chain integrity
- [ ] `pnpm --filter=@gravel/api test explosives-recon*` — blockClosure on gap + resolveClosure on physical count
- [ ] `pnpm --filter=@gravel/mobile integration_test/blast_charge_offline_test.dart` — 4 assertions
- [ ] `pnpm --filter=@gravel/api build` — clean
- [ ] `pnpm --filter=@gravel/web build` — clean

## Output

After completion, create `.planning/phases/03-operational-completeness/03-W1-P02-SUMMARY.md`
