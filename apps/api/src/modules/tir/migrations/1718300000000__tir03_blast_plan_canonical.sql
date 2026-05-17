-- TIR-03 / TIR-05 — Bring blast_plan to the canonical schema expected by
-- BlastPlanService without dropping data.
--
-- Strategy: additive. The legacy v1 seed columns (bench_id, label,
-- planned_at_utc, hole_count, explosives_kg_planned, hse_clearance_status)
-- are kept but relaxed to NULLABLE so new rows created through the
-- canonical INSERT path (operational_day_id + drilling_plan_id + planned_by)
-- don't violate constraints. Legacy rows are backfilled where we can.

-- 1. Add canonical columns ---------------------------------------------------
ALTER TABLE blast_plan
  ADD COLUMN IF NOT EXISTS operational_day_id      UUID,
  ADD COLUMN IF NOT EXISTS drilling_plan_id        UUID,
  ADD COLUMN IF NOT EXISTS planned_by              UUID,
  ADD COLUMN IF NOT EXISTS notes_md                TEXT,
  ADD COLUMN IF NOT EXISTS hse_approved_by         UUID,
  ADD COLUMN IF NOT EXISTS hse_approved_at_utc     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_operator_id     UUID,
  ADD COLUMN IF NOT EXISTS loading_approved_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fire_requested_at_utc   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clearance_token         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS version                 INTEGER NOT NULL DEFAULT 1;

-- 2. Backfill canonical columns from legacy where possible ------------------
UPDATE blast_plan
   SET planned_by = created_by
 WHERE planned_by IS NULL AND created_by IS NOT NULL;

UPDATE blast_plan
   SET notes_md = notes
 WHERE notes_md IS NULL AND notes IS NOT NULL;

-- 3. Relax legacy NOT NULL constraints so canonical INSERTs succeed ---------
DO $$
DECLARE
  c text;
  legacy_cols text[] := ARRAY[
    'bench_id', 'label', 'planned_at_utc', 'hole_count',
    'explosives_kg_planned', 'hse_clearance_status', 'created_by'
  ];
BEGIN
  FOREACH c IN ARRAY legacy_cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'blast_plan'
         AND column_name = c
         AND is_nullable = 'NO'
    ) THEN
      EXECUTE format('ALTER TABLE blast_plan ALTER COLUMN %I DROP NOT NULL', c);
    END IF;
  END LOOP;
END $$;

-- 4. Allow the canonical status values used by the state machine ------------
-- The legacy seed used lowercase statuses ('planned','fired',...). Normalize
-- them to the canonical uppercase form, then drop the (possibly-existing) CHECK
-- and install the canonical one.
UPDATE blast_plan
   SET status = CASE lower(status)
     WHEN 'planned'        THEN 'DRAFT'
     WHEN 'draft'          THEN 'DRAFT'
     WHEN 'hse_approved'   THEN 'HSE_APPROVED'
     WHEN 'approved'       THEN 'HSE_APPROVED'
     WHEN 'loaded'         THEN 'LOADED'
     WHEN 'fire_requested' THEN 'FIRE_REQUESTED'
     WHEN 'cleared'        THEN 'CLEARED'
     WHEN 'fired'          THEN 'FIRED'
     WHEN 'reported'       THEN 'REPORTED'
     WHEN 'cancelled'      THEN 'CANCELLED'
     WHEN 'canceled'       THEN 'CANCELLED'
     ELSE upper(status)
   END
 WHERE status IS NOT NULL
   AND status <> upper(status);

DO $$
DECLARE
  conname text;
BEGIN
  SELECT con.conname INTO conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'blast_plan'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%status%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE blast_plan DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE blast_plan
  ADD CONSTRAINT blast_plan_status_chk
  CHECK (status IN ('DRAFT', 'HSE_APPROVED', 'LOADED', 'FIRE_REQUESTED',
                    'CLEARED', 'FIRED', 'REPORTED', 'CANCELLED'));

-- 5. Index for the list() query --------------------------------------------
CREATE INDEX IF NOT EXISTS blast_plan_tenant_site_created_idx
  ON blast_plan (tenant_id, site_id, created_at_utc DESC);
