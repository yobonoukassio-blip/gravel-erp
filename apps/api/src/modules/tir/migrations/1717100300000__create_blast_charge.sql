-- Migration: create_blast_charge
-- TIR-04: Append-only blast charge entries (one row per hole load event).
-- variance_pct is a GENERATED column computed from planned vs actual qty.

CREATE TABLE IF NOT EXISTS blast_charge (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  occurred_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id       UUID NOT NULL,
  blast_plan_id   UUID NOT NULL REFERENCES blast_plan(id),
  hole_id         UUID NOT NULL,
  product_type    explosives_product_type NOT NULL,
  planned_qty_g   BIGINT NOT NULL,
  actual_qty_g    BIGINT NOT NULL,
  variance_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN planned_qty_g = 0 THEN 0
    ELSE ((actual_qty_g - planned_qty_g)::numeric / planned_qty_g) * 100 END
  ) STORED,
  detonator_serial VARCHAR(100) NULL,
  operator_id      UUID NOT NULL,
  created_at_utc   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_charge_plan
  ON blast_charge (blast_plan_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_blast_charge_hole
  ON blast_charge (hole_id);

-- Append-only enforcement: no updates or deletes
CREATE OR REPLACE FUNCTION enforce_blast_charge_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'restrict_violation'
      USING DETAIL = 'blast_charge rows cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'restrict_violation'
      USING DETAIL = 'blast_charge rows are append-only; UPDATE not permitted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blast_charge_append_only ON blast_charge;
CREATE TRIGGER trg_blast_charge_append_only
  BEFORE UPDATE OR DELETE ON blast_charge
  FOR EACH ROW EXECUTE FUNCTION enforce_blast_charge_append_only();
