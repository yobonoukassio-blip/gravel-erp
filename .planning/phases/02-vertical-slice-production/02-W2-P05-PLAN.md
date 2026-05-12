---
phase: 02-vertical-slice-production
plan: 05
type: execute
wave: 2
depends_on: ["02-W0-P01", "02-W2-P04"]
files_modified:
  - apps/api/src/modules/stockpile/stockpile.module.ts
  - apps/api/src/modules/stockpile/entities/stockpile.entity.ts
  - apps/api/src/modules/stockpile/entities/stockpile-event.entity.ts
  - apps/api/src/modules/stockpile/entities/stockpile-threshold.entity.ts
  - apps/api/src/modules/stockpile/entities/stockpile-balance.entity.ts
  - apps/api/src/modules/stockpile/services/stockpile-event.service.ts
  - apps/api/src/modules/stockpile/services/stockpile-balance.service.ts
  - apps/api/src/modules/stockpile/services/stockpile-valuation.service.ts
  - apps/api/src/modules/stockpile/services/stockpile-threshold.service.ts
  - apps/api/src/modules/stockpile/controllers/stockpile.controller.ts
  - apps/api/src/modules/stockpile/event-handlers/rotation-completed.handler.ts
  - apps/api/src/modules/stockpile/event-handlers/balance-projection.handler.ts
  - apps/api/src/modules/stockpile/jobs/balance-recompute.job.ts
  - apps/api/src/modules/stockpile/migrations/1716300000000__create_stockpile.sql
  - apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql
  - apps/api/src/modules/stockpile/migrations/1716300200000__create_stockpile_balance.sql
  - apps/api/src/modules/stockpile/migrations/1716300300000__create_stockpile_threshold.sql
  - apps/api/src/modules/stockpile/tests/stockpile-event.spec.ts
  - apps/api/src/modules/stockpile/tests/stockpile-balance.spec.ts
  - apps/api/src/modules/stockpile/tests/stockpile-valuation.spec.ts
  - apps/api/src/modules/stockpile/tests/stockpile-threshold.spec.ts
  - apps/api/src/modules/stockpile/tests/outbox-stockpile-inflow.spec.ts
  - apps/api/src/modules/stockpile/tests/stockpile-event-chain-integrity.spec.ts
  - apps/web/src/app/features/stockpile/stockpile.module.ts
  - apps/web/src/app/features/stockpile/pages/stockpile-list.component.ts
  - apps/web/src/app/features/stockpile/pages/stockpile-events.component.ts
  - apps/web/src/app/features/stockpile/pages/stockpile-thresholds.component.ts
  - apps/web/src/app/features/stockpile/pages/stockpile-adjustment.component.ts
  - apps/web/src/app/features/stockpile/stockpile-routes.ts
  - docs/adr/ADR-0006-stockpile-event-sourcing.md
autonomous: true
requirements: [STK-01, STK-02, STK-03]

must_haves:
  truths:
    - "Chaque stock est un grand livre event-sourced — solde dérivé d'événements append-only"
    - "Une rotation complétée matérialise un STOCKPILE_INFLOW dans la même transaction via outbox handler"
    - "Le solde est exposé via projection matérialisée stockpile_balance"
    - "Une alerte est publiée quand le balance traverse un seuil bas/haut configuré (STK-02)"
    - "Le coût moyen pondéré par tonne est recalculé sur chaque INFLOW (STK-03, cost_model_version=1)"
    - "STOCKPILE_ADJUSTMENT requiert rôle SITE_MANAGER, raison, et photo"
    - "Chain-of-hash sur stockpile_event est vérifiable et un test détecte une corruption injectée"
  artifacts:
    - path: "apps/api/src/modules/stockpile/entities/stockpile-event.entity.ts"
      provides: "Append-only event ledger with chain-of-hash, partitioned monthly"
    - path: "apps/api/src/modules/stockpile/entities/stockpile-balance.entity.ts"
      provides: "Materialized projection (tenant_id, site_id, stockpile_id, calibre_code) → balance_kg"
    - path: "docs/adr/ADR-0006-stockpile-event-sourcing.md"
      provides: "Refined ADR (Accepted status)"
  key_links:
    - from: "apps/api/src/modules/stockpile/event-handlers/rotation-completed.handler.ts"
      to: "stockpile_event INSERT"
      via: "@OnEvent('production.transport.rotation_completed')"
      pattern: "@OnEvent\\('production\\.transport\\.rotation_completed'\\)"
    - from: "apps/api/src/modules/stockpile/event-handlers/balance-projection.handler.ts"
      to: "stockpile_balance UPSERT"
      via: "@OnEvent('production.stockpile.event_appended')"
      pattern: "stockpile_balance"
    - from: "apps/api/src/modules/stockpile/services/stockpile-threshold.service.ts"
      to: "production.stockpile.threshold_crossed event"
      via: "EventEmitter2 emit (consumed by alerts module)"
      pattern: "production\\.stockpile\\.threshold_crossed"
---

<objective>
Deliver Stockpile event-sourced vertical slice covering STK-01 (event-sourced ledger with chain-of-hash), STK-02 (threshold alerts), STK-03 (weighted-average cost valuation, cost_model_version=1). Refine ADR-0006. Consumes outbox event from W2-P04 transport.

Output: Stockpile module backend with monthly-partitioned event table, chain-of-hash, materialized balance projection, threshold alerts, valuation; web UI for read + adjustments + thresholds.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-W2-P04-SUMMARY.md
@docs/adr/ADR-0006-stockpile-event-sourcing.md
@apps/api/src/common/chain-of-hash/event-chain.verifier.ts
@apps/api/src/modules/outbox/outbox.service.ts

<interfaces>
From W0-P01:
- `EventChainVerifier.verifyChain('stockpile_event', tenantId)` — generic chain integrity check
- `OutboxService.publish(...)`

From W2-P04:
- Outbox event `production.transport.rotation_completed` with payload `{ tenant_id, site_id, rotation_id, weighing_ticket_id, loaded_tonnage_kg, material_type, unloaded_at_zone_id, operational_day_id, occurred_at_utc }`

To create:
- `stockpile_event { id, tenant_id, site_id, stockpile_id, event_type ENUM('STOCKPILE_INFLOW','STOCKPILE_OUTFLOW_SALE','STOCKPILE_ADJUSTMENT','STOCKPILE_TRANSFER'), tonnage_delta_kg BIGINT, material_type, calibre_code, operational_day_id, source_reference JSONB, occurred_at_utc, created_by, prev_hash BYTEA, row_hash BYTEA, cost_per_ton_minor_units BIGINT NULL, currency CHAR(3) NULL, cost_model_version INT NOT NULL DEFAULT 1 }`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: stockpile + stockpile_event monthly-partitioned + chain-of-hash + RLS</name>
  <files>
    apps/api/src/modules/stockpile/entities/stockpile.entity.ts,
    apps/api/src/modules/stockpile/entities/stockpile-event.entity.ts,
    apps/api/src/modules/stockpile/services/stockpile-event.service.ts,
    apps/api/src/modules/stockpile/controllers/stockpile.controller.ts,
    apps/api/src/modules/stockpile/migrations/1716300000000__create_stockpile.sql,
    apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql,
    apps/api/src/modules/stockpile/tests/stockpile-event.spec.ts,
    apps/api/src/modules/stockpile/tests/stockpile-event-chain-integrity.spec.ts
  </files>
  <read_first>
    - apps/api/src/common/chain-of-hash/event-chain.verifier.ts (W0-P01)
    - apps/api/src/modules/audit/audit.entity.ts (Phase 1 chain pattern)
    - docs/adr/ADR-0004-audit-chain-of-hash.md
    - docs/adr/ADR-0006-stockpile-event-sourcing.md (draft from W0-P01)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-40, D2-41, D2-111"
  </read_first>
  <behavior>
    - stockpile_event is append-only, server rejects PATCH/DELETE
    - Each INSERT computes prev_hash = (SELECT row_hash from previous event of same (tenant_id) ordered by occurred_at_utc, id; genesis = 32 zero bytes)
    - row_hash = sha256(prev_hash || canonical_payload_bytes)
    - Partitioned BY RANGE (occurred_at_utc) monthly; partitions created automatically by trigger or pre-created script for current + next 2 months
    - STOCKPILE_ADJUSTMENT requires role SITE_MANAGER, reason in source_reference.reason, photo SHA-256 in source_reference.photo_sha256
    - EventChainVerifier returns valid=true on 100 valid events
    - Chain integrity test injects single-byte corruption → verifier returns valid=false
  </behavior>
  <action>
    Migration `__create_stockpile.sql`:
    `CREATE TABLE stockpile (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, zone_id UUID NOT NULL REFERENCES zone(id), code VARCHAR(50) NOT NULL, label VARCHAR(200) NOT NULL, default_calibre_code VARCHAR(50) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, site_id, code))`. RLS.

    Migration `__create_stockpile_event_partitioned.sql`:
    `CREATE TYPE stockpile_event_type AS ENUM ('STOCKPILE_INFLOW','STOCKPILE_OUTFLOW_SALE','STOCKPILE_ADJUSTMENT','STOCKPILE_TRANSFER');
    CREATE TABLE stockpile_event (id UUID NOT NULL DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, stockpile_id UUID NOT NULL REFERENCES stockpile(id), event_type stockpile_event_type NOT NULL, tonnage_delta_kg BIGINT NOT NULL, material_type material_type_enum NOT NULL, calibre_code VARCHAR(50) NOT NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), source_reference JSONB NOT NULL DEFAULT '{}', occurred_at_utc TIMESTAMPTZ NOT NULL, created_by UUID NOT NULL, prev_hash BYTEA NOT NULL, row_hash BYTEA NOT NULL, cost_per_ton_minor_units BIGINT NULL, currency CHAR(3) NULL, cost_model_version INT NOT NULL DEFAULT 1, PRIMARY KEY (id, occurred_at_utc)) PARTITION BY RANGE (occurred_at_utc);
    CREATE TABLE stockpile_event_2026_05 PARTITION OF stockpile_event FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
    CREATE TABLE stockpile_event_2026_06 PARTITION OF stockpile_event FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
    CREATE TABLE stockpile_event_2026_07 PARTITION OF stockpile_event FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');`
    + RLS policy on parent table.

    `StockpileEventService.append(dto, manager)`: inside tx — SELECT row_hash FROM stockpile_event WHERE tenant_id=$1 ORDER BY occurred_at_utc DESC, id DESC LIMIT 1 (or 32 zeros if first), compute canonical payload bytes (deterministic JSON order: event_type|stockpile_id|tonnage_delta_kg|material_type|calibre_code|operational_day_id|source_reference|occurred_at_utc|created_by), row_hash = sha256(prev || canonical), INSERT row. Role guard `assertRole(SITE_MANAGER)` for STOCKPILE_ADJUSTMENT. After insert, emit `production.stockpile.event_appended` for projection handler.

    Specs:
    - `stockpile-event.spec.ts`: append 5 events, verify each row_hash chains to previous; PATCH /stockpile-events/:id → 405; STOCKPILE_ADJUSTMENT without SITE_MANAGER role → 403; STOCKPILE_ADJUSTMENT without source_reference.photo_sha256 → 400.
    - `stockpile-event-chain-integrity.spec.ts`: seed 100 events, call EventChainVerifier.verifyChain('stockpile_event', tenantId) → valid=true. Inject byte corruption (UPDATE stockpile_event SET row_hash = decode('00...', 'hex') WHERE id=event[50]) → verifier returns valid=false with brokenAt.id=event[50].
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- stockpile-event stockpile-event-chain-integrity</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `PARTITION BY RANGE (occurred_at_utc)`
    - Migration contains `CREATE TABLE stockpile_event_2026_05 PARTITION OF stockpile_event`
    - Migration contains `prev_hash BYTEA NOT NULL` and `row_hash BYTEA NOT NULL`
    - Entity contains `@Column('bytea') prev_hash: Buffer`
    - Entity contains `cost_model_version INT NOT NULL DEFAULT 1` or `cost_model_version: number` default 1
    - Service contains string `sha256` and chain computation logic
    - Chain integrity spec asserts `verifyChain` returns `valid: false` after byte injection
    - Spec asserts STOCKPILE_ADJUSTMENT without SITE_MANAGER returns 403
    - `pnpm --filter=@gravel/api test stockpile-event stockpile-event-chain-integrity` exits 0
  </acceptance_criteria>
  <done>STK-01 event ledger with chain-of-hash and partitioning operational.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Outbox handler — TruckRotation.completed → STOCKPILE_INFLOW (transactional)</name>
  <files>
    apps/api/src/modules/stockpile/event-handlers/rotation-completed.handler.ts,
    apps/api/src/modules/stockpile/tests/outbox-stockpile-inflow.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts (W2-P04 — outbox publisher)
    - apps/api/src/modules/outbox/outbox-worker.processor.ts (W0-P01)
    - apps/api/src/modules/stockpile/services/stockpile-event.service.ts (Task 1)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-35"
  </read_first>
  <behavior>
    - On `production.transport.rotation_completed` event (dispatched by outbox worker): determine target stockpile from unloaded_at_zone_id (lookup stockpile WHERE zone_id=X). Append `STOCKPILE_INFLOW` with tonnage_delta_kg=+loaded_tonnage_kg, source_reference={ rotation_id, weighing_ticket_id }, occurred_at_utc=unloaded_at_utc.
    - Idempotent: if stockpile_event already exists with source_reference.rotation_id=X, skip (use unique partial index or pre-check).
    - cost_per_ton_minor_units computed via injected `StockpileValuationService.computeInflowCost(rotationId)` (Task 3 below).
  </behavior>
  <action>
    `@OnEvent('production.transport.rotation_completed') async handle(payload) { ... }`. Lookup stockpile by zone_id; check idempotency via `SELECT 1 FROM stockpile_event WHERE source_reference->>'rotation_id' = $1`. Call StockpileValuationService.computeInflowCost to get cost_per_ton + currency. Call StockpileEventService.append({event_type:'STOCKPILE_INFLOW', tonnage_delta_kg: loaded_tonnage_kg, ...}).

    Spec `outbox-stockpile-inflow.spec.ts`: simulate publishing rotation_completed event → assert one new stockpile_event row with type=STOCKPILE_INFLOW, tonnage_delta_kg = rotation tonnage in kg, source_reference.rotation_id = rotationId. Re-publish same event → assert no duplicate stockpile_event row (idempotency).
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- outbox-stockpile-inflow</automated>
  </verify>
  <acceptance_criteria>
    - Handler file contains `@OnEvent('production.transport.rotation_completed')`
    - Handler contains string `STOCKPILE_INFLOW`
    - Spec asserts new stockpile_event row created with correct tonnage_delta_kg
    - Spec asserts idempotency on duplicate event (only 1 stockpile_event row)
    - `pnpm --filter=@gravel/api test outbox-stockpile-inflow` exits 0
  </acceptance_criteria>
  <done>Outbox → STOCKPILE_INFLOW path proven, idempotent.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: stockpile_balance projection + stockpile_threshold + alerts emission + valuation</name>
  <files>
    apps/api/src/modules/stockpile/entities/stockpile-balance.entity.ts,
    apps/api/src/modules/stockpile/entities/stockpile-threshold.entity.ts,
    apps/api/src/modules/stockpile/services/stockpile-balance.service.ts,
    apps/api/src/modules/stockpile/services/stockpile-valuation.service.ts,
    apps/api/src/modules/stockpile/services/stockpile-threshold.service.ts,
    apps/api/src/modules/stockpile/event-handlers/balance-projection.handler.ts,
    apps/api/src/modules/stockpile/jobs/balance-recompute.job.ts,
    apps/api/src/modules/stockpile/migrations/1716300200000__create_stockpile_balance.sql,
    apps/api/src/modules/stockpile/migrations/1716300300000__create_stockpile_threshold.sql,
    apps/api/src/modules/stockpile/tests/stockpile-balance.spec.ts,
    apps/api/src/modules/stockpile/tests/stockpile-valuation.spec.ts,
    apps/api/src/modules/stockpile/tests/stockpile-threshold.spec.ts
  </files>
  <read_first>
    - apps/api/src/common/money/ (Phase 1 dinero.js helpers)
    - apps/api/src/modules/stockpile/services/stockpile-event.service.ts (Task 1)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-41, D2-42, D2-43, D2-74"
  </read_first>
  <behavior>
    - Balance projection: (tenant_id, site_id, stockpile_id, calibre_code) → { balance_kg BIGINT, last_event_id UUID, last_refresh_utc, weighted_avg_cost_per_ton_minor_units BIGINT, currency CHAR(3) }
    - On `production.stockpile.event_appended`: UPSERT projection with new balance = old.balance_kg + event.tonnage_delta_kg; if INFLOW, recompute weighted_avg = (old_avg*old_qty_t + event.cost_per_ton*event.qty_t) / (old_qty_t + event.qty_t)
    - Threshold crossing check on each projection update: if old_balance > low_kg AND new_balance <= low_kg → emit `production.stockpile.threshold_crossed` with severity=high (or critical if <= critical_low_kg); similar for high_kg
    - Threshold dedupe: only emit if crossing direction is new (don't spam every event below threshold)
    - Nightly job (BullMQ cron 03:00 site-tz): full recompute by summing all events; if computed != projected by > 1 kg → emit alert `production.stockpile.balance_drift_detected`
    - cost_model_version=1: cost per inflow = sum(fuel_liters_consumed * cost_per_liter) for the rotation chain in OperationalDay, prorated by tonnage. Phase 4 = version 2.
  </behavior>
  <action>
    Migration `__create_stockpile_balance.sql`:
    `CREATE TABLE stockpile_balance (tenant_id UUID NOT NULL, site_id UUID NOT NULL, stockpile_id UUID NOT NULL REFERENCES stockpile(id), calibre_code VARCHAR(50) NOT NULL, balance_kg BIGINT NOT NULL DEFAULT 0, last_event_id UUID NULL, last_refresh_utc TIMESTAMPTZ NOT NULL DEFAULT now(), weighted_avg_cost_per_ton_minor_units BIGINT NOT NULL DEFAULT 0, currency CHAR(3) NULL, PRIMARY KEY (tenant_id, stockpile_id, calibre_code))`. RLS.

    Migration `__create_stockpile_threshold.sql`:
    `CREATE TABLE stockpile_threshold (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, stockpile_id UUID NOT NULL REFERENCES stockpile(id), calibre_code VARCHAR(50) NOT NULL, critical_low_kg BIGINT NOT NULL, low_kg BIGINT NOT NULL, high_kg BIGINT NOT NULL, updated_by UUID NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (critical_low_kg < low_kg AND low_kg < high_kg), UNIQUE (tenant_id, stockpile_id, calibre_code))`. RLS.

    `StockpileBalanceService` listens on `production.stockpile.event_appended`. Performs SELECT FOR UPDATE on stockpile_balance row, computes new balance + new weighted_avg, UPSERT, returns { oldBalanceKg, newBalanceKg }. Calls `StockpileThresholdService.checkCrossing(oldBalance, newBalance, stockpileId, calibreCode)` which loads threshold row and emits `production.stockpile.threshold_crossed` with payload `{ tenant_id, site_id, stockpile_id, calibre_code, threshold_type: 'low'|'critical_low'|'high', balance_kg, low_kg, high_kg, severity }`.

    `StockpileValuationService.computeInflowCost(rotationId)`: aggregate fuel from related drilled_hole.fuel_liters_consumed + extraction_cycle (same operational_day, same bench) × fuel_tank_event.cost_per_liter (mock for Phase 2 if fuel module not yet ready — use simple stub returning `{ cost_per_ton_minor_units: 0n, currency: 'XOF' }` when fuel data missing). Note: real fuel cost wiring happens in W3-P06; this task delivers the shape and a stub.

    `BalanceRecomputeJob` (BullMQ cron `0 3 * * *` in site TZ): for each stockpile, sum tonnage_delta_kg from stockpile_event, compare to stockpile_balance.balance_kg; if abs(diff) > 1000 (1 kg) → emit `production.stockpile.balance_drift_detected`.

    Specs:
    - balance.spec: append 3 INFLOW events totaling +5000 kg → balance=5000; append 1 OUTFLOW -2000 → balance=3000.
    - valuation.spec: 2 INFLOW: 1000 kg @ 100/t cost, 1000 kg @ 200/t cost → weighted_avg = 150/t.
    - threshold.spec: configure low_kg=2000, critical_low_kg=500; INFLOW 5000 then OUTFLOW -3500 (cross low) → 1 threshold_crossed event 'low'. Another OUTFLOW -1000 (cross critical) → 1 'critical_low' event. Subsequent OUTFLOW -200 → no new event (already below).
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- stockpile-balance stockpile-valuation stockpile-threshold</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `CREATE TABLE stockpile_balance` and `weighted_avg_cost_per_ton_minor_units BIGINT`
    - Migration contains `CHECK (critical_low_kg < low_kg AND low_kg < high_kg)`
    - balance-projection.handler.ts contains `@OnEvent('production.stockpile.event_appended')`
    - threshold service emits event `production.stockpile.threshold_crossed`
    - valuation spec asserts weighted avg = 150 for the canonical scenario
    - threshold spec asserts no spam (only emit on crossing)
    - balance-recompute.job.ts contains `@Cron` or `BullMQ` and string `balance_drift_detected`
    - `pnpm --filter=@gravel/api test stockpile-balance stockpile-valuation stockpile-threshold` exits 0
  </acceptance_criteria>
  <done>STK-02 threshold alerts + STK-03 valuation working with projection.</done>
</task>

<task type="auto">
  <name>Task 4: Web stockpile UI — list, events drill-down, thresholds config, adjustment form</name>
  <files>
    apps/web/src/app/features/stockpile/stockpile.module.ts,
    apps/web/src/app/features/stockpile/stockpile-routes.ts,
    apps/web/src/app/features/stockpile/pages/stockpile-list.component.ts,
    apps/web/src/app/features/stockpile/pages/stockpile-list.component.html,
    apps/web/src/app/features/stockpile/pages/stockpile-events.component.ts,
    apps/web/src/app/features/stockpile/pages/stockpile-events.component.html,
    apps/web/src/app/features/stockpile/pages/stockpile-thresholds.component.ts,
    apps/web/src/app/features/stockpile/pages/stockpile-thresholds.component.html,
    apps/web/src/app/features/stockpile/pages/stockpile-adjustment.component.ts,
    apps/web/src/app/features/stockpile/pages/stockpile-adjustment.component.html
  </files>
  <read_first>
    - apps/web/src/app/features/transport/pages/rotation-list.component.ts (W2-P04 pattern)
    - apps/web/src/app/core/sse/sse-client.service.ts (W0-P01)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-43, D2-111"
  </read_first>
  <action>
    1. stockpile-list: AG Grid showing stockpile id, code, label, calibre, balance_kg (formatted with thousands), weighted_avg_cost (formatted in site currency, label "Coût moyen pondéré (v1 provisoire)"), threshold status (green/amber/red badge from comparing balance to thresholds).
    2. stockpile-events: AG Grid per stockpile showing event_type, tonnage_delta_kg, occurred_at, source_reference (truncated JSONB), created_by. Filters by date range, event_type.
    3. stockpile-thresholds: Formly form per (stockpile, calibre) editing critical_low_kg, low_kg, high_kg. Validation: critical_low < low < high. PATCH /thresholds.
    4. stockpile-adjustment: form to submit STOCKPILE_ADJUSTMENT — fields tonnage_delta_kg, reason (textarea), photo upload (uploads to S3 first, captures sha256). Server enforces SITE_MANAGER role.
    SSE subscription on stockpile-list to live-update balance.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web build</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/features/stockpile/stockpile.module.ts` exports `class StockpileModule`
    - stockpile-list.component.html displays `weighted_avg_cost` and label string `provisoire` or i18n key `stockpile.cost_provisional_label`
    - stockpile-thresholds.component.ts validates `critical_low_kg < low_kg < high_kg`
    - stockpile-adjustment.component.ts requires `reason` and `photo` (sha256)
    - `pnpm --filter=@gravel/web build` exits 0
  </acceptance_criteria>
  <done>Stockpile web UI live-updates balance, manages thresholds, allows authorized adjustments.</done>
</task>

<task type="auto">
  <name>Task 5: Refine ADR-0006 stockpile event sourcing</name>
  <files>docs/adr/ADR-0006-stockpile-event-sourcing.md</files>
  <read_first>
    - docs/adr/ADR-0006-stockpile-event-sourcing.md (draft from W0-P01)
    - apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql (Task 1)
  </read_first>
  <action>
    Promote to Accepted. Add `## Implementation Notes` with: migration paths, partition strategy (monthly RANGE on occurred_at_utc + auto-create for current+next 2 months), cost_model_version=1 scope (carburant only, Phase 4=v2), chain-of-hash columns, outbox materialization path from transport, idempotency via source_reference.rotation_id.
  </action>
  <verify>
    <automated>node -e "const c=require('fs').readFileSync('docs/adr/ADR-0006-stockpile-event-sourcing.md','utf8'); if(!c.includes('Accepted')||!c.includes('Implementation Notes')||!c.includes('cost_model_version')||!c.includes('PARTITION BY RANGE')){console.error('missing');process.exit(1);}console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - ADR Status changed to `Accepted`
    - ADR contains `## Implementation Notes`
    - ADR mentions `cost_model_version` and `PARTITION BY RANGE`
  </acceptance_criteria>
  <done>ADR-0006 promoted to Accepted.</done>
</task>

</tasks>

<verification>
- All stockpile tests green
- Chain-of-hash integrity test detects corruption
- Outbox → STOCKPILE_INFLOW idempotent
- Threshold alerts emitted correctly
- ADR-0006 Accepted
</verification>

<success_criteria>
- STK-01, STK-02, STK-03 covered
- Event ledger partitioned monthly
- Chain-of-hash verified via EventChainVerifier
- Outbox event consumption proven
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W2-P05-SUMMARY.md`.
</output>
