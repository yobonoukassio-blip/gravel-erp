-- Migration: alter_operational_day_workforce_headcount
-- Phase 2 W3 P07 — HSE-06 (D2-65)
-- Adds workforce_headcount column to operational_day.
-- Used by TfCalculatorService for TF KPI (taux de fréquence).

ALTER TABLE operational_day
  ADD COLUMN IF NOT EXISTS workforce_headcount INT NULL
    CHECK (workforce_headcount >= 0);

COMMENT ON COLUMN operational_day.workforce_headcount IS
  'Number of workers on-site that day. Used to compute hours_worked = SUM(workforce_headcount * 8h). NULL means data not yet captured for this day.';

-- Index to speed up TF rolling window queries.
CREATE INDEX IF NOT EXISTS op_day_site_headcount_idx
  ON operational_day (site_id, day_date)
  WHERE workforce_headcount IS NOT NULL;
