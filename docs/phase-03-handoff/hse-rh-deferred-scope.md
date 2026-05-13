# HSE + RH Deferred Scope — Phase 3 Hand-off

**Phase 2 Decision:** HSE-03, HSE-04, and HSE-05 are explicitly out of scope for Phase 2.
This document describes the entities, workflows, and design guidance needed for Phase 3 implementation.

**Owner:** TBD — assign before Phase 3 kick-off.
**Source requirements:** HSE-03, HSE-04, HSE-05 in `REQUIREMENTS.md`.
**Reference ADR:** ADR-0008 (Phase 2 vs Phase 3 boundary).

---

## Phase 2 Status

None of the tables described in this document exist in the Phase 2 database.
If the pilot escalates an HSE-04 gap (an operator working without a valid habilitation
is blocked by a business rule), treat it as a **gap escalation** and discuss with the
product owner before building anything.

---

## HSE-03 — EPI Management (DEFERRED)

### Problem

Operators on mining sites must wear and maintain personal protective equipment (EPI —
équipements de protection individuelle). Gravel Ivoire needs to track:

- What EPI items each worker has been issued.
- When items were returned, replaced, or condemned.
- Current condition of each item.

### Entities Needed

```sql
-- EPI item master (catalog).
CREATE TABLE epi_item (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL,
  name           VARCHAR(200) NOT NULL,
  category       VARCHAR(50) NOT NULL,  -- casque, gilet, chaussures, masque, etc.
  description    TEXT,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-employee EPI assignment.
CREATE TABLE epi_assignment (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  employee_id     UUID NOT NULL REFERENCES employee(id),
  epi_item_id     UUID NOT NULL REFERENCES epi_item(id),
  issued_at_utc   TIMESTAMPTZ NOT NULL,
  issued_by       UUID NOT NULL,
  returned_at_utc TIMESTAMPTZ NULL,
  returned_by     UUID NULL,
  condition       VARCHAR(20) NOT NULL DEFAULT 'good'
                  CHECK (condition IN ('good', 'damaged', 'condemned')),
  notes           TEXT,
  created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Workflows

1. **Issue**: HSE_OFFICER assigns an EPI item to an employee. Row inserted in `epi_assignment`.
2. **Return**: Employee returns item. `returned_at_utc` + `returned_by` set. Condition assessed.
3. **Condemn**: Item no longer serviceable. `condition='condemned'`. New item must be issued.
4. **Compliance check**: For a given site on a given day, list employees missing mandatory EPI categories.

### Phase 3 coupling

- `epi_assignment.employee_id` references the Phase 3 RH `employee` table.
- EPI compliance dashboard surfaced in HSE module but feeds from RH data.

---

## HSE-04 — Habilitations 'as-of' (DEFERRED)

### Problem

Certain operations (tir de mine, conduite d'engin, utilisation explosifs) require operators
to hold a valid certification (habilitation). Gravel Ivoire needs to:

- Record certifications with validity windows (`valid_from` / `valid_to`).
- Query whether an employee held a required certification on a given date ("as-of" query).
- Block or warn when an operator attempts to log an activity without a valid certification.

### Entities Needed

```sql
-- Certification types (master).
CREATE TABLE certification_type (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL,
  code        VARCHAR(50) NOT NULL,    -- e.g. 'TIR_MINE_CI', 'CONDUCTEUR_ENGIN'
  label       VARCHAR(200) NOT NULL,
  country     CHAR(2),                 -- ISO-3166 country code, NULL = cross-country
  issuing_authority VARCHAR(200),
  UNIQUE (tenant_id, code)
);

-- Per-employee certification instance.
CREATE TABLE employee_certification (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL,
  employee_id        UUID NOT NULL REFERENCES employee(id),
  certification_type_id UUID NOT NULL REFERENCES certification_type(id),
  valid_from         DATE NOT NULL,
  valid_to           DATE NOT NULL,
  certificate_number VARCHAR(100),
  document_sha256    VARCHAR(64),   -- S3 Object Lock reference (same bucket as HSE photos)
  created_by         UUID NOT NULL,
  created_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);
```

### As-of query pattern

```sql
-- Is employee X certified for operation Y on date D?
SELECT 1
  FROM employee_certification ec
  JOIN certification_type ct ON ct.id = ec.certification_type_id
 WHERE ec.employee_id = :employee_id
   AND ct.code = :cert_code
   AND ec.valid_from <= :as_of_date
   AND ec.valid_to   >= :as_of_date
 LIMIT 1;
```

### Phase 3 coupling

- Hard-block on `drilled_hole` / `blast_plan` creation when assigned operator lacks cert.
- Soft-warning on operational_day if any planned operator cert expires in < 30 days.
- Temporal validity queries must use `AS OF` date from the operational_day context, not `now()`.

### Phase 2 stub

No `employee_certification` table exists in Phase 2. If pilot escalates: create the table
migration as a hot-fix, but **do not add blocking rules in Phase 2** — block only in Phase 3
when the full RH module is live.

---

## HSE-05 — Audit Sécurité Périodique (DEFERRED)

### Problem

CI/OHADA mining regulations require periodic safety audits with documented findings and
corrective action tracking (distinct from incident-triggered CAPA).

### Entities Needed

```sql
-- Audit checklist template.
CREATE TABLE safety_audit_template (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL,
  title       VARCHAR(200) NOT NULL,
  scope       VARCHAR(50) NOT NULL,  -- 'site', 'department', 'equipment'
  checklist   JSONB NOT NULL DEFAULT '[]',  -- array of { item_id, label, weight }
  created_by  UUID NOT NULL,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit run (one execution of a template).
CREATE TABLE safety_audit_run (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  site_id              UUID NOT NULL,
  template_id          UUID NOT NULL REFERENCES safety_audit_template(id),
  auditor_user_id      UUID NOT NULL,
  audit_date           DATE NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'in_progress', 'completed', 'approved')),
  overall_score        NUMERIC(5,2),
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Finding per checklist item.
CREATE TABLE safety_audit_finding (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL,
  audit_run_id     UUID NOT NULL REFERENCES safety_audit_run(id),
  item_id          VARCHAR(50) NOT NULL,   -- references checklist item
  compliant        BOOLEAN NOT NULL,
  severity         INT CHECK (severity BETWEEN 1 AND 5),
  description      TEXT,
  photo_sha256_hex VARCHAR(64),           -- S3 Object Lock ref
  requires_capa    BOOLEAN NOT NULL DEFAULT false,
  created_at_utc   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Recurrence patterns

Audits are scheduled on a recurrence basis (monthly, quarterly, annually). A recurring
scheduler (BullMQ job) creates `safety_audit_run` drafts ahead of due dates and alerts
the HSE_OFFICER assigned to the site.

### Phase 3 coupling

- `safety_audit_finding.requires_capa = true` → auto-creates `corrective_action` row
  (linking back to the audit finding, not an incident).
- Requires Phase 2 `corrective_action` table (already exists after P07).

---

## Phase 3 Dependency Graph

```
Phase 3 RH module
  └── employee (new)
       ├── epi_assignment   (HSE-03)
       └── employee_certification  (HSE-04)

Phase 3 HSE-05 (audit)
  ├── depends on: safety_audit_template, safety_audit_run, safety_audit_finding (new)
  └── integrates with: corrective_action (Phase 2 P07 ✓)
```

## Open Questions for Phase 3 Planning

1. Which CI mining authority certifications are mandatory vs. discretionary?
2. Should expired-cert blocking be a hard block or a soft warning in the mobile form?
3. Audit recurrence period: monthly per site or quarterly at group level?
4. Are EPI items centrally procured (one catalog) or per-site?
5. 7-year Object Lock retention sufficient for audit documents, or is 10-year required?

---

*Document created: 2026-05-13. Phase 3 hand-off owner: TBD.*
