# ADR-0006 — Stockpile event-sourced schema and valuation (Phase 2 v1)

## Status

Accepted — refined and implemented in Phase 2 W2 P05 (2026-05-12).
Original draft: W0-P01. Authors: Phase 2 planner + W2 implementor.

## Context

Stockpile is the central inventory state of the quarry: at any instant the
business needs to know "how many kg of granite_brut are currently in pile
STK-02". The naïve approach (mutating a single `stockpile` row on every
truck rotation) loses audit history, makes inventory adjustments
indistinguishable from sales, and bottlenecks under concurrent writes.

Phase 2 covers FOR-01..05 + STK-01..03. Stockpile feeds Phase 4 finance
(cost/ton consolidation) and Phase 3 sales (BL outflow). Whatever shape
ships in Phase 2 will be re-read by every downstream module — the schema
deserves a deliberate decision.

Repo touchpoints:

- `apps/api/src/modules/stockpile/` — to be created Wave 2
- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` (W0)
- `apps/api/src/modules/outbox/` (W0) — materialization tx
- D2-40, D2-41, D2-42, D2-43 (02-CONTEXT.md)

## Decision

Stockpile state is **event-sourced** in `stockpile_event`, an append-only
table **partitioned BY RANGE on `occurred_at_utc` (monthly)**. Event
types:

- `STOCKPILE_INFLOW` — materialized from `TruckRotation.unloaded_at_utc`
  via outbox (same tx as the rotation row, D2-35)
- `STOCKPILE_OUTFLOW_SALE` — Phase 3 ventes (placeholder column only in Phase 2)
- `STOCKPILE_ADJUSTMENT` — manual inventory correction. Role `SITE_MANAGER`
  only (D2-111). Requires `reason` text + `photo_blob_sha256`.
- `STOCKPILE_TRANSFER` — inter-pile move within the same site

Common columns per D2-40:

```
id, tenant_id, site_id, stockpile_id, event_type, tonnage_delta_kg (signed),
material_type, calibre_code, operational_day_id, source_reference (JSONB),
occurred_at_utc, created_by, prev_hash, row_hash
```

Each row is verified by the generic `EventChainVerifier` (W0 ADR-0006
companion) — chain-of-hash sha256 reproducing ADR-0004's pattern.

**Valuation:** `cost_model_version = 1`. Every `STOCKPILE_INFLOW` carries a
weighted-average cost-per-ton computed from the carburant attributed to
the contributing extraction + transport chain over the OperationalDay
window. `cost_model_version = 2` (full direct cost + amortization + labor)
lands Phase 4 with an optional re-valorization job.

Projection table `stockpile_balance (tenant_id, site_id, stockpile_id,
calibre_code) → balance_kg, last_event_id, last_refresh_utc` rebuilt by
event handler and recomputed nightly (03:00 site-tz) to detect drift > 1 kg.

## Consequences

Positive:

- Full audit history for free — every kg movement has a row.
- Chain-of-hash makes tampering detectable; reuses W0 generic verifier.
- Phase 4 re-valorization is mechanical: replay events with
  cost_model_version = 2.
- Monthly partitioning keeps `INSERT` hot path cheap; old partitions can
  be detached and frozen.

Negative:

- Read latency is non-trivial: rebuilding balance from N months of events
  requires the projection table. Drift detection is mandatory.
- Adjustments are accounting-visible: every correction is a row with a
  trail (this is the point but it means UX must be careful).
- 4 event types is the minimum — adding a 5th later requires a migration
  and a chain re-verification.

## Alternatives Considered

- **Single mutable `stockpile` row** — rejected: loses history, conflicts
  with Pitfall 1 (immutability), no audit for STK adjustments.
- **Double-entry ledger (debit/credit pairs per movement)** — rejected
  for Phase 2: needlessly complex when only one stockpile mutates per
  event; revisit Phase 4 if cross-pile transfers become frequent.
- **TimescaleDB hypertable for events** — deferred. Plain RANGE
  partitioning is simpler and works fine at 500 rotations/day; reconsider
  Phase 5 when IoT scales volumes 10x.

## Implementation Notes

Concrete shape as shipped in Phase 2 W2 P05 (2026-05-13). This section is
the authoritative reference; the migrations under
`apps/api/src/modules/stockpile/migrations/` are the source of truth.

### Schema (migrations)

- `1716300000000__create_stockpile.sql` — master row: `(tenant_id, site_id,
  zone_id, code UNIQUE per tenant_site, label, default_calibre_code)`, RLS
  on `tenant_id`.
- `1716300100000__create_stockpile_event_partitioned.sql` — append-only
  event ledger:
  - Enum `stockpile_event_type` with exactly four values:
    `STOCKPILE_INFLOW`, `STOCKPILE_OUTFLOW_SALE`, `STOCKPILE_ADJUSTMENT`,
    `STOCKPILE_TRANSFER`.
  - Columns: `id, tenant_id, site_id, stockpile_id, event_type,
    tonnage_delta_kg (signed BIGINT kg), material_type, calibre_code,
    operational_day_id, source_reference JSONB, occurred_at_utc, created_by,
    prev_hash BYTEA, row_hash BYTEA, cost_per_ton_minor_units BIGINT NULL,
    currency CHAR(3) NULL, cost_model_version INT NOT NULL DEFAULT 1`.
  - `PRIMARY KEY (id, occurred_at_utc)` and `PARTITION BY RANGE
    (occurred_at_utc)`. Monthly partitions created for the current month +
    next two (2026-05, 2026-06, 2026-07); a quarterly run-book extends the
    list ahead of time.
  - Unique partial index `stockpile_event_rotation_uq ON (tenant_id,
    source_reference->>'rotation_id')` — defense-in-depth idempotency for
    outbox replays.
  - `BEFORE UPDATE OR DELETE` trigger raises `restrict_violation` — DB-level
    enforcement that the table is append-only.
  - RLS on the partitioned parent (`tenant_id = current_setting(
    'app.current_tenant', true)::uuid`) cascades to all partitions.
- `1716300200000__create_stockpile_balance.sql` — projection keyed by
  `(tenant_id, stockpile_id, calibre_code)` with `balance_kg,
  last_event_id, last_refresh_utc, weighted_avg_cost_per_ton_minor_units,
  currency`.
- `1716300300000__create_stockpile_threshold.sql` — per-(stockpile,
  calibre) bands with `CHECK (critical_low_kg < low_kg < high_kg)`.

### Chain-of-hash

`row_hash = SHA-256(prev_hash ‖ canonical_payload)` where
`canonical_payload` is `JSON.stringify` of
`{event_type, stockpile_id, tonnage_delta_kg, material_type, calibre_code,
operational_day_id, source_reference, occurred_at_utc}` in that fixed key
order. Genesis sentinel is 32 zero bytes.

The writer (`StockpileEventService.append`) selects the latest
`row_hash` for the tenant inside the same transaction, computes the new
hash, and inserts the row. The generic `EventChainVerifier.verifyChain
('stockpile_event', tenantId)` (W0-P01) re-derives the payload server-side
via `CANONICAL_PAYLOAD_SQL.stockpile_event` and compares. A 100-event
fixture + injected single-byte corruption test (`apps/api/test/unit/
stockpile/stockpile-event-chain-integrity.spec.ts`) proves detection.

### Outbox materialization (transport → stockpile)

`RotationCompletedHandler` (`apps/api/src/modules/stockpile/event-handlers/
rotation-completed.handler.ts`) subscribes to
`production.transport.rotation_completed` (published by W2-P04 transport
in the same DB tx as `rotation.unloaded_at_utc`). For each event:

1. Look up the target stockpile by `(tenant_id, unloaded_at_zone_id)`.
2. Call `StockpileValuationService.computeInflowCost(...)` (v1 stub
   returns `{costPerTonMinorUnits: 0n, currency: 'XOF'}` until the fuel
   module wires real cost-per-liter in W3-P06; the response shape is
   final).
3. `StockpileEventService.append(...)` with
   `eventType=STOCKPILE_INFLOW`, `tonnage_delta_kg=+loaded_tonnage_kg`,
   `source_reference={rotation_id, weighing_ticket_id}`.

Idempotency is enforced twice: pre-check in the service via
`source_reference->>'rotation_id'`, and DB-level by the unique partial
index. The handler is safe to invoke multiple times for the same event.

### Valuation (cost_model_version)

`cost_model_version = 1` (Phase 2) — carburant-only attribution. The
recomputation formula on every INFLOW is:

```
new_avg = (old_avg * old_balance_kg + new_cost_per_ton * new_inflow_kg)
        / (old_balance_kg + new_inflow_kg)
```

Operating in `bigint` minor units; integer truncation is acceptable at v1.
Phase 4 will introduce `cost_model_version = 2` (direct cost + amortization
+ labor) with an optional re-valorization job that replays events under
the new model — possible precisely because the ledger is append-only.

### Projection and drift detection

`BalanceProjectionHandler` listens on `production.stockpile.event_appended`
and applies the delta atomically (`SELECT FOR UPDATE` on the projection
row → balance + weighted-avg update → UPSERT). Threshold-crossing checks
run after the projection tx commits so a downstream alert failure cannot
roll back inventory state.

`BalanceRecomputeJob` (`@Cron(EVERY_DAY_AT_3AM)`) recomputes every
projection row from the underlying events; drift > 1 kg emits
`production.stockpile.balance_drift_detected` for ops triage. Per-site TZ
scheduling is deferred to Phase 4 (currently UTC).

### Threshold dedupe (STK-02)

`StockpileThresholdService.checkCrossing` is edge-triggered:

- `old > critical_low && new <= critical_low` → emit `'critical_low'`
  with `severity=critical` (takes precedence over `low`).
- `old > low && new <= low` → emit `'low'` with `severity=high`.
- `old < high && new >= high` → emit `'high'` with `severity=low`.

Subsequent events that stay on the same side do not re-emit. This avoids
alert spam while preserving "first crossing wins" semantics.

## References

- D2-40, D2-41, D2-42, D2-43 — `.planning/phases/02-vertical-slice-production/02-CONTEXT.md`
- ADR-0004 — chain-of-hash pattern (per-table generalization in W0)
- ADR-0001 — RLS, applied to every partition
- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` (W0)
- `apps/api/src/modules/stockpile/` — implementation
- `apps/api/test/unit/stockpile/` — unit specs (chain integrity, outbox,
  projection, valuation, threshold)
