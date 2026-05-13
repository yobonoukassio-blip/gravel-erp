# ADR-0007 — Fuel tank event-sourcing & nightly reconciliation

## Status

Accepted — refined in Phase 2 W3 P06. Date: 2026-05-13. Authors: Phase 2 planner + executor.

## Context

Fuel is the single biggest **direct cost** in Phase 2 valuation (D2-42)
and the input to anomaly detection (D2-52, ratio L/h). Like stockpile,
fuel benefits from event-sourcing: deliveries, refuels, and adjustments
must remain auditable forever, and the same chain-of-hash protects
against tampering with cost records.

Repo touchpoints:

- `apps/api/src/modules/fuel/` — Wave 3 (this plan)
- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` (W0)
- `apps/api/src/modules/alerts/alerts.event-handlers.ts` (W0) consumes
  `production.fuel.anomaly_detected`
- D2-50..D2-53 (02-CONTEXT.md)

## Decision

`fuel_tank_event` append-only table, monthly partitions on
`occurred_at_utc`. Event types (4):

- `FUEL_DELIVERY_IN` — supplier delivery; requires scanned supplier BL
  (`source_reference.supplier_bl_sha256`). Carries
  `cost_per_liter_minor_units` + `currency` — these values propagate to
  per-equipment cost via dispense events.
- `FUEL_DISPENSE_OUT` — paired 1:1 with an `EquipmentRefuel` row (D2-51).
- `FUEL_ADJUSTMENT` — manual gauge correction, `SITE_MANAGER` only.
  Requires gauge photo (`source_reference.gauge_photo_sha256`) + reason.
- `FUEL_RECONCILIATION` — **informational only**, written by the nightly
  job at 03:30 site-tz. Does NOT correct stock; corrections require a
  `FUEL_ADJUSTMENT` event from a SITE_MANAGER.

Common columns mirror stockpile (D2-50): `id, tenant_id, site_id, tank_id,
event_type, liters_delta (signed), operational_day_id, source_reference,
occurred_at_utc, created_by, prev_hash, row_hash, cost_per_liter_minor_units,
currency`.

**Reconciliation rule:** Nightly 03:30 site-tz BullMQ job per tank
recomputes the theoretical balance = `sum(liters_delta)` since genesis.
Compares to the projected `fuel_tank_balance`. If
`|drift| > 0.5%` of tank capacity, emits
`production.fuel.reconciliation_drift_detected` → alert to Directeur Site.

**Anomaly detection:** Rolling 7-day `liters_per_hour` per equipment vs
30-day median. If observed ratio `> 1.5 × median` or `< 0.4 × median`,
emit `production.fuel.anomaly_detected` (consumed by AlertsEventHandlers
W0). Multiplier configurable per site.

## Implementation Notes

### Event types (4)

| Type | liters_delta | Author | Requires |
|------|-------------|--------|----------|
| `FUEL_DELIVERY_IN` | > 0 | Any CHEF_CARRIERE+ | source_reference.supplier_bl_sha256 |
| `FUEL_DISPENSE_OUT` | < 0 | System (atomic refuel tx) | refuel_id in source_reference |
| `FUEL_ADJUSTMENT` | signed | SITE_MANAGER only | gauge_photo_sha256 + reason |
| `FUEL_RECONCILIATION` | = 0 (informational) | System (nightly cron) | theoretical/projected/drift |

### Partitioning

Monthly range partitions on `occurred_at_utc` — identical pattern to `stockpile_event`.
Initial partitions: 2026-05, 2026-06, 2026-07. Run-book extends quarterly.

### Chain-of-hash columns

`prev_hash BYTEA` and `row_hash BYTEA` (32 bytes each, SHA-256).
- Genesis: `prev_hash = Buffer.alloc(32, 0)` (32 zero bytes)
- Each row: `row_hash = sha256(prev_hash_n || canonical_payload_n)`
- Canonical payload: `jsonb_build_object(event_type, tank_id, liters_delta, operational_day_id, source_reference, occurred_at_utc, cost_per_liter_minor_units, currency)::text`
- Verified by `EventChainVerifier.verifyChain('fuel_tank_event', tenantId)` (W0 verifier)

### Atomic refuel pattern (3 inserts in 1 tx)

`EquipmentRefuelService.create()` opens a single transaction and:
1. Appends `FUEL_DISPENSE_OUT` to `fuel_tank_event` (–liters_delta)
2. Inserts `equipment_refuel` row
3. Inserts `equipment_fuel_consumption` row (with `hours_since_previous` computed)

Validation: `equipment_hour_meter_reading >= previous_reading` (rejects regression
with `ERR_HOUR_METER_REGRESSION 400`).

### Nightly reconciliation cron

- **Schedule:** BullMQ / `@Cron('30 3 * * *')` — 03:30 UTC (per-site TZ scheduling Phase 4)
- **Drift threshold:** `0.5%` of `fuel_tank.capacity_liters`
- **Event inserted:** `FUEL_RECONCILIATION` (liters_delta = 0) always
- **Alert emitted:** `production.fuel.reconciliation_drift_detected` only when drift > 0.5%

### Anomaly detection cron

- **Schedule:** `@Cron('0 4 * * *')` — 04:00 UTC daily
- **Window:** 7-day rolling ratio vs 30-day preceding median (`percentile_cont(0.5)`)
- **High threshold:** `ratio_7d > 1.5 × median_30d` → severity: 'high'
- **Low threshold:** `ratio_7d < 0.4 × median_30d` → severity: 'low'
- **Alert emitted:** `production.fuel.anomaly_detected` (consumed by W0 AlertsEventHandlers)

## Consequences

Positive:

- Single source of truth for fuel cost flowing into stockpile valuation.
- Drift detection makes silent leaks / theft visible without manual
  monthly audits.
- Anomaly detection surfaces engine problems early (mechanical drift
  before failure).
- Chain-of-hash audit trail is tamper-evident: any update/delete attempt
  is caught by `EventChainVerifier` and blocked by DB trigger.

Negative:

- The 0.5% threshold is arbitrary; pilots may need to tune it. Document
  the override mechanism per site.
- Cost-per-liter propagation is FIFO-ish via OperationalDay window —
  perfect average requires Phase 4 re-valorization.

## Alternatives Considered

- **Direct mutation of a `fuel_tank` row** — rejected, same reasons as
  stockpile (Pitfall 1, audit, adjustment trail).
- **External fuel-management vendor integration** — deferred to Phase 5
  IoT (capteurs cuve). Phase 2 stays manual-entry-friendly.

## References

- D2-50, D2-51, D2-52, D2-53 — `.planning/phases/02-vertical-slice-production/02-CONTEXT.md`
- ADR-0004 — chain-of-hash; ADR-0006 — stockpile twin pattern
- `apps/api/src/modules/alerts/` (W0) — consumes anomaly + drift events

## Note on `FUEL_RECONCILIATION` event

The literal token `FUEL_RECONCILIATION` appears here verbatim because
downstream code search relies on it.
