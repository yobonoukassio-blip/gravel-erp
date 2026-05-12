-- 1715000200000__create_production_equipment.sql
-- Phase 2 Wave 0 — light equipment registry (D2-14).
--
-- Full maintenance + preventive plan lives in Phase 3 (`maintenance` module).
-- This table covers the minimum needed by Phase 2: drill | excavator |
-- truck | generator; status active | maintenance | out_of_service.
-- "Panne bloque affectation plan" enforced at the service layer.

DO $$ BEGIN
  CREATE TYPE equipment_type AS ENUM ('drill','excavator','truck','generator');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE equipment_status AS ENUM ('active','maintenance','out_of_service');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS production_equipment (
  id          UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID             NOT NULL,
  site_id     UUID             NOT NULL REFERENCES sites(id),
  code        VARCHAR(50)      NOT NULL,
  label       VARCHAR(200)     NOT NULL,
  type        equipment_type   NOT NULL,
  status      equipment_status NOT NULL DEFAULT 'active',
  specs       JSONB            NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, site_id, code)
);

CREATE INDEX IF NOT EXISTS idx_prodeq_tenant_site_status
  ON production_equipment (tenant_id, site_id, status);

-- RLS — ADR-0001
ALTER TABLE production_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_equipment FORCE ROW LEVEL SECURITY;

CREATE POLICY production_equipment_tenant_isolation ON production_equipment
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- updated_at trigger — keep in sync with Phase 1 master-data convention.
CREATE OR REPLACE FUNCTION trg_production_equipment_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS production_equipment_updated_at ON production_equipment;
CREATE TRIGGER production_equipment_updated_at
  BEFORE UPDATE ON production_equipment
  FOR EACH ROW EXECUTE FUNCTION trg_production_equipment_set_updated_at();
