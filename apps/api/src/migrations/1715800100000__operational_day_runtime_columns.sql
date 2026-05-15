-- Phase 1 follow-up — runtime columns + singular view alias for operational_days.
--
-- Context: API code reads/writes `workforce_headcount`, `worked_hours` and a
-- `metadata` JSONB bag on operational_days, and some queries refer to the
-- table by its singular name `operational_day` with a `date` alias. These
-- were patched into prod out-of-band; captured here for reproducibility.

ALTER TABLE operational_days ADD COLUMN IF NOT EXISTS workforce_headcount INT;
ALTER TABLE operational_days ADD COLUMN IF NOT EXISTS worked_hours        NUMERIC(8, 2);
ALTER TABLE operational_days ADD COLUMN IF NOT EXISTS metadata            JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Singular alias view with `date` exposed for callers that don't know the
-- canonical `business_date` column name (read-only, no INSTEAD OF trigger).
DROP VIEW IF EXISTS operational_day;
CREATE VIEW operational_day AS
  SELECT *, business_date AS date
  FROM operational_days;
