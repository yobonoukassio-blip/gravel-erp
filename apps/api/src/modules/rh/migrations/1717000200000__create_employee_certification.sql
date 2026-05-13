-- Migration: 1717000200000__create_employee_certification
-- RH-04, HSE-04: EmployeeCertification table with temporal validity
-- Phase 3 W0-P01
-- Schema exactly per docs/phase-03-handoff/hse-rh-deferred-scope.md

CREATE TABLE IF NOT EXISTS employee_certification (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES employee(id),
  certification_type_id UUID NOT NULL REFERENCES certification_type(id),
  valid_from            DATE NOT NULL,
  valid_to              DATE NOT NULL,
  certificate_number    VARCHAR(100) NULL,
  document_sha256       VARCHAR(64) NULL,
  created_by            UUID NOT NULL,
  created_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS emp_cert_tenant_idx ON employee_certification (tenant_id);
CREATE INDEX IF NOT EXISTS emp_cert_employee_type_idx
  ON employee_certification (tenant_id, employee_id, certification_type_id);

-- Partial index to find active certifications fast
CREATE INDEX IF NOT EXISTS emp_cert_active_idx
  ON employee_certification (tenant_id, employee_id, certification_type_id, valid_from, valid_to);

ALTER TABLE employee_certification ENABLE ROW LEVEL SECURITY;

CREATE POLICY emp_cert_tenant_isolation ON employee_certification
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

COMMENT ON TABLE employee_certification IS
  'Temporal certification records (RH-04, HSE-04). '
  'valid_from and valid_to are DATE (not TIMESTAMPTZ) — certifications are '
  'calendar-day granular, not hour-granular. '
  'CHECK (valid_to >= valid_from) prevents inverted date ranges.';

COMMENT ON COLUMN employee_certification.valid_from IS
  'Inclusive lower bound. Certification is active when: valid_from <= asOfDate <= valid_to';

COMMENT ON COLUMN employee_certification.valid_to IS
  'Inclusive upper bound. Permanent certifications set valid_to to a far-future date '
  '(e.g. 2099-12-31) rather than NULL.';
