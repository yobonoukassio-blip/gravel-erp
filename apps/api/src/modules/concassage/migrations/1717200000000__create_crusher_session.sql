-- Migration: create crusher_session table (CON-01, CON-02)
-- Mutable operational record — no chain-of-hash (ADR-0013)

DO $$ BEGIN
  CREATE TYPE crusher_session_status AS ENUM ('ACTIVE','PAUSED','COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS crusher_session (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  site_id              UUID NOT NULL,
  operational_day_id   UUID NOT NULL,
  crusher_id           UUID NOT NULL,
  input_zone_id        UUID NULL,
  output_stockpile_id  UUID NOT NULL,
  material_type        VARCHAR(50) NOT NULL,
  calibre_code         VARCHAR(50) NOT NULL,
  input_tonnage_kg     BIGINT NOT NULL DEFAULT 0,
  output_tonnage_kg    BIGINT NOT NULL DEFAULT 0,
  energy_kwh           NUMERIC(10,2) NOT NULL DEFAULT 0,
  operating_hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
  performance_pct      NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN input_tonnage_kg = 0 THEN 0
    ELSE (output_tonnage_kg::numeric / input_tonnage_kg) * 100 END
  ) STORED,
  session_start_utc    TIMESTAMPTZ NOT NULL,
  session_end_utc      TIMESTAMPTZ NULL,
  operator_id          UUID NOT NULL,
  status               crusher_session_status NOT NULL DEFAULT 'ACTIVE',
  notes_md             TEXT,
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crusher_session_tenant_site_idx
  ON crusher_session (tenant_id, site_id);

CREATE INDEX IF NOT EXISTS crusher_session_operational_day_idx
  ON crusher_session (tenant_id, operational_day_id);

CREATE INDEX IF NOT EXISTS crusher_session_status_idx
  ON crusher_session (tenant_id, status);

-- Row Level Security
ALTER TABLE crusher_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY crusher_session_tenant_isolation ON crusher_session
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
