# HSE-05 — Safety Audits Specification

**Status:** spec only (no implementation). Drafted 2026-05-17 to unblock pricing/scope conversations with the pilot site safety officer. Implementation lands in Phase 7.

**Owner:** TBD (HSE module owner)
**Reference ADR:** ADR-0008 (Phase 2 vs Phase 3 boundary)

---

## Problem

Gravel Ivoire's HSE officer must run periodic on-site audits (weekly walk-throughs, monthly compliance audits, post-incident audits) and produce a defensible record of:

- What was audited (scope, areas, equipment)
- Findings (compliant / non-compliant / observation)
- Corrective actions opened from the audit
- Sign-off (officer + site director)

Today this is on paper. The HSE binder is the only artifact — lost / illegible / not searchable.

## Out of scope

- Real-time auditor mobile companion (Phase 8+)
- Industry-standard checklist library (ISO 45001 forms etc.) — for now a tenant-owned template table
- Photo evidence pipeline (reuse `hse_attachment` content-addressed pattern from HSE-01)

---

## Entities

```sql
-- Audit template: a tenant-owned reusable checklist.
CREATE TABLE hse_audit_template (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  code            VARCHAR(50)  NOT NULL,
  label           VARCHAR(200) NOT NULL,
  scope           VARCHAR(50)  NOT NULL,   -- 'weekly_walk' | 'monthly_compliance' | 'post_incident' | 'custom'
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at_utc  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT hse_audit_template_tenant_code_uq UNIQUE (tenant_id, code)
);

-- Items in a template — questions, expected answers, severity weight.
CREATE TABLE hse_audit_template_item (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  template_id     UUID NOT NULL REFERENCES hse_audit_template(id) ON DELETE CASCADE,
  ordinal         INTEGER      NOT NULL,
  question        TEXT         NOT NULL,
  category        VARCHAR(50)  NOT NULL,   -- 'epi' | 'machine_guarding' | 'fire' | 'first_aid' | 'electrical' | 'other'
  severity_weight INTEGER      NOT NULL DEFAULT 1 CHECK (severity_weight BETWEEN 1 AND 5),
  expected_answer VARCHAR(20)  NOT NULL DEFAULT 'compliant',
  CONSTRAINT hse_audit_template_item_template_ordinal_uq UNIQUE (template_id, ordinal)
);

-- Audit run: an officer executes a template at a site on a date.
CREATE TABLE hse_audit (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL,
  site_id             UUID NOT NULL,
  template_id         UUID NOT NULL REFERENCES hse_audit_template(id),
  performed_by        UUID NOT NULL,
  performed_at_utc    TIMESTAMPTZ NOT NULL DEFAULT now(),
  operational_day_id  UUID NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'signed' | 'cancelled'
  signed_off_by       UUID NULL,
  signed_off_at_utc   TIMESTAMPTZ NULL,
  notes_md            TEXT NULL,
  CONSTRAINT hse_audit_status_chk
    CHECK (status IN ('in_progress','signed','cancelled')),
  CONSTRAINT hse_audit_signoff_chk
    CHECK ((status = 'signed' AND signed_off_by IS NOT NULL AND signed_off_at_utc IS NOT NULL)
        OR (status <> 'signed'))
);

-- Per-item finding: answer + optional remediation pointer.
CREATE TABLE hse_audit_finding (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                UUID NOT NULL,
  audit_id                 UUID NOT NULL REFERENCES hse_audit(id) ON DELETE CASCADE,
  template_item_id         UUID NOT NULL REFERENCES hse_audit_template_item(id),
  answer                   VARCHAR(20) NOT NULL,   -- 'compliant' | 'non_compliant' | 'observation' | 'n_a'
  comment                  TEXT NULL,
  corrective_action_id     UUID NULL REFERENCES corrective_action(id),
  attachment_sha256        VARCHAR(64) NULL,
  CONSTRAINT hse_audit_finding_answer_chk
    CHECK (answer IN ('compliant','non_compliant','observation','n_a'))
);

-- RLS on every table; same tenant_isolation policy as the rest of HSE.
```

## Workflows

1. **Template authoring** (one-time). HSE_OFFICER creates a `hse_audit_template` and N `hse_audit_template_item` rows. Stays editable while no audit references it.
2. **Audit run** (recurring). Officer opens a new `hse_audit` row, walks the site filling `hse_audit_finding` rows. Each non-compliant answer can spawn a `corrective_action` row via a single click — and the action FK is back-linked on the finding.
3. **Sign-off**. Site director reviews findings, signs. `status='signed'` is immutable after that point — corrections require a new audit run.
4. **Aggregation** (DSH widget). Per-site compliance score = `Σ(compliant × weight) / Σ(weight)` over the last 30 days. Surfaces on the site-director dashboard next to TF.

## REST surface

```
GET    /api/hse/audit/templates                  — list active templates
POST   /api/hse/audit/templates                  — create template (HSE_OFFICER)
POST   /api/hse/audit/templates/:id/items        — add item
POST   /api/hse/audits                           — open run
PUT    /api/hse/audits/:id/findings/:itemId     — set finding answer + comment
POST   /api/hse/audits/:id/findings/:itemId/capa — spawn corrective_action + back-link
POST   /api/hse/audits/:id/sign                  — set signed_off_*, status='signed'
GET    /api/hse/audits?site_id=&from=&to=        — list runs
GET    /api/hse/audits/:id                       — full run with findings
GET    /api/hse/audits/score?site_id=&days=30    — compliance score
```

## Web surface

- New nav entry **HSE → Audits** with sub-tabs: Templates / Runs / Score
- Run form: scrollable list of findings, radio (Conforme/Non/Obs/N-A) + comment textarea + "Créer une CAPA"
- Score widget on dashboard-site (Directeur Site only)

## CASL

- `HSE_OFFICER`: create/edit templates, run audits, sign off NOT allowed
- `DIRECTEUR_SITE`: read all; sign off
- `DIRECTION_GROUPE`: read all sites + cross-site score

## Estimated effort

- Backend: 1 sprint (migration + 5 entities + 1 service + 1 controller + alert-on-non-compliant)
- Web: 1 sprint (templates CRUD + run form + score widget)
- Mobile: out of scope (HSE officers run audits from a tablet/laptop)

---

## Status — Phase 3 hand-off

The spec is frozen. Implementation can start as soon as a sprint is allocated. No blocking research questions.
