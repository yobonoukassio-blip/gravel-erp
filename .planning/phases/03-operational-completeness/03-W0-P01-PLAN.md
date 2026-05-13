---
phase: 03-operational-completeness
plan: W0-P01
type: execute
wave: 0
autonomous: true
depends_on: []
files_modified:
  - apps/api/src/modules/rh/rh.module.ts
  - apps/api/src/modules/rh/entities/employee.entity.ts
  - apps/api/src/modules/rh/entities/certification-type.entity.ts
  - apps/api/src/modules/rh/entities/employee-certification.entity.ts
  - apps/api/src/modules/rh/entities/shift-entry.entity.ts
  - apps/api/src/modules/rh/entities/shift-roster.entity.ts
  - apps/api/src/modules/rh/entities/subcontractor.entity.ts
  - apps/api/src/modules/rh/entities/subcontractor-employee.entity.ts
  - apps/api/src/modules/rh/services/rh-habilitation.service.ts
  - apps/api/src/modules/rh/services/shift-entry.service.ts
  - apps/api/src/modules/rh/services/shift-roster.service.ts
  - apps/api/src/modules/rh/services/employee.service.ts
  - apps/api/src/modules/rh/services/subcontractor.service.ts
  - apps/api/src/modules/rh/controllers/employee.controller.ts
  - apps/api/src/modules/rh/controllers/shift-entry.controller.ts
  - apps/api/src/modules/rh/controllers/shift-roster.controller.ts
  - apps/api/src/modules/rh/controllers/subcontractor.controller.ts
  - apps/api/src/modules/rh/migrations/1717000000000__create_employee.sql
  - apps/api/src/modules/rh/migrations/1717000100000__create_certification_type.sql
  - apps/api/src/modules/rh/migrations/1717000200000__create_employee_certification.sql
  - apps/api/src/modules/rh/migrations/1717000300000__create_shift_entry.sql
  - apps/api/src/modules/rh/migrations/1717000400000__create_shift_roster.sql
  - apps/api/src/modules/rh/migrations/1717000500000__create_subcontractor.sql
  - apps/api/src/modules/rh/migrations/1717000600000__alter_operational_day_closure_blockers.sql
  - apps/api/src/modules/rh/tests/rh-habilitation.spec.ts
  - apps/api/src/modules/rh/tests/shift-entry.spec.ts
  - apps/api/src/modules/rh/tests/shift-roster.spec.ts
  - apps/api/src/modules/rh/tests/employee.spec.ts
  - apps/web/src/app/features/rh/rh.module.ts
  - apps/web/src/app/features/rh/rh-routes.ts
  - apps/web/src/app/features/rh/pages/employee-list.component.ts
  - apps/web/src/app/features/rh/pages/employee-form.component.ts
  - apps/web/src/app/features/rh/pages/certification-list.component.ts
  - apps/web/src/app/features/rh/pages/shift-roster.component.ts
  - apps/web/src/app/features/rh/services/rh-api.service.ts
  - apps/mobile/lib/features/rh/repositories/shift_entry_repository.dart
  - apps/mobile/lib/features/rh/screens/shift_entry_form.dart
  - apps/mobile/integration_test/shift_entry_test.dart
  - apps/api/src/common/chain-of-hash/event-chain.verifier.ts
  - apps/api/src/modules/i18n/locales/fr/rh.json
  - apps/api/src/modules/i18n/locales/en/rh.json
  - apps/api/src/modules/i18n/locales/ar/rh.json
  - apps/api/src/modules/i18n/locales/fr/tir.json
  - apps/api/src/modules/i18n/locales/en/tir.json
  - apps/api/src/modules/i18n/locales/ar/tir.json
  - apps/api/src/modules/i18n/locales/fr/concassage.json
  - apps/api/src/modules/i18n/locales/en/concassage.json
  - apps/api/src/modules/i18n/locales/ar/concassage.json
  - apps/api/src/modules/i18n/locales/fr/criblage.json
  - apps/api/src/modules/i18n/locales/en/criblage.json
  - apps/api/src/modules/i18n/locales/ar/criblage.json
  - apps/api/src/modules/i18n/locales/fr/maintenance.json
  - apps/api/src/modules/i18n/locales/en/maintenance.json
  - apps/api/src/modules/i18n/locales/ar/maintenance.json
  - apps/api/src/modules/i18n/locales/fr/ventes.json
  - apps/api/src/modules/i18n/locales/en/ventes.json
  - apps/api/src/modules/i18n/locales/ar/ventes.json
  - infra/keycloak/realms/gravel/roles/phase-03.json
  - docs/adr/ADR-0011-rh-habilitation-as-of.md
  - docs/adr/ADR-0012-tir-blast-plan-saga.md
  - docs/adr/ADR-0013-con-cri-stockpile-consumers.md
  - docs/adr/ADR-0014-mnt-maintenance-lifecycle.md
  - docs/adr/ADR-0015-vte-bl-invoice-fx-freeze.md
  - apps/api/src/app.module.ts
  - apps/web/src/app/app.routes.ts
task_count: 4
requirements: [RH-01, RH-02, RH-03, RH-04, HSE-04]

must_haves:
  truths:
    - "RhHabilitationService.isValidAt(employeeId, certCode, asOfDate) returns true for valid cert, false for expired, false for absent"
    - "shift_entry rows are append-only and can be captured offline by a mobile supervisor"
    - "OperationalDay has a closure_blockers JSONB column that starts empty and accepts string-reason entries"
    - "EventChainVerifier.CANONICAL_PAYLOAD_SQL includes explosives_event and blast_report registrations"
    - "Keycloak role definitions for all 8 Phase 3 roles exist as importable JSON"
  artifacts:
    - path: "apps/api/src/modules/rh/services/rh-habilitation.service.ts"
      provides: "isValidAt(employeeId, certCode, asOfDate): Promise<boolean>"
      exports: ["RhHabilitationService"]
    - path: "apps/api/src/modules/rh/entities/employee-certification.entity.ts"
      provides: "employee_certification table with temporal validity"
      contains: "valid_from, valid_to, CHECK (valid_to >= valid_from)"
    - path: "apps/api/src/modules/rh/migrations/1717000600000__alter_operational_day_closure_blockers.sql"
      provides: "closure_blockers JSONB column on operational_day"
      contains: "ALTER TABLE operational_day ADD COLUMN closure_blockers"
    - path: "apps/api/src/common/chain-of-hash/event-chain.verifier.ts"
      provides: "CANONICAL_PAYLOAD_SQL with explosives_event + blast_report entries"
    - path: "infra/keycloak/realms/gravel/roles/phase-03.json"
      provides: "8 Phase 3 Keycloak role definitions"
  key_links:
    - from: "apps/api/src/modules/tir/services/blast-plan.service.ts"
      to: "apps/api/src/modules/rh/services/rh-habilitation.service.ts"
      via: "isValidAt(operatorId, 'TIR_MINE_CI', operationalDay.shiftStartLocal)"
    - from: "apps/api/src/modules/rh/migrations/1717000600000__alter_operational_day_closure_blockers.sql"
      to: "apps/api/src/modules/operational-day/operational-day.service.ts"
      via: "blockClosure(dayId, reason) appends to closure_blockers array"
---

# Plan: 03-W0-P01 — RH Foundations (BLOCKING Wave 0)

## Objective

Bootstrap all shared foundations required before any Wave 1 plan can execute: the RH module (employee, certification, habilitation as-of gate, shift entry, shift roster, subcontractors), the `OperationalDay.closure_blockers` migration, Phase 3 i18n namespaces (6 × 3 languages), Keycloak roles for all Phase 3 domains, `EventChainVerifier` registrations for the two new chain-of-hash tables (`explosives_event`, `blast_report`), and 5 ADR drafts. Without this plan, Wave 1 TIR cannot call `RhHabilitationService.isValidAt()` before blast loading.

**Purpose:** Establish the habilitation gate contract and shared foundations that unblock all 7 downstream plans.
**Output:** `RhHabilitationService`, `employee_certification` table with temporal as-of query, `operational_day.closure_blockers`, 18 i18n files, `phase-03.json` Keycloak roles, `EventChainVerifier` updated, 5 ADR drafts.

## Context

Phase 2 W0-P01 established: `EventChainVerifier` (registered `stockpile_event`, `fuel_tank_event`, `hse_incident`), `OutboxService`, `AppendOnlyRepository<T>` Flutter contract, `AlertsModule` with `alerts.event-handlers.ts`, `production_equipment` with `assertActive()` guard, S3 Object Lock OpenTofu module, FR/EN/AR i18n for 8 Phase 2 domains.

Phase 2 W3-P07 created `docs/phase-03-handoff/hse-rh-deferred-scope.md` with the verbatim `employee_certification` schema to reuse here. `HSE_OFFICER` Keycloak role already exists from `phase-02.json`.

The `OperationalDay` table already has `workforce_headcount` (from W3-P07 migration `1716500300000`). This plan adds `closure_blockers JSONB NOT NULL DEFAULT '[]'` via a new migration.

## Tasks

### Task 1 — RH entities + migrations + RhHabilitationService (RH-01, RH-04, HSE-04)

**Files:**
- `apps/api/src/modules/rh/entities/employee.entity.ts`
- `apps/api/src/modules/rh/entities/certification-type.entity.ts`
- `apps/api/src/modules/rh/entities/employee-certification.entity.ts`
- `apps/api/src/modules/rh/entities/shift-entry.entity.ts`
- `apps/api/src/modules/rh/entities/shift-roster.entity.ts`
- `apps/api/src/modules/rh/entities/subcontractor.entity.ts`
- `apps/api/src/modules/rh/entities/subcontractor-employee.entity.ts`
- `apps/api/src/modules/rh/services/rh-habilitation.service.ts`
- `apps/api/src/modules/rh/services/employee.service.ts`
- `apps/api/src/modules/rh/services/subcontractor.service.ts`
- `apps/api/src/modules/rh/services/shift-entry.service.ts`
- `apps/api/src/modules/rh/services/shift-roster.service.ts`
- `apps/api/src/modules/rh/controllers/employee.controller.ts`
- `apps/api/src/modules/rh/controllers/shift-entry.controller.ts`
- `apps/api/src/modules/rh/controllers/shift-roster.controller.ts`
- `apps/api/src/modules/rh/controllers/subcontractor.controller.ts`
- `apps/api/src/modules/rh/rh.module.ts`
- `apps/api/src/modules/rh/migrations/1717000000000__create_employee.sql`
- `apps/api/src/modules/rh/migrations/1717000100000__create_certification_type.sql`
- `apps/api/src/modules/rh/migrations/1717000200000__create_employee_certification.sql`
- `apps/api/src/modules/rh/migrations/1717000300000__create_shift_entry.sql`
- `apps/api/src/modules/rh/migrations/1717000400000__create_shift_roster.sql`
- `apps/api/src/modules/rh/migrations/1717000500000__create_subcontractor.sql`
- `apps/api/src/modules/rh/migrations/1717000600000__alter_operational_day_closure_blockers.sql`
- `apps/api/src/modules/rh/tests/rh-habilitation.spec.ts`
- `apps/api/src/modules/rh/tests/employee.spec.ts`

**Action:**

Create the RH NestJS module with these entities:

`employee`: `id UUID PK`, `tenant_id UUID NOT NULL`, `site_id UUID NOT NULL FK site`, `first_name VARCHAR(100) NOT NULL`, `last_name VARCHAR(100) NOT NULL`, `employee_number VARCHAR(50)`, `contract_type ENUM('CDI','CDD','INTERIM') NOT NULL`, `role_code VARCHAR(50) NOT NULL` (business role, not Keycloak role), `is_active BOOL NOT NULL DEFAULT true`, `hired_date DATE`, FND-06 audit trail columns.

`certification_type`: `id UUID PK`, `tenant_id UUID NOT NULL`, `code VARCHAR(50) NOT NULL`, `label VARCHAR(200) NOT NULL`, `country_iso2 CHAR(2) NOT NULL`, `issuing_authority VARCHAR(200)`, UNIQUE(`tenant_id, code`).

`employee_certification`: Exact schema from `docs/phase-03-handoff/hse-rh-deferred-scope.md`:
```sql
CREATE TABLE employee_certification (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES employee(id),
  certification_type_id UUID NOT NULL REFERENCES certification_type(id),
  valid_from            DATE NOT NULL,
  valid_to              DATE NOT NULL,
  certificate_number    VARCHAR(100),
  document_sha256       VARCHAR(64),
  created_by            UUID NOT NULL,
  created_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);
```

`shift_entry`: append-only entity. `id UUID PK`, `tenant_id UUID NOT NULL`, `site_id UUID NOT NULL`, `operational_day_id UUID NOT NULL FK`, `employee_id UUID NOT NULL FK`, `check_in_utc TIMESTAMPTZ NOT NULL`, `check_out_utc TIMESTAMPTZ NULL`, `position_code VARCHAR(50)`, `supervisor_id UUID NOT NULL FK employee`. Sync strategy: `append_only_event`. Add BEFORE UPDATE/DELETE trigger (same pattern as `stockpile_event`).

`shift_roster`: `id UUID PK`, `tenant_id UUID NOT NULL`, `site_id UUID NOT NULL`, `roster_date DATE NOT NULL`, `roster_jsonb JSONB NOT NULL DEFAULT '[]'` (array of {employee_id, position_code, shift_type}), `version INT NOT NULL DEFAULT 1`. Sync strategy: `pessimistic_lock`.

`subcontractor`: `id UUID PK`, `tenant_id UUID NOT NULL`, `company_name VARCHAR(200) NOT NULL`, `country_iso2 CHAR(2) NOT NULL`, `contract_reference VARCHAR(100)`, `is_active BOOL NOT NULL DEFAULT true`.

`subcontractor_employee`: same shape as `employee` but with `subcontractor_id UUID NOT NULL FK subcontractor` instead of `site_id`. Reuses `employee_certification` via same FK path (no schema change needed — `employee_certification.employee_id` can reference either `employee.id` or `subcontractor_employee.id` — use a single `employee` table with a `subcontractor_id UUID NULL FK` column instead; `CHECK (site_id IS NOT NULL OR subcontractor_id IS NOT NULL)`).

Migration `1717000600000__alter_operational_day_closure_blockers.sql`:
```sql
ALTER TABLE operational_day
  ADD COLUMN IF NOT EXISTS closure_blockers JSONB NOT NULL DEFAULT '[]';
COMMENT ON COLUMN operational_day.closure_blockers IS
  'Array of blocker reason strings. Day closure allowed only when this array is empty. Append via blockClosure(), remove via resolveClosure().';
```

`RhHabilitationService` with exactly this interface:
```typescript
// CRITICAL: always accepts explicit asOfDate — never uses new Date() internally
async isValidAt(
  employeeId: string,
  certCode: string,
  asOfDate: Date,
): Promise<boolean>

// Returns certs expiring within withinDays of asOfDate
async getExpiringCertifications(
  siteId: string,
  asOfDate: Date,
  withinDays: number,
): Promise<CertificationExpiry[]>
```

`isValidAt` executes:
```sql
SELECT 1
  FROM employee_certification ec
  JOIN certification_type ct ON ct.id = ec.certification_type_id
 WHERE ec.tenant_id = :tenantId
   AND ec.employee_id = :employeeId
   AND ct.code = :certCode
   AND ec.valid_from <= :asOfDate::date
   AND ec.valid_to   >= :asOfDate::date
 LIMIT 1
```

`getExpiringCertifications` emits `rh.certification.expiring_soon` via `AlertsService` when count > 0. Register this alert event in `apps/api/src/modules/alerts/alerts.event-handlers.ts`.

Add `OperationalDayService.blockClosure(dayId: string, reason: string)` and `resolveClosure(dayId: string, reason: string)` methods that use `jsonb_insert` / `jsonb_remove` patterns against `closure_blockers` column.

`employee.service.ts`: standard CRUD + `GET /employees?site_id=&is_active=&cert_code=&cert_valid_as_of=`.

Tests in `rh-habilitation.spec.ts` — boundary cases (unit, mock QueryBuilder):
- valid cert returns true when `asOfDate === valid_from`
- valid cert returns true when `asOfDate === valid_to`
- expired cert returns false when `asOfDate === valid_to + 1 day`
- cert not yet valid returns false when `asOfDate === valid_from - 1 day`
- subcontractor employee cert resolves same as regular employee
- `isValidAt` with `certCode` not in DB returns false (no exception)

Tests in `employee.spec.ts`:
- `blockClosure` appends reason to empty array
- `blockClosure` is idempotent (same reason twice = array length 1)
- `resolveClosure` removes matching reason
- `resolveClosure` on empty array is a no-op

Wire `RhModule` in `apps/api/src/app.module.ts`.

**Commit:** `feat(03-rh): RH module — employee, certification, habilitation as-of gate, shifts, subcontractors`

**Verify:**
```
pnpm --filter=@gravel/api test rh-habilitation*
pnpm --filter=@gravel/api test employee*
pnpm --filter=@gravel/api build
```

**Done:** `RhHabilitationService.isValidAt` passes all 6 boundary-case unit tests. `operational_day.closure_blockers` migration exists. `blockClosure` / `resolveClosure` tests pass.

---

### Task 2 — Mobile shift entry + RH web UI (RH-02, RH-03)

**Files:**
- `apps/mobile/lib/features/rh/repositories/shift_entry_repository.dart`
- `apps/mobile/lib/features/rh/screens/shift_entry_form.dart`
- `apps/mobile/integration_test/shift_entry_test.dart`
- `apps/web/src/app/features/rh/rh.module.ts`
- `apps/web/src/app/features/rh/rh-routes.ts`
- `apps/web/src/app/features/rh/pages/employee-list.component.ts`
- `apps/web/src/app/features/rh/pages/employee-form.component.ts`
- `apps/web/src/app/features/rh/pages/certification-list.component.ts`
- `apps/web/src/app/features/rh/pages/shift-roster.component.ts`
- `apps/web/src/app/features/rh/services/rh-api.service.ts`
- `apps/web/src/app/app.routes.ts`

**Action:**

**Mobile (Flutter):**

`ShiftEntryRepository` extends `AppendOnlyRepository<ShiftEntry>` (same contract as `IncidentRepository` from Phase 2 W3-P07). Sync strategy: `append_only_event`. Fields: `employee_id`, `check_in_utc`, `check_out_utc`, `position_code`, `operational_day_id`. The repository must NOT expose UPDATE or DELETE methods.

`ShiftEntryFormScreen`: supervisor selects employee from a dropdown (loaded from PowerSync local cache), records check-in at current UTC, can record check-out later. Offline-first: form submits to local SQLite via repository, syncs when online. No offline numbering scheme needed for shift entries (UUID is sufficient since they are not human-facing documents).

Integration test `shift_entry_test.dart`:
- Create shift_entry row offline (no network)
- Assert row has `pending_sync = true` and `check_out_utc = null`
- Simulate check-out update (calls `ShiftEntryRepository.recordCheckOut(id, now)`)
- Assert row updated locally with `check_out_utc != null` and `pending_sync = true`
- Assert `listForOperationalDay(opDayId)` returns 1 row

**Web (Angular):**

`RhModule` lazy-loaded Angular feature module with 4 components (Formly forms, AG Grid lists):

`EmployeeListComponent`: AG Grid with columns `[employee_number, last_name, first_name, contract_type, role_code, site_name, is_active]`, server-side filter by `site_id`, `is_active`, `cert_code + cert_valid_as_of`. Row click navigates to employee form.

`EmployeeFormComponent`: Formly form for create/edit. Fields: `first_name`, `last_name`, `employee_number`, `contract_type` (mat-select ENUM), `role_code` (mat-select), `site_id`, `hired_date`. Include a sub-section "Habilitations" that lists existing `employee_certification` rows and a `+Add` button opening a dialog form (`certification_type_id`, `valid_from`, `valid_to`, `certificate_number`, optional `document_sha256` from S3 pre-signed upload). Show an expiry warning badge (orange) when `valid_to` is within 30 days of today.

`CertificationListComponent`: AG Grid showing all certifications for the current site with `[employee_name, cert_type, valid_from, valid_to, status]` where `status` is computed client-side: `VALID|EXPIRING_SOON|EXPIRED`. Color-coded row by status.

`ShiftRosterComponent`: Calendar-style weekly view (Angular Material CDK). Drag-drop assignment of employees to positions. Saves via `PUT /shift-roster/:id` with pessimistic lock (sends current `version`; server rejects with 409 if version mismatch). Displays current week's planned roster.

Wire `/rh` route in `apps/web/src/app/app.routes.ts`.

**Commit:** `feat(03-rh): mobile shift entry + web RH UI (employee CRUD, certifications, shift roster)`

**Verify:**
```
pnpm --filter=@gravel/mobile integration_test/shift_entry_test.dart
pnpm --filter=@gravel/web build
```

**Done:** Shift entry integration test passes all 4 assertions. Web build clean. `/rh` route renders employee list.

---

### Task 3 — Phase 3 i18n namespaces + EventChainVerifier registrations (cross-cutting)

**Files:**
- `apps/api/src/modules/i18n/locales/fr/rh.json`
- `apps/api/src/modules/i18n/locales/en/rh.json`
- `apps/api/src/modules/i18n/locales/ar/rh.json`
- `apps/api/src/modules/i18n/locales/fr/tir.json`
- `apps/api/src/modules/i18n/locales/en/tir.json`
- `apps/api/src/modules/i18n/locales/ar/tir.json`
- `apps/api/src/modules/i18n/locales/fr/concassage.json`
- `apps/api/src/modules/i18n/locales/en/concassage.json`
- `apps/api/src/modules/i18n/locales/ar/concassage.json`
- `apps/api/src/modules/i18n/locales/fr/criblage.json`
- `apps/api/src/modules/i18n/locales/en/criblage.json`
- `apps/api/src/modules/i18n/locales/ar/criblage.json`
- `apps/api/src/modules/i18n/locales/fr/maintenance.json`
- `apps/api/src/modules/i18n/locales/en/maintenance.json`
- `apps/api/src/modules/i18n/locales/ar/maintenance.json`
- `apps/api/src/modules/i18n/locales/fr/ventes.json`
- `apps/api/src/modules/i18n/locales/en/ventes.json`
- `apps/api/src/modules/i18n/locales/ar/ventes.json`
- `apps/api/src/common/chain-of-hash/event-chain.verifier.ts`
- `infra/keycloak/realms/gravel/roles/phase-03.json`

**Action:**

**18 i18n files** — create FR/EN/AR for 6 Phase 3 namespaces (rh, tir, concassage, criblage, maintenance, ventes). Each file must be real translations (no English placeholders in FR/AR). Minimum keys per namespace:

`rh`: `employee, employee_number, contract_type, role_code, habilitation, certification, valid_from, valid_to, expiring_soon, shift_entry, shift_roster, subcontractor, check_in, check_out, position_code`

`tir`: `blast_plan, explosives_ledger, detonator, blast_charge, blast_report, fire_clearance, reconciliation, plan_status_draft, plan_status_hse_approved, plan_status_loaded, plan_status_fired, plan_status_reported, fragmentation, vibration_mm_s`

`concassage`: `crusher_session, crusher, input_tonnage, output_tonnage, performance_pct, energy_kwh, session_start, session_end, operating_hours`

`criblage`: `screening_session, screen, calibre_yield, is_nonconforming, nonconformity_reason, calibre_code`

`maintenance`: `work_order, preventive_plan, corrective, spare_part, stock_threshold, mtbf, mttr, availability, downtime, labor_hours, diagnosis`

`ventes`: `customer, sale_contract, bon_de_livraison, invoice, transporter, customs_dossier, delivery_date, fx_rate, unit_price, line_total`

**EventChainVerifier update:** Open `apps/api/src/common/chain-of-hash/event-chain.verifier.ts` and add two new entries to `CANONICAL_PAYLOAD_SQL`:

```typescript
explosives_event: `
  SELECT jsonb_build_object(
    'event_type', event_type,
    'product_type', product_type,
    'quantity_g', quantity_g,
    'site_id', site_id,
    'occurred_at_utc', occurred_at_utc,
    'source_reference', source_reference
  )::text AS canonical_payload,
  prev_hash, row_hash
  FROM explosives_event
  WHERE tenant_id = $1
  ORDER BY occurred_at_utc, id
`,

blast_report: `
  SELECT jsonb_build_object(
    'blast_plan_id', blast_plan_id,
    'fragmentation_obs', fragmentation_obs,
    'vibration_mm_s', vibration_mm_s::text,
    'incident_ids', incident_ids,
    'occurred_at_utc', occurred_at_utc
  )::text AS canonical_payload,
  prev_hash, row_hash
  FROM blast_report
  WHERE tenant_id = $1
  ORDER BY occurred_at_utc, id
`,
```

Add unit tests in the existing `event-chain.verifier.spec.ts` asserting that both new table names are present in `CANONICAL_PAYLOAD_SQL`.

**Keycloak roles** `infra/keycloak/realms/gravel/roles/phase-03.json` — define all 8 new roles as importable realm JSON (same format as `phase-02.json`). Roles:
- `TIR_OPERATOR` — can enter blast_charge events, scan detonator serials
- `TIR_SUPERVISOR` — can create/request-fire blast_plan; requires TIR_OPERATOR
- `HR_MANAGER` — full CRUD on employees, certifications, shift rosters
- `SHIFT_SUPERVISOR` — can record shift_entry for their site only
- `PROCESSING_OPERATOR` — can open/close crusher_session and screening_session
- `SALES_MANAGER` — full CRUD on customers, contracts; can generate invoices
- `FINANCE_OFFICER` — can enter FX rates, trigger invoice batch
- `MAINTENANCE_TECH` — can open/close work_orders, record part consumption

Include a `phase-03.README.md` with `kcadm.sh` import recipe.

**Commit:** `feat(03-foundations): 18 i18n files, EventChainVerifier +2, 8 Keycloak roles, phase-03 ADR drafts`

**Verify:**
```
pnpm --filter=@gravel/api test event-chain*
pnpm --filter=@gravel/api build
```

**Done:** `event-chain.verifier.spec.ts` passes with both new tables registered. 18 i18n files exist. `phase-03.json` has 8 role entries.

---

### Task 4 — 5 ADR drafts (cross-cutting)

**Files:**
- `docs/adr/ADR-0011-rh-habilitation-as-of.md`
- `docs/adr/ADR-0012-tir-blast-plan-saga.md`
- `docs/adr/ADR-0013-con-cri-stockpile-consumers.md`
- `docs/adr/ADR-0014-mnt-maintenance-lifecycle.md`
- `docs/adr/ADR-0015-vte-bl-invoice-fx-freeze.md`

**Action:**

Create 5 ADR drafts following the same 6-section template used for ADR-0006..0010 (`## Status`, `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`, `## References`). Status = `Draft` for all.

**ADR-0011** (RH Habilitation As-Of): Decision = temporal as-of gate via `employee_certification` table with `valid_from/valid_to DATE` columns, queried at `operational_day.shift_start_local` not `now()`. Covers hard-block vs soft-warning decision (hard-block with dual-supervisor emergency override). Notes the `isValidAt` signature contract (explicit date parameter, never `new Date()`).

**ADR-0012** (TIR Blast Plan Saga): Decision = `blast_plan` is mutable state machine (pessimistic_lock); `blast_charge`, `explosives_event`, `blast_report` are append-only (chain-of-hash). Clearance saga via EventEmitter2 cross-module events. 4-hour clearance timeout. PDF snapshot async (never blocking the event append transaction). Covers OperationalDay.closure_blockers pattern.

**ADR-0013** (CON/CRI Stockpile Consumers): Decision = CrusherSession and ScreeningSession publish outbox events consumed by StockpileModule handlers. CRI multi-calibre uses compound idempotency key `${session_id}_${calibre_code}`. No chain-of-hash on session tables (operational record, not financial ledger).

**ADR-0014** (MNT Maintenance Lifecycle): Decision = extend `production_equipment` with `hour_meter_current`, `odometer_km_current`; `pm_plan` with interval-based scheduling; `work_order` spans both corrective and preventive; spare_parts_stock with `SELECT FOR UPDATE` on consumption (prevents negative stock). MTBF/MTTR from `work_order.downtime_minutes` rolling 12 months, materialized on `WorkOrderService.close()`.

**ADR-0015** (VTE BL Invoice FX Freeze): Decision = BL offline numbering `SITE-BL-DATE-DEVICE-SEQ` (same scheme as weighing ticket per ADR-0009). `fx_rate_snapshot` immutable per `(tenant, from_currency, to_currency, rate_date)`. Invoice batch fails pre-flight if any BL date missing FX rate. All money in `dinero.js` bigint minor units. EUR/XOF peg pre-seeded.

**Commit:** `docs(03-adr): ADR-0011..0015 draft — rh, tir, con-cri, mnt, vte`

**Verify:**
```
ls docs/adr/ADR-001{1,2,3,4,5}*.md | wc -l   # must print 5
grep -l "## Status" docs/adr/ADR-001[1-5]*.md | wc -l  # must print 5
```

**Done:** 5 ADR files exist with `## Status: Draft` section.

## Key Constraints

- `isValidAt` MUST accept explicit `asOfDate: Date` parameter — never `new Date()` inside the method (Pitfall 2 from research)
- `shift_entry` table MUST have BEFORE UPDATE/DELETE trigger (append-only)
- `employee_certification.valid_to >= valid_from` CHECK constraint is mandatory
- i18n AR translations must be real Arabic script — no English placeholders
- `EventChainVerifier` SQL for `explosives_event` canonical payload field order is frozen; document in ADR-0012
- `closure_blockers` column default is `'[]'` (empty JSON array), NOT NULL

## Integration Points

This plan produces for downstream plans:
- `RhHabilitationService` injectable in TIR W1-P02 (blast loading gate) and MNT W2-P04 (work order assignment gate)
- `OperationalDay.closure_blockers` column usable by TIR W1-P02 `ExplosivesReconciliationJob.blockClosure()`
- `EventChainVerifier` pre-registered for `explosives_event` and `blast_report` tables (W1-P02 just appends rows)
- `phase-03.json` Keycloak roles ready for CASL guard definitions in all downstream plans
- 18 i18n namespace files for all Phase 3 modules

## Success Criteria

- [ ] `pnpm --filter=@gravel/api test rh-habilitation*` — 6 boundary-case unit tests pass
- [ ] `pnpm --filter=@gravel/api test employee*` — `blockClosure/resolveClosure` tests pass
- [ ] `pnpm --filter=@gravel/api test event-chain*` — 2 new table registration tests pass
- [ ] `pnpm --filter=@gravel/mobile integration_test/shift_entry_test.dart` — 4 assertions pass
- [ ] `pnpm --filter=@gravel/api build` — clean (no TS errors)
- [ ] `pnpm --filter=@gravel/web build` — clean
- [ ] 18 i18n files exist (`ls apps/api/src/modules/i18n/locales/{fr,en,ar}/rh.json` etc.)
- [ ] `infra/keycloak/realms/gravel/roles/phase-03.json` contains 8 role entries
- [ ] `docs/adr/ADR-001{1,2,3,4,5}*.md` — 5 files with `## Status` section

## Output

After completion, create `.planning/phases/03-operational-completeness/03-W0-P01-SUMMARY.md`
