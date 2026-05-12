# ADR-0007 — Fuel tank event-sourcing & nightly reconciliation

## Status

Draft — to be refined in Wave 2 (fuel module). Date: 2026-05-12. Authors: Phase 2 planner.

## Context

Fuel is the single biggest **direct cost** in Phase 2 valuation (D2-42)
and the input to anomaly detection (D2-52, ratio L/h). Like stockpile,
fuel benefits from event-sourcing: deliveries, refuels, and adjustments
must remain auditable forever, and the same chain-of-hash protects
against tampering with cost records.

Repo touchpoints:

- `apps/api/src/modules/fuel/` — Wave 2
- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` (W0)
- `apps/api/src/modules/alerts/alerts.event-handlers.ts` (W0) consumes
  `production.fuel.anomaly_detected`
- D2-50..D2-53 (02-CONTEXT.md)

## Decision

`fuel_tank_event` append-only table, monthly partitions on
`occurred_at_utc`. Event types:

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

## Consequences

Positive:

- Single source of truth for fuel cost flowing into stockpile valuation.
- Drift detection makes silent leaks / theft visible without manual
  monthly audits.
- Anomaly detection surfaces engine problems early (mechanical drift
  before failure).

Negative:

- The 0.5 % threshold is arbitrary; pilots may need to tune it. Document
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
