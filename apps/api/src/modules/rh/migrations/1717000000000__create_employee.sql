-- Migration: 1717000000000__create_employee
-- RH-01: Employee table (direct-hire + subcontractor employees unified model)
-- Phase 3 W0-P01

CREATE TABLE IF NOT EXISTS employee (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL,
  site_id           UUID NULL REFERENCES site(id),
  subcontractor_id  UUID NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  employee_number   VARCHAR(50) NULL,
  contract_type     VARCHAR(10) NOT NULL CHECK (contract_type IN ('CDI', 'CDD', 'INTERIM')),
  role_code         VARCHAR(50) NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  hired_date        DATE NULL,
  created_by        UUID NOT NULL,
  created_at_utc    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either site_id (direct-hire) or subcontractor_id (subcontractor employee) must be set
  CONSTRAINT employee_site_or_subcontractor
    CHECK (site_id IS NOT NULL OR subcontractor_id IS NOT NULL)
);

-- Unique employee number per tenant (when set)
CREATE UNIQUE INDEX IF NOT EXISTS employee_tenant_number_uq
  ON employee (tenant_id, employee_number)
  WHERE employee_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS employee_tenant_idx ON employee (tenant_id);
CREATE INDEX IF NOT EXISTS employee_site_idx ON employee (site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employee_subcontractor_idx ON employee (subcontractor_id) WHERE subcontractor_id IS NOT NULL;

-- Row Level Security
ALTER TABLE employee ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_tenant_isolation ON employee
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- Trigger to auto-update updated_at_utc
CREATE OR REPLACE FUNCTION update_employee_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at_utc = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_updated_at_trigger
  BEFORE UPDATE ON employee
  FOR EACH ROW EXECUTE FUNCTION update_employee_updated_at();

COMMENT ON TABLE employee IS
  'Unified employee table for direct-hire and subcontractor staff (RH-01). '
  'Direct-hire: site_id set, subcontractor_id null. '
  'Subcontractor staff: subcontractor_id set, site_id null.';
