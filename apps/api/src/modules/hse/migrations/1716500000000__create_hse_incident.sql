-- Migration: create_hse_incident
-- Phase 2 W3 P07 — HSE-01 (D2-60, ADR-0008)
-- Append-only incident table with chain-of-hash + RLS.

CREATE TYPE hse_category AS ENUM (
  'accident_personnel',
  'accident_materiel',
  'near_miss',
  'environnement',
  'securite',
  'autre'
);

CREATE TABLE hse_incident (
  id                           UUID        NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                    UUID        NOT NULL,
  site_id                      UUID        NOT NULL,
  occurred_at_local            TIMESTAMP   NOT NULL,
  iana_timezone                VARCHAR(64) NOT NULL,
  occurred_at_utc              TIMESTAMPTZ NOT NULL,
  operational_day_id           UUID        NOT NULL
      REFERENCES operational_day(id),
  category                     hse_category NOT NULL,
  severity                     INT         NOT NULL
      CHECK (severity BETWEEN 1 AND 5),
  reporter_user_id             UUID        NOT NULL,
  location_text                VARCHAR(500) NOT NULL,
  gps_point                    VARCHAR(100) NULL,
  people_impacted              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  equipment_impacted_ids       TEXT[]      NOT NULL DEFAULT '{}',
  chronology_md                TEXT        NOT NULL,
  content_addressed_attachments TEXT[]     NOT NULL DEFAULT '{}',
  status                       VARCHAR(30) NOT NULL DEFAULT 'open'
      CHECK (status IN ('open','under_investigation','closed')),
  prev_hash                    BYTEA       NOT NULL,
  row_hash                     BYTEA       NOT NULL,
  created_at_utc               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT hse_incident_pkey PRIMARY KEY (id)
);

-- Append-only enforcement: block UPDATE and DELETE at DB trigger level.
CREATE OR REPLACE FUNCTION hse_incident_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hse_incident is append-only (ADR-0008). Use HSE_INCIDENT_CHRONOLOGY_APPENDED to correct.';
END;
$$;

CREATE TRIGGER trg_hse_incident_no_update
  BEFORE UPDATE ON hse_incident
  FOR EACH ROW EXECUTE FUNCTION hse_incident_append_only();

CREATE TRIGGER trg_hse_incident_no_delete
  BEFORE DELETE ON hse_incident
  FOR EACH ROW EXECUTE FUNCTION hse_incident_append_only();

-- Indexes.
CREATE INDEX hse_incident_tenant_time_idx ON hse_incident (tenant_id, occurred_at_utc);
CREATE INDEX hse_incident_site_idx        ON hse_incident (site_id, occurred_at_utc);
CREATE INDEX hse_incident_op_day_idx      ON hse_incident (operational_day_id);
CREATE INDEX hse_incident_status_idx      ON hse_incident (tenant_id, status);

-- Row-Level Security (ADR-0001).
ALTER TABLE hse_incident ENABLE ROW LEVEL SECURITY;

CREATE POLICY hse_incident_tenant_isolation ON hse_incident
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
