-- Phase 1 W1-P02 T03 — audit_log + audit_chain_state.
-- Source: D-27, D-28, PITFALLS.md #1 #6 #7.
--
-- Chain partitioned per (tenant_id, table_name) — Pitfall #6: a single global
-- chain would serialize ALL writes through one row lock.

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL,
  tenant_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  row_pk TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  before_jsonb JSONB,
  after_jsonb JSONB,
  actor_user_id UUID,
  request_id UUID,
  at_utc TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  prev_hash BYTEA NOT NULL,
  row_hash BYTEA NOT NULL,
  PRIMARY KEY (id, at_utc)
) PARTITION BY RANGE (at_utc);

-- Bootstrap 14 monthly partitions covering 2026 + 2027 + a 2025-12 catch-all
-- so seed/test inserts in older timestamps don't fail.
DO $$
DECLARE
  start_date DATE := DATE '2025-12-01';
  end_date DATE   := DATE '2028-02-01';
  cur DATE;
  next DATE;
  pname TEXT;
BEGIN
  cur := start_date;
  WHILE cur < end_date LOOP
    next := (cur + INTERVAL '1 month')::DATE;
    pname := format('audit_log_%s', to_char(cur, 'YYYY_MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
      pname, cur, next
    );
    cur := next;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS audit_log_tenant_table_id_idx ON audit_log (tenant_id, table_name, id);

-- Per-partition chain head. UPDATE FOR UPDATE on this row provides the
-- serialization point per (tenant_id, table_name) — different tenants do
-- not contend.
CREATE TABLE IF NOT EXISTS audit_chain_state (
  tenant_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  last_hash BYTEA NOT NULL DEFAULT '\x00'::bytea,
  PRIMARY KEY (tenant_id, table_name)
);

GRANT INSERT ON audit_log TO gravel_audit_writer, gravel_service;
GRANT SELECT ON audit_log TO gravel_app, gravel_service;
GRANT SELECT, INSERT, UPDATE ON audit_chain_state TO gravel_service, gravel_audit_writer;
-- Triggers run with SECURITY DEFINER (owner = gravel_owner). The owner must
-- be able to read/write audit_chain_state and INSERT into audit_log.
GRANT SELECT, INSERT, UPDATE ON audit_chain_state TO gravel_owner;
GRANT INSERT ON audit_log TO gravel_owner;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO gravel_owner;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO gravel_audit_writer, gravel_service;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_isolation ON audit_log;
CREATE POLICY audit_log_isolation ON audit_log
  FOR SELECT TO gravel_app
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Append-only: revoke any future UPDATE/DELETE on partitions from all roles.
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON audit_log FROM gravel_app, gravel_audit_writer;
