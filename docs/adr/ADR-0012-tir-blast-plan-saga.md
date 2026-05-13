# ADR-0012 — TIR Blast Plan Saga (State Machine + Append-Only Chain)

## Status

Draft — Phase 3 W0-P01. Date: 2026-05-13. Authors: Phase 3 planner + executor.

## Context

Blast operations are the highest-risk activity in a quarry: incorrect explosives quantities,
invalid operator certifications, or missing HSE clearance can cause fatal accidents and legal
liability. The system must:

1. Track the blast plan lifecycle (draft → approved → loaded → fired → reported).
2. Provide an immutable, auditable record of every explosives movement.
3. Enforce a 4-hour clearance window between HSE approval and ignition.
4. Support offline mobile data entry (blast charges scanned in the field, synced when back online).
5. Generate a PDF blast report without blocking the operational flow.

## Decision

### State machine vs append-only for blast_plan

`blast_plan` is a **mutable state machine** using `pessimistic_lock` sync strategy.
It tracks the lifecycle state: `DRAFT → HSE_APPROVED → LOADED → FIRED → REPORTED`.
Pessimistic lock is correct here: at most one supervisor transitions the plan at any time.

`blast_charge`, `explosives_event`, and `blast_report` are **append-only with chain-of-hash**
(same pattern as `stockpile_event`, `hse_incident`). These are financial/regulatory records
that must be immutable. The `EventChainVerifier` is pre-registered for `explosives_event`
and `blast_report` in Phase 3 W0-P01 so W1-P02 can append without touching the verifier file.

### Clearance saga

HSE clearance is modeled as an EventEmitter2-based cross-module saga:

1. Blast supervisor calls `requestClearance(blastPlanId)` → emits `tir.blast_plan.clearance_requested`.
2. HSE module receives the event and creates a clearance task (linked to `blast_plan_id`).
3. `HSE_OFFICER` approves via a mobile/web action → emits `tir.blast_plan.clearance_granted`.
4. TIR module transitions `blast_plan.status = HSE_APPROVED` and sets `clearance_granted_at`.
5. A BullMQ job (`ClearanceTimeoutJob`) fires after 4 hours if the plan has not been `FIRED`.
   If timeout: emits `tir.blast_plan.clearance_expired`, plan transitions to `DRAFT`.

### OperationalDay.closure_blockers

When `blast_plan.status = LOADED` and `explosives_reconciliation_pending = true`,
the TIR `ExplosivesReconciliationJob` calls:
```
OperationalDayService.blockClosure(dayId, 'EXPLOSIVES_RECONCILIATION_PENDING')
```
Day closure is blocked until the blast plan reaches `REPORTED` and reconciliation is clean.

### Canonical payload field order — FROZEN

`explosives_event` canonical payload field order (frozen):
`event_type, product_type, quantity_g, site_id, occurred_at_utc, source_reference`

`blast_report` canonical payload field order (frozen):
`blast_plan_id, fragmentation_obs, vibration_mm_s, incident_ids, occurred_at_utc`

These orders match `CANONICAL_PAYLOAD_SQL.explosives_event` and `CANONICAL_PAYLOAD_SQL.blast_report`
in `event-chain.verifier.ts`. Changing them retroactively breaks all existing row verifications.

### PDF snapshot

Blast report PDF is generated asynchronously via BullMQ (`BlastReportPdfJob`) after
`blast_report` row insertion. The job reads from the DB and uploads to S3. PDF generation
NEVER blocks the event-append transaction — at-most-once generation, and the re-run script
can regenerate from immutable DB rows if the job fails.

## Consequences

**Positive:**
- Immutable chain-of-hash on explosives and blast_report provides regulatory-grade audit trail.
- Clearance saga decouples TIR and HSE modules — they communicate only via EventEmitter2.
- `closure_blockers` pattern prevents premature OperationalDay closure without hard-coding TIR logic into the Day entity.

**Negative:**
- 4-hour clearance timeout requires BullMQ to be available. If Redis is down, clearance jobs may not fire. Mitigated by BullMQ retry + the timeout check on every blast plan status query.
- PDF generation failure is silently deferred — operators do not get immediate feedback. Mitigated by AlertsModule notification when PDF job fails after 3 retries.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| Mutable `blast_report` row | Regulators require immutable blast records. Rejected. |
| Synchronous PDF in transaction | Blocks append transaction for 2-5s. Unacceptable for offline sync replay. Rejected. |
| 1-hour clearance timeout | Too short: HSE officer may be in another part of the site. 4 hours matches industry practice. |
| SAGA coordinator pattern | Full saga orchestration (compensation transactions) overkill for a 5-state machine. EventEmitter2 is sufficient for Phase 3. |

## References

- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` (explosives_event + blast_report registrations)
- `apps/api/src/modules/rh/migrations/1717000600000__alter_operational_day_closure_blockers.sql`
- `apps/api/src/modules/rh/services/employee.service.ts` (blockClosure / resolveClosure)
- ADR-0004 (chain-of-hash pattern)
- ADR-0011 (habilitation as-of gate used at blast loading)
