# ADR-0008 — HSE incident immutability + CAPA workflow

## Status

Accepted — implemented in Phase 2 W3 P07. Date: 2026-05-13. Authors: Phase 2 planner + executor.

## Context

HSE incident records are legally sensitive: they can be subpoenaed by
mining authorities, used in worker compensation cases, and reviewed by
parent-group internal audit. Any system where an operator can quietly
edit an incident description after the fact is unfit for purpose. The
Phase 1 audit trail (chain-of-hash on `audit_log`) protects metadata
about edits, but the **incident row itself must be append-only** — at the
schema level, not just by convention.

Repo touchpoints:

- `apps/api/src/modules/hse/` — Wave 3
- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` (W0)
- `infra/modules/s3-objectlock/` (W0) — attachment retention
- D2-60, D2-61, D2-62 (02-CONTEXT.md)

## Decision

`HseIncident` is append-only with **chain-of-hash D-28** applied
**directly to the incident row itself** (not just `audit_log` shadow).
`prev_hash`, `row_hash` columns; chain verified by the W0
`EventChainVerifier` against `hse_incident` table.

Edits to an incident's chronology after creation generate a separate
append-only row `HSE_INCIDENT_CHRONOLOGY_APPENDED` linking to the
original via `appends_to_incident_id`. Never an `UPDATE`.

**CAPA (corrective action) workflow:**

- `CorrectiveAction` is NOT append-only (status transitions are normal
  business behavior: `open → in_progress → done → verified → closed`).
- Standard `@Auditable()` decorator captures every status change in
  `audit_log` (Phase 1 chain).
- **Blocking rule:** an incident with `severity ≥ 4` cannot be marked
  `closed` until all its CAPAs are in state `verified`. Enforced at
  service layer (`HseService.closeIncident()`).

**Attachments:**

- Photos + scanned documents are content-addressed (sha256 of bytes →
  S3 key).
- Bucket uses Object Lock in GOVERNANCE mode with 7-year retention (W0
  `infra/modules/s3-objectlock`). Switchable to Compliance after legal
  review (`docs/operations/legal-review-queue.md`).
- The "7 years" retention aligns with OHADA bookkeeping retention
  windows. The legal-review queue tracks whether 7 years is the right
  duration for CI mining authorities specifically.

## Consequences

Positive:

- Tampering with an incident requires rewriting the chain forward;
  detected by the W0 verifier on every PR and nightly.
- Object Lock means even compromised root account credentials cannot
  permanently delete HSE attachments within the retention window
  (Compliance mode) or trivially (Governance mode).
- CAPA blocking rule prevents premature closure of severe incidents — a
  documented HSE pitfall (Pitfall 7).

Negative:

- The chronology-append pattern complicates UX: "edit" is really
  "append a corrigendum"; the UI must make this clear.
- Severity scale (1–5) is a placeholder pending legal calibration with
  CI HSE officer (tracked in `docs/operations/legal-review-queue.md`).
- 7 years of immutable attachments has a non-trivial storage cost; budget
  reviewed at Phase 4.

## Alternatives Considered

- **Standard audit_log only** — rejected: a privileged DBA could
  drop+recreate `hse_incident` and silence the partition's chain. Direct
  on-row chain makes that detectable.
- **Compliance mode by default** — deferred to legal review; Governance
  applied now per `docs/operations/legal-review-queue.md` default.

## References

- D2-60, D2-61, D2-62, D2-111 — `.planning/phases/02-vertical-slice-production/02-CONTEXT.md`
- ADR-0004 — chain-of-hash pattern
- ADR-0001 — RLS on `hse_incident` partitions
- `infra/modules/s3-objectlock/` — bucket module
- `docs/operations/legal-review-queue.md` — Compliance vs Governance pending

## Implementation Notes

### Chain-of-hash columns

`hse_incident` carries `prev_hash BYTEA` and `row_hash BYTEA` on every row.
The chain is computed as:

```
row_hash[n] = sha256(prev_hash[n] || canonical_payload[n])
prev_hash[n] = row_hash[n-1]   (or 32-zero genesis for n=0)
```

The canonical payload is defined in `EventChainVerifier.CANONICAL_PAYLOAD_SQL.hse_incident`
and mirrored in `buildHseIncidentCanonicalPayload()` in `hse-incident.service.ts`.

### Append-only enforcement

Two layers:
1. **Controller layer**: PATCH, PUT, DELETE return 405 Method Not Allowed via `rejectPatch()`.
2. **DB trigger layer**: `trg_hse_incident_no_update` and `trg_hse_incident_no_delete` raise
   exceptions on any UPDATE or DELETE, blocking even privileged DB accounts.

### HSE_INCIDENT_CHRONOLOGY_APPENDED

Corrections to a filed incident are submitted as a new row with a future
`appends_to_incident_id` FK column. This column is not implemented in Phase 2 (no corrections
have been required in the pilot). Phase 3 can add the column + new `hse_category` value
`chronology_amendment` if the pilot mandates it.

### S3 Object Lock — GOVERNANCE mode, 7 years

Pre-signed PUT URLs include:
- `x-amz-object-lock-mode: GOVERNANCE`
- `x-amz-object-lock-retain-until-date: <now + 7 years>`

The object key is the SHA-256 hex of the file content (content-addressed storage).
`confirmUpload()` validates that the received SHA matches the declared SHA before
persisting the `hse_attachment` row — enforcing `ERR_HASH_MISMATCH` on tampered uploads.

### Severity≥4 closure guard

`HseIncidentService.close()` queries:
```sql
SELECT COUNT(*) FROM corrective_action
 WHERE incident_id = $1 AND tenant_id = $2 AND status != 'verified'
```
If the count > 0 and incident.severity >= 4, throws `ERR_CAPA_NOT_VERIFIED` (400).

### Role split

| Operation | Required role |
|-----------|---------------|
| Create incident | Any authenticated user (reporter_user_id from JWT) |
| Create / assign CAPA | HSE_OFFICER or SITE_MANAGER |
| Transition CAPA status | HSE_OFFICER or SITE_MANAGER |
| Verify CAPA (done → verified) | Different user from who submitted done |
| Close incident | Any role (guard enforced by severity rule) |

### Deferred scope cross-reference

HSE-03 (EPI), HSE-04 (Habilitations), HSE-05 (Audit) are explicitly deferred to Phase 3.
See `docs/phase-03-handoff/hse-rh-deferred-scope.md` and
`apps/api/src/modules/hse/README.md` for the full deferred scope inventory.

## Key tokens

- Object Lock retention: GOVERNANCE mode, 7 years (D2-61).
- Closure guard error code: `ERR_CAPA_NOT_VERIFIED`.
- Chain genesis: 32 zero bytes (`Buffer.alloc(32, 0)`).
- Normalization constant (CAPA): `sha256(prev_hash || canonical_payload)` per ADR-0004.
- TF normalization factor: 1 000 000 (per ILO standard, HSE-06).
