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

## References

- D2-40, D2-41, D2-42, D2-43 — `.planning/phases/02-vertical-slice-production/02-CONTEXT.md`
- ADR-0004 — chain-of-hash pattern (per-table generalization in W0)
- ADR-0001 — RLS, applied to every partition
- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` (W0)
