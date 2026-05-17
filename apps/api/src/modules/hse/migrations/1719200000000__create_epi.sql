-- Migration: 1719200000000__create_epi
-- Owner: HSE module — HSE-03 EPI Management
--
-- Phase 3 deferred-scope finalization. Two append-flavored tables:
--   epi_item       — catalog of issuable PPE
--   epi_assignment — per-employee issuance + return + condition trail
--
-- RLS enabled; tenant_id always required.

CREATE TABLE IF NOT EXISTS epi_item (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL,
  name           VARCHAR(200) NOT NULL,
  category       VARCHAR(50)  NOT NULL,
  description    TEXT,
  is_mandatory   BOOLEAN      NOT NULL DEFAULT false,
  created_at_utc TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT epi_item_category_chk CHECK (
    category IN ('casque','gilet','chaussures','gants','masque','lunettes','harnais','bouchons','autre')
  ),
  CONSTRAINT epi_item_tenant_name_uq UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS epi_item_tenant_idx ON epi_item (tenant_id);
CREATE INDEX IF NOT EXISTS epi_item_mandatory_idx
  ON epi_item (tenant_id) WHERE is_mandatory = true;

ALTER TABLE epi_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY epi_item_tenant_isolation ON epi_item
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

COMMENT ON TABLE  epi_item    IS 'HSE-03 EPI master catalog. RLS by tenant. is_mandatory flag drives compliance dashboards.';

CREATE TABLE IF NOT EXISTS epi_assignment (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  employee_id     UUID NOT NULL,
  epi_item_id     UUID NOT NULL REFERENCES epi_item(id),
  issued_at_utc   TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by       UUID NOT NULL,
  returned_at_utc TIMESTAMPTZ NULL,
  returned_by     UUID NULL,
  condition       VARCHAR(20) NOT NULL DEFAULT 'good',
  notes           TEXT,
  created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT epi_assignment_condition_chk CHECK (
    condition IN ('good','damaged','condemned')
  ),
  CONSTRAINT epi_assignment_returned_chk CHECK (
    (returned_at_utc IS NULL AND returned_by IS NULL) OR
    (returned_at_utc IS NOT NULL AND returned_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS epi_assignment_employee_open_idx
  ON epi_assignment (tenant_id, employee_id) WHERE returned_at_utc IS NULL;
CREATE INDEX IF NOT EXISTS epi_assignment_item_idx ON epi_assignment (epi_item_id);
CREATE INDEX IF NOT EXISTS epi_assignment_condition_idx
  ON epi_assignment (tenant_id, condition) WHERE condition = 'condemned';

ALTER TABLE epi_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY epi_assignment_tenant_isolation ON epi_assignment
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

COMMENT ON TABLE  epi_assignment IS 'HSE-03 per-employee EPI issuance ledger. returned_at_utc NULL == still issued. Append-style: condemn creates a new row + closes original.';
COMMENT ON COLUMN epi_assignment.condition IS 'good | damaged | condemned. Once condemned the item must be re-issued via a new row.';
