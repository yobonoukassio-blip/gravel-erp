-- Phase 1 W1-P02 T01 — fx_rates (D-17 immutable rate by id).
-- Rates are IMMUTABLE: enforced via revoked UPDATE and a guard trigger.

CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  from_currency CHAR(3) NOT NULL,
  to_currency CHAR(3) NOT NULL,
  rate_numerator BIGINT NOT NULL CHECK (rate_numerator > 0),
  rate_denominator BIGINT NOT NULL CHECK (rate_denominator > 0),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_currency, to_currency, valid_from)
);

CREATE INDEX IF NOT EXISTS fx_rates_tenant_idx ON fx_rates (tenant_id);
CREATE INDEX IF NOT EXISTS fx_rates_lookup_idx ON fx_rates (tenant_id, from_currency, to_currency, valid_from DESC);

-- Immutability guard: only INSERT allowed for app role.
REVOKE UPDATE, DELETE ON fx_rates FROM PUBLIC;

CREATE OR REPLACE FUNCTION fx_rates_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'fx_rates rows are immutable (D-17). Insert a new row instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fx_rates_no_update ON fx_rates;
CREATE TRIGGER fx_rates_no_update BEFORE UPDATE OR DELETE ON fx_rates
  FOR EACH ROW EXECUTE FUNCTION fx_rates_block_update();
