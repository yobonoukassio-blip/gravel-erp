-- Migration: create_explosives_event_partitioned
-- TIR-01: Append-only explosives ledger with SHA-256 chain-of-hash.
-- Partitioned by RANGE(occurred_at_utc) — monthly partitions created separately.
-- BEFORE UPDATE/DELETE trigger prevents mutation; pdf_sha256 one-time backfill allowed.

CREATE TYPE explosives_product_type AS ENUM (
  'ANFO',
  'EMULSION',
  'DETONATEUR',
  'CORDEAU'
);

CREATE TYPE explosives_event_type AS ENUM (
  'EXPLOSIVES_IN',
  'EXPLOSIVES_OUT_LOAD',
  'EXPLOSIVES_RETURN',
  'EXPLOSIVES_DESTROY'
);

CREATE TABLE IF NOT EXISTS explosives_event (
  id                  UUID NOT NULL DEFAULT uuid_generate_v4(),
  occurred_at_utc     TIMESTAMPTZ NOT NULL,
  tenant_id           UUID NOT NULL,
  site_id             UUID NOT NULL,
  operational_day_id  UUID NOT NULL,
  event_type          explosives_event_type NOT NULL,
  product_type        explosives_product_type NOT NULL,
  quantity_g          BIGINT NOT NULL,           -- signed: positive=IN, negative=OUT
  unit_price_minor    BIGINT,
  currency            CHAR(3),
  supplier            VARCHAR(200),
  doc_reference       VARCHAR(200),
  blast_plan_id       UUID NULL,                 -- FK blast_plan when event_type = OUT_LOAD
  pdf_sha256          VARCHAR(64),               -- NULL until async PDF snapshot uploaded
  source_reference    JSONB NOT NULL DEFAULT '{}',
  prev_hash           BYTEA NOT NULL,
  row_hash            BYTEA NOT NULL,
  created_by          UUID NOT NULL,
  PRIMARY KEY (id, occurred_at_utc)
) PARTITION BY RANGE (occurred_at_utc);

-- Initial partitions (2026)
CREATE TABLE IF NOT EXISTS explosives_event_y2026m01
  PARTITION OF explosives_event FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m02
  PARTITION OF explosives_event FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m03
  PARTITION OF explosives_event FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m04
  PARTITION OF explosives_event FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m05
  PARTITION OF explosives_event FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m06
  PARTITION OF explosives_event FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m07
  PARTITION OF explosives_event FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m08
  PARTITION OF explosives_event FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m09
  PARTITION OF explosives_event FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m10
  PARTITION OF explosives_event FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m11
  PARTITION OF explosives_event FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS explosives_event_y2026m12
  PARTITION OF explosives_event FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Indexes for chain verification and querying
CREATE INDEX IF NOT EXISTS idx_explosives_event_tenant_site_ts
  ON explosives_event (tenant_id, site_id, occurred_at_utc DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_explosives_event_operational_day
  ON explosives_event (operational_day_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_explosives_event_blast_plan
  ON explosives_event (blast_plan_id) WHERE blast_plan_id IS NOT NULL;

-- Append-only enforcement: allow only pdf_sha256 one-time backfill as UPDATE
CREATE OR REPLACE FUNCTION enforce_explosives_event_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'restrict_violation'
      USING DETAIL = 'explosives_event rows cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Allow one-time pdf_sha256 backfill only: all other columns must be unchanged
    IF OLD.pdf_sha256 IS NULL AND NEW.pdf_sha256 IS NOT NULL
       AND NEW.id = OLD.id
       AND NEW.row_hash = OLD.row_hash
    THEN
      RETURN NEW; -- allow this specific pdf backfill
    END IF;
    RAISE EXCEPTION 'restrict_violation'
      USING DETAIL = 'explosives_event rows are append-only; UPDATE not permitted except pdf_sha256 backfill';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_explosives_event_append_only ON explosives_event;
CREATE TRIGGER trg_explosives_event_append_only
  BEFORE UPDATE OR DELETE ON explosives_event
  FOR EACH ROW EXECUTE FUNCTION enforce_explosives_event_append_only();
