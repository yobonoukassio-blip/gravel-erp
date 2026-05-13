-- Migration: create_corrective_action
-- Phase 2 W3 P07 — HSE-02 (D2-62, ADR-0008)
-- CAPA workflow table — mutable with audit trail.

CREATE TYPE capa_status AS ENUM (
  'open',
  'in_progress',
  'done',
  'verified',
  'closed'
);

CREATE TYPE capa_priority AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TABLE corrective_action (
  id                          UUID         NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                   UUID         NOT NULL,
  incident_id                 UUID         NOT NULL REFERENCES hse_incident(id),
  description                 TEXT         NOT NULL,
  assigned_to_user_id         UUID         NOT NULL,
  due_date_local              DATE         NOT NULL,
  iana_timezone               VARCHAR(64)  NOT NULL,
  priority                    capa_priority NOT NULL,
  status                      capa_status  NOT NULL DEFAULT 'open',
  closed_evidence_attachments TEXT[]       NOT NULL DEFAULT '{}',
  closed_at_utc               TIMESTAMPTZ  NULL,
  closed_by                   UUID         NULL,
  verification_user_id        UUID         NULL,
  verified_at_utc             TIMESTAMPTZ  NULL,
  created_by                  UUID         NOT NULL,
  created_at_utc              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at_utc              TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT corrective_action_pkey PRIMARY KEY (id)
);

-- Blocking rule: severity >= 4 incident cannot close until all CAPAs verified.
-- Enforced at application service layer (HseIncidentService.close).
-- DB-level check added as belt-and-suspenders trigger (optional, enforced in service).

-- Indexes.
CREATE INDEX capa_incident_idx  ON corrective_action (tenant_id, incident_id);
CREATE INDEX capa_status_idx    ON corrective_action (tenant_id, status);
CREATE INDEX capa_assignee_idx  ON corrective_action (tenant_id, assigned_to_user_id);
CREATE INDEX capa_due_date_idx  ON corrective_action (tenant_id, due_date_local);

-- Row-Level Security.
ALTER TABLE corrective_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY capa_tenant_isolation ON corrective_action
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- updated_at trigger.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at_utc = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_capa_updated_at
  BEFORE UPDATE ON corrective_action
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
