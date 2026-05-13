---
phase: 03-operational-completeness
plan: W1-P03
type: execute
wave: 1
autonomous: true
depends_on: [03-W0-P01]
files_modified:
  - apps/api/src/modules/concassage/concassage.module.ts
  - apps/api/src/modules/concassage/entities/crusher-session.entity.ts
  - apps/api/src/modules/concassage/entities/screening-session.entity.ts
  - apps/api/src/modules/concassage/services/crusher-session.service.ts
  - apps/api/src/modules/concassage/services/screening-session.service.ts
  - apps/api/src/modules/concassage/controllers/crusher-session.controller.ts
  - apps/api/src/modules/concassage/controllers/screening-session.controller.ts
  - apps/api/src/modules/concassage/migrations/1717200000000__create_crusher_session.sql
  - apps/api/src/modules/concassage/migrations/1717200100000__create_screening_session.sql
  - apps/api/src/modules/concassage/tests/crusher-session.spec.ts
  - apps/api/src/modules/concassage/tests/screening-session.spec.ts
  - apps/api/src/modules/stockpile/event-handlers/crusher-session-completed.handler.ts
  - apps/api/src/modules/stockpile/event-handlers/screening-session-completed.handler.ts
  - apps/web/src/app/features/concassage/concassage.module.ts
  - apps/web/src/app/features/concassage/concassage-routes.ts
  - apps/web/src/app/features/concassage/pages/crusher-session-list.component.ts
  - apps/web/src/app/features/concassage/pages/crusher-session-form.component.ts
  - apps/web/src/app/features/concassage/pages/screening-session-list.component.ts
  - apps/web/src/app/features/concassage/pages/screening-session-form.component.ts
  - apps/web/src/app/features/concassage/services/concassage-api.service.ts
  - apps/api/src/modules/stockpile/stockpile.module.ts
  - apps/api/src/app.module.ts
  - apps/web/src/app/app.routes.ts
task_count: 3
requirements: [CON-01, CON-02, CRI-01]

must_haves:
  truths:
    - "Closing a crusher session publishes production.crusher.session_completed via outbox, creating STOCKPILE_INFLOW idempotently"
    - "Closing a screening session publishes one STOCKPILE_INFLOW per calibre, each with compound idempotency key session_id_calibre_code"
    - "CrusherSession.energy_kwh is stored and creates an energy_consumption_reading row on session close"
    - "ScreeningSession.calibre_yields is a JSONB array; non-conforming yields have nonconformity_reason non-null"
    - "StockpileModule outbox consumers are idempotent — replaying the event does not duplicate STOCKPILE_INFLOW"
  artifacts:
    - path: "apps/api/src/modules/concassage/services/crusher-session.service.ts"
      provides: "CrusherSessionService.complete() publishes outbox event"
      exports: ["CrusherSessionService"]
    - path: "apps/api/src/modules/stockpile/event-handlers/crusher-session-completed.handler.ts"
      provides: "STOCKPILE_INFLOW from crusher session"
      contains: "production.crusher.session_completed"
    - path: "apps/api/src/modules/stockpile/event-handlers/screening-session-completed.handler.ts"
      provides: "per-calibre STOCKPILE_INFLOW from screening session"
      contains: "production.screening.session_completed"
  key_links:
    - from: "apps/api/src/modules/concassage/services/crusher-session.service.ts"
      to: "apps/api/src/modules/outbox/outbox.service.ts"
      via: "outboxService.publish({ manager, eventType: 'production.crusher.session_completed' })"
    - from: "apps/api/src/modules/stockpile/event-handlers/crusher-session-completed.handler.ts"
      to: "apps/api/src/modules/stockpile/services/stockpile-event.service.ts"
      via: "stockpileEventService.append({ event_type: STOCKPILE_INFLOW, source_reference: { crusher_session_id } })"
    - from: "apps/api/src/modules/concassage/services/crusher-session.service.ts"
      to: "apps/api/src/modules/fuel/services/energy-consumption.service.ts"
      via: "energyConsumptionService.recordReading({ source: 'CRUSHER', kwh: session.energy_kwh })"
---

# Plan: 03-W1-P03 — Concassage + Criblage (CON-01, CON-02, CRI-01)

## Objective

Implement crusher session tracking (CON-01) with energy consumption per session (CON-02) and screening session tracking with per-calibre yield classification and non-conformity declarations (CRI-01). Both feed the existing `StockpileEventService` via the established outbox pattern. This plan is simpler than W1-P02: no chain-of-hash on session tables (operational records, not financial ledger), no offline mobile screen (web-only data entry at fixed stations).

**Purpose:** Close the production chain — crusher and screen output flows automatically into the event-sourced stockpile without manual stock entry.
**Output:** 2 database tables (non-append-only), 2 backend services, 2 StockpileModule outbox consumers, web session management UI.

## Context

**From Phase 2 W2-P05 (stockpile):**
```typescript
// apps/api/src/modules/stockpile/services/stockpile-event.service.ts
export class StockpileEventService {
  async append(dto: AppendStockpileEventDto, manager?: EntityManager): Promise<StockpileEvent>
}
// Idempotency: unique partial index on (tenant_id, source_reference->>'rotation_id')
// Phase 3 adds: source_reference->>'crusher_session_id' and source_reference->>'${session_id}_${calibre_code}'
```

**From Phase 2 W0-P01:**
```typescript
// apps/api/src/modules/outbox/outbox.service.ts
export class OutboxService {
  async publish(opts: { manager: EntityManager; eventType: string; payload: object }): Promise<void>
}
// apps/api/src/modules/outbox/outbox-worker.processor.ts — already polling, consumes all events via EventEmitter2
```

**From Phase 2 W3-P06 (energy):**
```typescript
// apps/api/src/modules/fuel/services/energy-consumption.service.ts (from CAR-04)
async recordReading(dto: { site_id: string; equipment_id: string; source: string; kwh: number; operational_day_id: string }): Promise<void>
```
Note: If the Phase 2 W3-P06 energy service uses a different name or path, adapt accordingly — the key is to create an `energy_consumption_reading` row linked to the session.

**Critical pitfall (research Pitfall 3):** CRI multi-calibre idempotency key MUST be compound `${session_id}_${calibre_code}` — NOT just `session_id`. A crash mid-loop must allow safe replay of the remaining calibres without re-inserting already-processed ones.

**From 03-W0-P01:**
- Keycloak role `PROCESSING_OPERATOR` — can open/close sessions
- i18n namespaces `concassage` and `criblage` (18 keys each)

## Tasks

### Task 1 — CrusherSession + ScreeningSession entities + migrations + services (CON-01, CON-02, CRI-01)

**Files:**
- `apps/api/src/modules/concassage/entities/crusher-session.entity.ts`
- `apps/api/src/modules/concassage/entities/screening-session.entity.ts`
- `apps/api/src/modules/concassage/services/crusher-session.service.ts`
- `apps/api/src/modules/concassage/services/screening-session.service.ts`
- `apps/api/src/modules/concassage/controllers/crusher-session.controller.ts`
- `apps/api/src/modules/concassage/controllers/screening-session.controller.ts`
- `apps/api/src/modules/concassage/concassage.module.ts`
- `apps/api/src/modules/concassage/migrations/1717200000000__create_crusher_session.sql`
- `apps/api/src/modules/concassage/migrations/1717200100000__create_screening_session.sql`
- `apps/api/src/modules/concassage/tests/crusher-session.spec.ts`
- `apps/api/src/modules/concassage/tests/screening-session.spec.ts`

**Action:**

`crusher_session` — mutable operational record (NOT append-only, no chain-of-hash):
```sql
CREATE TYPE crusher_session_status AS ENUM ('ACTIVE','PAUSED','COMPLETED');

CREATE TABLE crusher_session (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  site_id              UUID NOT NULL,
  operational_day_id   UUID NOT NULL,
  crusher_id           UUID NOT NULL REFERENCES production_equipment(id),
  input_zone_id        UUID NULL,
  output_stockpile_id  UUID NOT NULL,
  material_type        VARCHAR(50) NOT NULL,
  calibre_code         VARCHAR(50) NOT NULL,
  input_tonnage_kg     BIGINT NOT NULL DEFAULT 0,
  output_tonnage_kg    BIGINT NOT NULL DEFAULT 0,
  energy_kwh           NUMERIC(10,2) NOT NULL DEFAULT 0,
  operating_hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
  performance_pct      NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN input_tonnage_kg = 0 THEN 0
    ELSE (output_tonnage_kg::numeric / input_tonnage_kg) * 100 END
  ) STORED,
  session_start_utc    TIMESTAMPTZ NOT NULL,
  session_end_utc      TIMESTAMPTZ NULL,
  operator_id          UUID NOT NULL,
  status               crusher_session_status NOT NULL DEFAULT 'ACTIVE',
  notes_md             TEXT,
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`screening_session` — mutable operational record:
```sql
CREATE TABLE screening_session (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  site_id              UUID NOT NULL,
  operational_day_id   UUID NOT NULL,
  screen_id            UUID NOT NULL REFERENCES production_equipment(id),
  input_stockpile_id   UUID NULL,
  session_start_utc    TIMESTAMPTZ NOT NULL,
  session_end_utc      TIMESTAMPTZ NULL,
  input_tonnage_kg     BIGINT NOT NULL DEFAULT 0,
  calibre_yields       JSONB NOT NULL DEFAULT '[]',
  -- calibre_yields schema: [{calibre_code, output_stockpile_id, tonnage_kg, is_nonconforming, nonconformity_reason}]
  -- nonconformity_reason MUST be non-null when is_nonconforming=true
  operator_id          UUID NOT NULL,
  status               crusher_session_status NOT NULL DEFAULT 'ACTIVE',
  notes_md             TEXT,
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Add DB CHECK constraint on `screening_session.calibre_yields`:
```sql
ALTER TABLE screening_session
  ADD CONSTRAINT calibre_yields_nonconforming_reason_required
  CHECK (
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(calibre_yields) elem
      WHERE (elem->>'is_nonconforming')::boolean = true
        AND (elem->>'nonconformity_reason') IS NULL
    )
  );
```

`CrusherSessionService`:
- `open(dto)`: creates session with `status = ACTIVE`
- `pause(id)` / `resume(id)`: toggle ACTIVE/PAUSED
- `complete(id, completionDto, manager)`:
  1. Sets `session_end_utc`, `status = COMPLETED`, `input_tonnage_kg`, `output_tonnage_kg`, `energy_kwh`, `operating_hours`
  2. Calls `energyConsumptionService.recordReading({ source: 'CRUSHER', equipment_id: session.crusher_id, kwh: completionDto.energy_kwh, ... })`
  3. Publishes outbox in SAME transaction: `outboxService.publish({ manager, eventType: 'production.crusher.session_completed', payload: { session_id: id, output_stockpile_id: session.output_stockpile_id, output_tonnage_kg: completionDto.output_tonnage_kg, material_type: session.material_type, calibre_code: session.calibre_code, completed_at_utc: now() } })`
  - Atomicity: both the session UPDATE and the outbox INSERT share the same `EntityManager` transaction

`ScreeningSessionService`:
- `open(dto)` / `pause(id)` / `resume(id)` — same pattern
- `complete(id, completionDto, manager)`:
  1. Validates `calibre_yields`: each `is_nonconforming=true` entry must have `nonconformity_reason`
  2. Sets `session_end_utc`, `status = COMPLETED`, `calibre_yields`, `input_tonnage_kg`
  3. Publishes ONE outbox event: `production.screening.session_completed` with full `calibre_yields` array in payload — the outbox handler will loop and emit one STOCKPILE_INFLOW per calibre

Tests `crusher-session.spec.ts`:
- `complete()` publishes `production.crusher.session_completed` outbox event in same transaction as status update (rollback test: rollback tx → outbox row gone + session still ACTIVE)
- `performance_pct` GENERATED column = 80 when output=800kg, input=1000kg
- `energy_kwh` stored correctly on completion
- `energyConsumptionService.recordReading` called with correct kwh value

Tests `screening-session.spec.ts`:
- Non-conforming yield without reason throws validation error
- `complete()` with 3 calibres publishes single `session_completed` event with 3 calibre_yields entries
- Status transitions ACTIVE→PAUSED→ACTIVE→COMPLETED accepted

**Commit:** `feat(03-con-cri): crusher + screening session entities + outbox publish`

**Verify:**
```
pnpm --filter=@gravel/api test crusher-session*
pnpm --filter=@gravel/api test screening-session*
```

**Done:** Same-tx rollback test passes for both services. Non-conformity validation enforced.

---

### Task 2 — StockpileModule outbox consumers (CON-01, CRI-01)

**Files:**
- `apps/api/src/modules/stockpile/event-handlers/crusher-session-completed.handler.ts`
- `apps/api/src/modules/stockpile/event-handlers/screening-session-completed.handler.ts`
- `apps/api/src/modules/stockpile/stockpile.module.ts`

**Action:**

Add two outbox event handlers to `StockpileModule`. These follow the exact same pattern as the existing `rotation-completed.handler.ts` in the stockpile module.

`CrusherSessionCompletedHandler`:
```typescript
@OnEvent('production.crusher.session_completed')
async handleCrusherSessionCompleted(event: CrusherSessionCompletedEvent): Promise<void> {
  // Double idempotency: service pre-check + DB unique partial index
  const idempotencyKey = event.session_id;
  const existing = await this.stockpileEventRepo.findOne({
    where: { source_reference: { crusher_session_id: idempotencyKey } },
  });
  if (existing) return; // already processed

  await this.stockpileEventService.append({
    event_type: StockpileEventType.STOCKPILE_INFLOW,
    stockpile_id: event.output_stockpile_id,
    tonnage_delta_kg: event.output_tonnage_kg,
    material_type: event.material_type,
    calibre_code: event.calibre_code,
    source_reference: { crusher_session_id: event.session_id },
    occurred_at_utc: event.completed_at_utc,
  });
}
```

Add DB unique partial index in a new migration embedded in `stockpile.module.ts` initialization OR add it to the existing stockpile migrations:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS stockpile_event_crusher_session_uq
  ON stockpile_event ((source_reference->>'crusher_session_id'))
  WHERE source_reference->>'crusher_session_id' IS NOT NULL;
```

`ScreeningSessionCompletedHandler` — loops calibre_yields, one INFLOW per calibre:
```typescript
@OnEvent('production.screening.session_completed')
async handleScreeningSessionCompleted(event: ScreeningSessionCompletedEvent): Promise<void> {
  for (const yield_ of event.calibre_yields) {
    // Compound idempotency key (Pitfall 3)
    const idempotencyKey = `${event.session_id}_${yield_.calibre_code}`;
    const existing = await this.stockpileEventRepo.findOne({
      where: { source_reference: { screening_idempotency_key: idempotencyKey } },
    });
    if (existing) continue; // this calibre already processed

    await this.stockpileEventService.append({
      event_type: StockpileEventType.STOCKPILE_INFLOW,
      stockpile_id: yield_.output_stockpile_id,
      tonnage_delta_kg: yield_.tonnage_kg,
      material_type: 'GRANITE', // or from event payload
      calibre_code: yield_.calibre_code,
      source_reference: { screening_idempotency_key: idempotencyKey, session_id: event.session_id },
      occurred_at_utc: event.completed_at_utc,
    });
  }
}
```

Add DB unique partial index:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS stockpile_event_screening_calibre_uq
  ON stockpile_event ((source_reference->>'screening_idempotency_key'))
  WHERE source_reference->>'screening_idempotency_key' IS NOT NULL;
```

Register both handlers in `StockpileModule` providers array.

Tests — add to `apps/api/src/modules/stockpile/tests/` (following existing test convention):
- `crusher-session-completed-handler.spec.ts`: mock `StockpileEventService.append`, assert called once with correct payload; second call with same `session_id` is skipped (idempotent)
- `screening-session-completed-handler.spec.ts`: 3 calibres → `append` called 3 times with correct keys; replay with all 3 already present → 0 new appends; partial replay (1 of 3 present) → 2 new appends

**Commit:** `feat(03-con-cri): StockpileModule outbox consumers for crusher + screening sessions`

**Verify:**
```
pnpm --filter=@gravel/api test crusher-session-completed*
pnpm --filter=@gravel/api test screening-session-completed*
```

**Done:** Idempotency tests pass for both handlers. Partial replay (CRI multi-calibre Pitfall 3) handled correctly.

---

### Task 3 — Concassage/Criblage Web UI + module wiring

**Files:**
- `apps/web/src/app/features/concassage/concassage.module.ts`
- `apps/web/src/app/features/concassage/concassage-routes.ts`
- `apps/web/src/app/features/concassage/pages/crusher-session-list.component.ts`
- `apps/web/src/app/features/concassage/pages/crusher-session-form.component.ts`
- `apps/web/src/app/features/concassage/pages/screening-session-list.component.ts`
- `apps/web/src/app/features/concassage/pages/screening-session-form.component.ts`
- `apps/web/src/app/features/concassage/services/concassage-api.service.ts`
- `apps/api/src/app.module.ts`
- `apps/web/src/app/app.routes.ts`

**Action:**

**Web Angular — Concassage Feature Module:**

`CrusherSessionListComponent`: AG Grid with columns `[session_start, status (badge), crusher_id (name), input_tonnage_kg, output_tonnage_kg, performance_pct (%), energy_kwh, operating_hours]`. Filter by `site_id`, `operational_day_id`, `status`. "Open Session" button navigates to form. CASL guard: `PROCESSING_OPERATOR` or `QUARRY_CHIEF`.

`CrusherSessionFormComponent`: Formly form. "Open" mode: `crusher_id` (picker from `production_equipment` WHERE type=CRUSHER), `input_zone_id`, `output_stockpile_id`, `material_type`, `calibre_code`, `operational_day_id`. "Complete" mode: `input_tonnage_kg`, `output_tonnage_kg`, `energy_kwh`, `operating_hours`. Action buttons: Open / Pause / Resume / Complete — each calls the corresponding API endpoint. Completing shows a confirmation modal: "Fermer la session ? Les tonnages seront transmis au stockpile."

`ScreeningSessionListComponent`: AG Grid with `[session_start, status, screen_id, input_tonnage_kg, calibre_yield_count, has_nonconformity (boolean badge)]`. `has_nonconformity` derived client-side from `calibre_yields` array.

`ScreeningSessionFormComponent`: "Open" mode: `screen_id`, `input_stockpile_id`, `operational_day_id`. "Complete" mode: `input_tonnage_kg`, then dynamic `calibre_yields` FormArray — for each calibre: `calibre_code`, `output_stockpile_id`, `tonnage_kg`, `is_nonconforming` toggle, `nonconformity_reason` (required if `is_nonconforming = true`, Formly conditional). "Add Calibre" button appends a new row. Minimum 1 calibre required for completion.

Wire `ConcassageModule` in `apps/api/src/app.module.ts`. Add `/concassage` lazy route in `apps/web/src/app/app.routes.ts`.

**Commit:** `feat(03-con-cri): concassage/criblage web UI + module wiring`

**Verify:**
```
pnpm --filter=@gravel/api build
pnpm --filter=@gravel/web build
```

**Done:** API and web build clean. `/concassage` route renders. Crusher session list + form + screening session list + form all render.

## Key Constraints

- No chain-of-hash on `crusher_session` or `screening_session` — they are operational records, not financial ledger entries (research: "No chain-of-hash needed — standard FND-06 audit trail suffices")
- No mobile screen for CON/CRI — web-only (fixed stations)
- CRI idempotency key MUST be `${session_id}_${calibre_code}` (compound) — never just `session_id` (Pitfall 3)
- `CrusherSessionService.complete()` and outbox publish MUST share the same `EntityManager` transaction
- `energy_kwh` on `crusher_session.complete()` MUST trigger `energyConsumptionService.recordReading()` (CON-02)
- `VteModule` will later write `STOCKPILE_OUTFLOW_SALE` events via the same `StockpileEventService.append` API — do not change its signature

## Integration Points

This plan produces for downstream plans:
- `STOCKPILE_INFLOW` events from crusher/screen complete the stockpile chain (previously only transport rotations fed the stockpile from the extraction side)
- `crusher_session.energy_kwh` → `energy_consumption_reading` feeds W3-P07 energy dashboard widget
- W3-P07 dashboard reads `crusher_session` aggregate (daily tonnage, avg performance_pct) for production KPI widget

## Success Criteria

- [ ] `pnpm --filter=@gravel/api test crusher-session*` — same-tx rollback test + performance_pct + energy delegation
- [ ] `pnpm --filter=@gravel/api test screening-session*` — non-conformity validation + single outbox event per session
- [ ] `pnpm --filter=@gravel/api test crusher-session-completed*` — idempotent handler, replay-safe
- [ ] `pnpm --filter=@gravel/api test screening-session-completed*` — 3-calibre handler, partial-replay-safe (Pitfall 3)
- [ ] `pnpm --filter=@gravel/api build` — clean
- [ ] `pnpm --filter=@gravel/web build` — clean
- [ ] `/concassage` route renders crusher session list

## Output

After completion, create `.planning/phases/03-operational-completeness/03-W1-P03-SUMMARY.md`
