-- Migration: 1717000400000__create_shift_roster
-- RH-03: ShiftRoster mutable table with pessimistic_lock strategy
-- Phase 3 W0-P01

CREATE TABLE IF NOT EXISTS shift_roster (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL,
  site_id        UUID NOT NULL,
  roster_date    DATE NOT NULL,
  roster_jsonb   JSONB NOT NULL DEFAULT '[]',
  version        INT NOT NULL DEFAULT 1,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shift_roster_site_date_uq UNIQUE (tenant_id, site_id, roster_date)
);

CREATE INDEX IF NOT EXISTS shift_roster_tenant_idx ON shift_roster (tenant_id);
CREATE INDEX IF NOT EXISTS shift_roster_site_date_idx ON shift_roster (tenant_id, site_id, roster_date);

ALTER TABLE shift_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY shift_roster_tenant_isolation ON shift_roster
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

CREATE OR REPLACE FUNCTION update_shift_roster_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at_utc = now();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shift_roster_updated_at_trigger
  BEFORE UPDATE ON shift_roster
  FOR EACH ROW EXECUTE FUNCTION update_shift_roster_updated_at();

COMMENT ON TABLE shift_roster IS
  'Weekly shift roster (RH-03). Mutable with pessimistic_lock. '
  'Version is auto-incremented on every UPDATE. '
  'PUT endpoint requires sending current version; server returns 409 CONFLICT on mismatch.';

COMMENT ON COLUMN shift_roster.roster_jsonb IS
  'Array of { employee_id: uuid, position_code: string, shift_type: "JOUR"|"NUIT" } objects.';
