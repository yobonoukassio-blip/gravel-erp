# ADR-0013 — CON/CRI Stockpile Consumers (Crusher + Screening Output)

## Status

Draft — Phase 3 W0-P01. Date: 2026-05-13. Authors: Phase 3 planner + executor.

## Context

Crushed and screened material must feed into the existing `stockpile_event` append-only
ledger (from Phase 2 W2-P05). `CrusherSession` and `ScreeningSession` produce output
tonnages; those outputs must be materialized as `STOCKPILE_INFLOW` events on the target
stockpiles.

Key constraints:
1. The existing `StockpileEventService.append` API must be reused (not duplicated).
2. Crusher output is a single calibre (homogeneous crushed rock).
3. Screening output is multi-calibre: one `ScreeningCalibreYield` row per calibre per session.
4. Non-conforming material (excess fines, oversized) must be flagged separately.
5. Session events are NOT chain-of-hash audited (they are operational records, not financial ledger entries).

## Decision

### Outbox publication pattern

`CrusherSession.close()` publishes a `processing.crusher.session_closed` outbox event.
`ScreeningSession.close()` publishes a `processing.screening.session_closed` outbox event.

`StockpileModule` subscribes via `@OnEvent` handlers:
- `CrusherSessionClosedHandler` → calls `StockpileEventService.append(STOCKPILE_INFLOW, crusher_output_tonnage)`
- `ScreeningSessionClosedHandler` → for each calibre yield, calls `StockpileEventService.append(STOCKPILE_INFLOW, calibre_tonnage)`

### Compound idempotency key for multi-calibre screening

The idempotency key for `ScreeningSessionClosedHandler` per calibre is:
```
source_reference->>'session_id' || '_' || source_reference->>'calibre_code'
```
This prevents double-materialization on outbox replay for any individual calibre within a session.

### No chain-of-hash on session tables

`CrusherSession` and `ScreeningSession` are operational records (who operated the machine, when,
what quantities). They are NOT financial or regulatory records, so chain-of-hash is not applied.
The `StockpileEventService.append` path IS chain-of-hash audited, providing the required
immutability for the inventory ledger.

### No sessions entity in OperationalDay

`CrusherSession` and `ScreeningSession` record their own `start_time_utc` and `end_time_utc`.
They are linked to `operational_day_id` for reporting but do NOT gate OperationalDay closure
(unlike blast plans which use `closure_blockers`).

## Consequences

**Positive:**
- Reuses `StockpileEventService.append` without code duplication.
- Multi-calibre screening handled via compound key — clean idempotency.
- Session tables stay simple (no chain-of-hash complexity).

**Negative:**
- Two-hop propagation: Session close → outbox event → StockpileHandler → append. Stock balance
  is not instantly updated at session close — there is a small processing delay (~100ms) through
  the EventEmitter2 in-process event. For Phase 3, this is acceptable. Phase 5 will use Redpanda
  for durable cross-service propagation.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| Direct `StockpileEventService.append` call from CrusherService | Creates a direct dependency between CON and STK modules. Outbox pattern maintains loose coupling. |
| Chain-of-hash on session tables | Over-engineering for operational records. The ledger (stockpile_event) is already chain-of-hash. |
| Single idempotency key per session for multi-calibre | Would prevent partial replay recovery. Compound key per calibre is safer. |

## References

- `apps/api/src/modules/stockpile/services/stockpile-event.service.ts`
- `apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql`
- ADR-0006 (stockpile event sourcing)
