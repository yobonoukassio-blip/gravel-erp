-- Phase 08 W1-P01 T01 — Backfill denormalized equipment meter columns (D-07).
-- The columns themselves were created in Phase 3 migration
-- 1717300000000__create_maintenance_tables.sql (lines 4-8) but were never
-- populated. Phase 8 cron (ALT-01) reads these columns directly per D-05.

-- Idempotency: only backfill rows where hour_meter_current IS NULL so a
-- second run is a no-op. Rows updated since then via the meter event
-- handler (T03) are preserved.
UPDATE production_equipment pe
SET hour_meter_current = sub.max_hours
FROM (
  SELECT equipment_id, MAX(equipment_hour_meter_reading::numeric) AS max_hours
  FROM equipment_refuel
  GROUP BY equipment_id
) sub
WHERE pe.id = sub.equipment_id
  AND pe.hour_meter_current IS NULL;

-- No km backfill source exists yet in v1 — truck_rotation gains
-- km_total_after in migration 1719100100000 (T02). Trucks start with
-- odometer_km_current = NULL and accumulate via the meter event handler.
