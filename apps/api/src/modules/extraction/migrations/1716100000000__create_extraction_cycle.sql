-- 1716100000000__create_extraction_cycle.sql
-- Phase 2 Wave 1 — ExtractionCycle append-only entity (D2-20, D2-21).
--
-- D2-21: `estimated_tonnage_t` is EXPLICITLY estimated. The authoritative
-- tonnage for stockpile valuation is the W2-P04 weighing ticket.
--
-- Append-only. PATCH/DELETE rejected at the controller layer. Corrections
-- land as new rows pointing at `corrects_id`.

DO $$ BEGIN
  CREATE TYPE material_type_enum AS ENUM ('granite_brut','tout_venant','sterile');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE downtime_reason_enum AS ENUM ('meal_break','fuel','mechanical','weather','safety','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS extraction_cycle (
  id                       UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                UUID                 NOT NULL,
  site_id                  UUID                 NOT NULL,
  operational_day_id       UUID                 NOT NULL REFERENCES operational_day(id),
  bench_id                 UUID                 NOT NULL REFERENCES bench(id),
  equipment_id             UUID                 NOT NULL REFERENCES production_equipment(id),
  operator_id              UUID                 NOT NULL,
  material_type            material_type_enum   NOT NULL,
  estimated_tonnage_t      NUMERIC(7,1)         NOT NULL CHECK (estimated_tonnage_t >= 0),
  cycle_started_at_local   TIMESTAMP            NOT NULL,
  cycle_ended_at_local     TIMESTAMP            NOT NULL,
  iana_timezone            VARCHAR(64)          NOT NULL,
  downtime_minutes         INT                  NULL CHECK (downtime_minutes >= 0),
  downtime_reason_code     downtime_reason_enum NULL,
  notes                    TEXT                 NULL,
  corrects_id              UUID                 NULL REFERENCES extraction_cycle(id),
  created_by               UUID                 NOT NULL,
  created_at_utc           TIMESTAMPTZ          NOT NULL DEFAULT now(),
  CHECK (cycle_ended_at_local > cycle_started_at_local),
  -- A downtime reason without minutes is invalid; minutes without reason is allowed
  -- only when minutes = 0 (caller should normalize to null).
  CHECK (downtime_reason_code IS NULL OR downtime_minutes IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_extraction_cycle_tenant_day
  ON extraction_cycle (tenant_id, operational_day_id);

CREATE INDEX IF NOT EXISTS idx_extraction_cycle_tenant_equipment_day
  ON extraction_cycle (tenant_id, equipment_id, operational_day_id);

CREATE INDEX IF NOT EXISTS idx_extraction_cycle_tenant_operator_day
  ON extraction_cycle (tenant_id, operator_id, operational_day_id);

-- RLS — ADR-0001
ALTER TABLE extraction_cycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_cycle FORCE ROW LEVEL SECURITY;

CREATE POLICY extraction_cycle_tenant_isolation ON extraction_cycle
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Append-only DB guard: block UPDATE/DELETE at the row level. The service
-- layer also returns 405, but the trigger is defense-in-depth.
CREATE OR REPLACE FUNCTION trg_extraction_cycle_block_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'extraction_cycle is append-only (D2-20)';
END $$;

DROP TRIGGER IF EXISTS extraction_cycle_no_update ON extraction_cycle;
CREATE TRIGGER extraction_cycle_no_update
  BEFORE UPDATE OR DELETE ON extraction_cycle
  FOR EACH ROW EXECUTE FUNCTION trg_extraction_cycle_block_mutation();
