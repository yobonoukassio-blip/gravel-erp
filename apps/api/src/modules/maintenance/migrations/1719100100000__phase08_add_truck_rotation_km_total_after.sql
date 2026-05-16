-- Phase 08 W1-P01 T02 — Add km_total_after to truck_rotation (D-06).
-- Source of odometer updates for production_equipment.odometer_km_current
-- consumed by the meter event handler in maintenance/.

ALTER TABLE truck_rotation
  ADD COLUMN IF NOT EXISTS km_total_after NUMERIC(12, 2);

COMMENT ON COLUMN truck_rotation.km_total_after IS
  'Total odometer reading on the truck AFTER this rotation completed. Used by Phase 8 MeterUpdateHandler to denormalize odometer_km_current on production_equipment. NULL for legacy rotations.';
