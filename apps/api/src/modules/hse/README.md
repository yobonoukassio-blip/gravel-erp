# HSE Module — Health, Safety & Environment

Phase 2 Wave 3 (P07). Backend module for incident management, CAPA workflow, and TF KPI.

## Scope — Phase 2

| Requirement | Status | Description |
|-------------|--------|-------------|
| HSE-01 | Implemented | Append-only incident (`hse_incident`) with chain-of-hash + S3 Object Lock photos |
| HSE-02 | Implemented | CAPA workflow with severity≥4 closure guard |
| HSE-06 | Implemented | TF (taux fréquence) KPI calculator with rolling 12-month window |

## Deferred — Phase 3 (RH module)

| Requirement | Status | Deferred Reason |
|-------------|--------|-----------------|
| **HSE-03** (EPI management) | **DEFERRED to Phase 3 RH module** | No schema, no service in Phase 2. Requires `epi_item`, `epi_assignment` tables and issue/return/condition workflows. Coupling with Phase 3 HR module is intentional — EPI assignments belong alongside employee records. |
| **HSE-04** (Habilitations 'as-of') | **DEFERRED to Phase 3 RH module** | Minimal `employee_certification` carcass only if pilot escalates (tracked in `docs/phase-03-handoff/hse-rh-deferred-scope.md`). Requires temporal queries with `as_of` semantics. |
| **HSE-05** (Audit sécurité périodique) | **DEFERRED to Phase 3** | Requires checklist engine (`safety_audit_template`, `safety_audit_run`, `safety_audit_finding`), recurring planning, and RH coupling. Out of scope for Phase 2 vertical slice. |

See `docs/phase-03-handoff/hse-rh-deferred-scope.md` for full Phase 3 design notes.

## Architecture

Reference: ADR-0008 — HSE incident immutability + CAPA workflow (Accepted).

### Chain-of-Hash

`hse_incident` rows carry `prev_hash` + `row_hash` computed via SHA-256 over the
canonical payload (see `EventChainVerifier.CANONICAL_PAYLOAD_SQL.hse_incident`).
Chain verified by `EventChainVerifier.verifyChain('hse_incident', tenantId)`.

### Append-Only Enforcement

- Controller rejects PATCH / DELETE with 405 Method Not Allowed.
- DB-level triggers (`trg_hse_incident_no_update`, `trg_hse_incident_no_delete`) block
  direct SQL mutations even by privileged accounts.
- Chronology corrections use `HSE_INCIDENT_CHRONOLOGY_APPENDED` events (future,
  Phase 3) — a new row referencing the original via `appends_to_incident_id`.

### S3 Object Lock

Photos are content-addressed (SHA-256 hex → S3 key). The HSE S3 bucket enforces
Object Lock GOVERNANCE mode with 7-year retention per OHADA/CI mining regulation
requirements (see `infra/modules/s3-objectlock/`).

### CAPA Severity Guard

Incidents with `severity >= 4` cannot be set to `status='closed'` until all
associated `corrective_action` rows have reached `status='verified'`.
Enforced in `HseIncidentService.close()`.

## Module Layout

```
apps/api/src/modules/hse/
├── entities/
│   ├── hse-incident.entity.ts         — append-only
│   ├── hse-attachment.entity.ts       — content-addressed
│   └── corrective-action.entity.ts    — mutable + @Auditable
├── services/
│   ├── hse-incident.service.ts        — chain-of-hash, events
│   ├── hse-attachment.service.ts      — S3 pre-signed URL + confirm
│   ├── corrective-action.service.ts   — CAPA lifecycle
│   └── tf-calculator.service.ts       — HSE-06 TF KPI
├── controllers/
│   ├── hse-incident.controller.ts
│   └── corrective-action.controller.ts
├── migrations/
│   ├── 1716500000000__create_hse_incident.sql
│   ├── 1716500100000__create_hse_attachment.sql
│   ├── 1716500200000__create_corrective_action.sql
│   └── 1716500300000__alter_operational_day_workforce_headcount.sql
├── tests/
│   ├── hse-incident.spec.ts
│   ├── hse-incident-chain-integrity.spec.ts
│   ├── corrective-action.spec.ts
│   ├── s3-objectlock.spec.ts
│   └── tf-calculator.spec.ts
├── hse.module.ts
└── README.md
```

## Events Emitted

| Event | Payload | Consumer |
|-------|---------|----------|
| `hse.incident.created` | `{ incident_id, severity, category, site_id, tenant_id }` | alerts module |
