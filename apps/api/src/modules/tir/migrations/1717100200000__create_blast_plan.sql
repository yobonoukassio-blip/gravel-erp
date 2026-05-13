-- Migration: create_blast_plan
-- TIR-03: Mutable state machine (NO append-only trigger — Pitfall 1).
-- State: DRAFT → HSE_APPROVED → LOADED → FIRE_REQUESTED → CLEARED → FIRED → REPORTED

CREATE TYPE blast_plan_status AS ENUM (
  'DRAFT',
  'HSE_APPROVED',
  'LOADED',
  'FIRE_REQUESTED',
  'CLEARED',
  'FIRED',
  'REPORTED'
);

CREATE TABLE IF NOT EXISTS blast_plan (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID NOT NULL,
  site_id                 UUID NOT NULL,
  operational_day_id      UUID NOT NULL,
  drilling_plan_id        UUID NOT NULL,
  status                  blast_plan_status NOT NULL DEFAULT 'DRAFT',
  planned_by              UUID NOT NULL,
  hse_approved_by         UUID NULL,
  hse_approved_at_utc     TIMESTAMPTZ NULL,
  loading_operator_id     UUID NULL,
  loading_approved_at_utc TIMESTAMPTZ NULL,
  fire_requested_at_utc   TIMESTAMPTZ NULL,
  clearance_token         UUID NULL,
  fired_at_utc            TIMESTAMPTZ NULL,
  notes_md                TEXT,
  version                 INT NOT NULL DEFAULT 1,
  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_plan_tenant_site
  ON blast_plan (tenant_id, site_id, created_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_blast_plan_operational_day
  ON blast_plan (operational_day_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_blast_plan_status
  ON blast_plan (tenant_id, status);

-- updated_at trigger (version auto-increment handled by service for optimistic lock)
CREATE OR REPLACE FUNCTION update_blast_plan_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at_utc = now();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_blast_plan_updated_at
  BEFORE UPDATE ON blast_plan
  FOR EACH ROW EXECUTE FUNCTION update_blast_plan_updated_at();

-- NOTE: NO BEFORE DELETE trigger — blast_plan can be soft-deleted by admin
-- via status transitions. Physical DELETE is controlled by application policy.
-- DO NOT add an append-only trigger here (Pitfall 1 of ADR-0012).
