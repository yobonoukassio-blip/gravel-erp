# ADR-0011 — RH Habilitation As-Of Query

## Status

Draft — Phase 3 W0-P01. Date: 2026-05-13. Authors: Phase 3 planner + executor.

## Context

The TIR (blast-mine) module requires a hard block when the designated blast operator
does not hold a valid `PERMIS_EXPLOSIFS` certification at the time of blast loading.
Similarly, the MNT (maintenance) module blocks assignment of technicians to hazardous
work orders when `FORMATION_HSE` is expired.

The naive approach — checking `valid_to >= now()` inside the service — is dangerous:
replayed events, backdated operational days, and unit tests all need deterministic
results. Calling `new Date()` inside `isValidAt` makes the function impure, unreproducible,
and untestable at boundary cases (first day valid, last day valid, day after expiry).

Phase 2 W3-P07 deferred the habilitation model to Phase 3 and created a stub design
in `docs/phase-03-handoff/hse-rh-deferred-scope.md`. This ADR formalizes the decisions
made during Phase 3 W0-P01 implementation.

## Decision

1. **Temporal model**: `employee_certification` uses `valid_from DATE` and `valid_to DATE`
   (not `TIMESTAMPTZ`). Certifications are calendar-day granular. The `CHECK (valid_to >= valid_from)`
   constraint prevents inverted date ranges at the schema level.

2. **As-of gate contract**: `RhHabilitationService.isValidAt(employeeId, certCode, asOfDate)`
   always receives an explicit `asOfDate: Date` parameter. The method NEVER calls `new Date()`
   internally. Callers supply `operationalDay.shiftStartLocal` as the reference date for
   operational decisions, or the current UTC day for real-time checks. This is enforced by
   code review and documented in service JSDoc.

3. **Hard-block vs soft-warning**: The default is **hard-block** — `isValidAt` returns `false`
   and the calling service throws `BadRequestException({ code: 'HABILITATION_INVALID' })`.
   A dual-supervisor emergency override pattern exists for crisis situations: two users with
   `TIR_SUPERVISOR` role must both sign off, creating an `override_reason` JSONB entry on
   the blast_plan row. This override is logged in the audit trail. Emergency override is NOT
   implemented in Phase 3 W1 — deferred to Phase 4 on request.

4. **Subcontractor employee parity**: Subcontractor employees are stored in the same `employee`
   table with `subcontractor_id` set. The `employee_certification` FK points to `employee.id`
   regardless of whether the employee is direct-hire or subcontractor. `isValidAt` works
   identically for both.

5. **Expiry alerts**: `getExpiringCertifications(siteId, asOfDate, withinDays=30)` emits
   `rh.certification.expiring_soon` via EventEmitter2, translated to an `AlertsService` row
   by `AlertsEventHandlers`. The alert fires when the check runs (typically scheduled nightly
   via BullMQ); it does NOT fire at row-insert time.

## Consequences

**Positive:**
- `isValidAt` is a pure function in all but the DataSource interaction — easily unit-testable.
- Replayed events, backdated operational days, and time-zone-crossing shifts all produce
  deterministic results because the reference date is always explicit.
- 6 boundary-case unit tests cover the contract completely.

**Negative:**
- Callers MUST pass the correct `asOfDate`. Calling `isValidAt(id, code, new Date())` in a
  controller is technically valid but semantically wrong for batch/replay contexts. Enforced
  by documentation and code review checklist.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| `valid_to TIMESTAMPTZ NOT NULL` | Hour-granular expiry adds complexity with no operational benefit. Certifications expire at calendar-day precision everywhere in the mining industry. |
| `valid_to NULL = permanent` | Nullable valid_to requires NULL-handling in every query. Explicit far-future date (e.g. 2099-12-31) is simpler and explicit. |
| Soft-warning only (no hard-block) | Regulatory risk: if a blast occurs with an expired explosives permit, liability rests with the operator. Hard-block is the conservative and correct default. |
| Calling `new Date()` inside `isValidAt` | Makes the function impure, breaks unit tests, and prevents correct replay behavior. Rejected. |

## References

- `apps/api/src/modules/rh/services/rh-habilitation.service.ts`
- `apps/api/src/modules/rh/entities/employee-certification.entity.ts`
- `apps/api/src/modules/rh/migrations/1717000200000__create_employee_certification.sql`
- `docs/phase-03-handoff/hse-rh-deferred-scope.md` (Phase 2 stub)
- Phase 3 PITFALLS.md #7 — Temporal habilitation validity
