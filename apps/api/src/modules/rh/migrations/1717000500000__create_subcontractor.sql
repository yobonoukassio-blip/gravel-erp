-- Migration: 1717000500000__create_subcontractor
-- RH-01: Subcontractor company table
-- Phase 3 W0-P01

CREATE TABLE IF NOT EXISTS subcontractor (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL,
  company_name       VARCHAR(200) NOT NULL,
  country_iso2       CHAR(2) NOT NULL,
  contract_reference VARCHAR(100) NULL,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subcontractor_tenant_idx ON subcontractor (tenant_id);

ALTER TABLE subcontractor ENABLE ROW LEVEL SECURITY;

CREATE POLICY subcontractor_tenant_isolation ON subcontractor
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- Now add FK from employee to subcontractor
ALTER TABLE employee
  ADD CONSTRAINT employee_subcontractor_fk
    FOREIGN KEY (subcontractor_id) REFERENCES subcontractor(id);

COMMENT ON TABLE subcontractor IS
  'External subcontractor company (RH-01). '
  'Their individual workers are stored in the employee table with subcontractor_id set.';
