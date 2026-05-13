-- Migration: 1717000300000__create_shift_entry
-- RH-02: ShiftEntry append-only table
-- Phase 3 W0-P01

CREATE TABLE IF NOT EXISTS shift_entry (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL,
  site_id             UUID NOT NULL,
  operational_day_id  UUID NOT NULL,
  employee_id         UUID NOT NULL REFERENCES employee(id),
  check_in_utc        TIMESTAMPTZ NOT NULL,
  check_out_utc       TIMESTAMPTZ NULL,
  position_code       VARCHAR(50) NULL,
  supervisor_id       UUID NOT NULL REFERENCES employee(id),
  supersedes_id       UUID NULL REFERENCES shift_entry(id),
  created_at_utc      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_entry_tenant_idx ON shift_entry (tenant_id);
CREATE INDEX IF NOT EXISTS shift_entry_opday_emp_idx
  ON shift_entry (tenant_id, operational_day_id, employee_id);

ALTER TABLE shift_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY shift_entry_tenant_isolation ON shift_entry
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- Append-only trigger: block UPDATE and DELETE (same pattern as stockpile_event, hse_incident)
CREATE OR REPLACE FUNCTION shift_entry_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'shift_entry is append-only. Create a new row with supersedes_id instead.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER shift_entry_no_update
  BEFORE UPDATE ON shift_entry
  FOR EACH ROW EXECUTE FUNCTION shift_entry_append_only();

CREATE TRIGGER shift_entry_no_delete
  BEFORE DELETE ON shift_entry
  FOR EACH ROW EXECUTE FUNCTION shift_entry_append_only();

COMMENT ON TABLE shift_entry IS
  'Append-only shift presence record (RH-02). '
  'Corrections must create a new row with supersedes_id pointing to the original. '
  'BEFORE UPDATE/DELETE triggers enforce immutability at the schema level.';
