-- Migration: create_blast_report
-- TIR-06: Append-only blast report with SHA-256 chain-of-hash.
-- Registered in EventChainVerifier from W0-P01.

CREATE TABLE IF NOT EXISTS blast_report (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurred_at_utc   TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id         UUID NOT NULL,
  site_id           UUID NOT NULL,
  blast_plan_id     UUID NOT NULL REFERENCES blast_plan(id),
  fragmentation_obs TEXT NOT NULL,
  vibration_mm_s    NUMERIC(6,2),
  incident_ids      UUID[] NOT NULL DEFAULT '{}',
  reporter_id       UUID NOT NULL,
  notes_md          TEXT,
  prev_hash         BYTEA NOT NULL,
  row_hash          BYTEA NOT NULL,
  created_at_utc    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_report_blast_plan
  ON blast_report (blast_plan_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_blast_report_tenant_site
  ON blast_report (tenant_id, site_id, occurred_at_utc DESC);

-- Append-only enforcement (same pattern as explosives_event)
CREATE OR REPLACE FUNCTION enforce_blast_report_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'restrict_violation'
      USING DETAIL = 'blast_report rows cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'restrict_violation'
      USING DETAIL = 'blast_report rows are append-only; UPDATE not permitted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blast_report_append_only ON blast_report;
CREATE TRIGGER trg_blast_report_append_only
  BEFORE UPDATE OR DELETE ON blast_report
  FOR EACH ROW EXECUTE FUNCTION enforce_blast_report_append_only();

-- Auxiliary table for physical explosives count submissions (TIR-07)
CREATE TABLE IF NOT EXISTS explosives_physical_count (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operational_day_id  UUID NOT NULL,
  product_type        explosives_product_type NOT NULL,
  quantity_g          BIGINT NOT NULL,
  submitted_by        UUID NOT NULL,
  reason              TEXT NOT NULL,
  override_authorized_by UUID NOT NULL,
  created_at_utc      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operational_day_id, product_type)
);
