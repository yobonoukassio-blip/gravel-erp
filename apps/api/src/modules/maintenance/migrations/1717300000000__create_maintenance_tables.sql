-- Phase 03 W2-P04: Maintenance module schema.

-- Extend production_equipment with hour/odometer counters (MNT-01)
ALTER TABLE production_equipment
  ADD COLUMN IF NOT EXISTS hour_meter_current NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS odometer_km_current NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS commissioned_date DATE;

-- MNT-02: Preventive maintenance plan
CREATE TABLE IF NOT EXISTS preventive_maintenance_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  label VARCHAR(200) NOT NULL,
  interval_unit VARCHAR(10) NOT NULL CHECK (interval_unit IN ('hours', 'km', 'days')),
  interval_value INT NOT NULL CHECK (interval_value > 0),
  last_executed_meter NUMERIC(12, 2),
  last_executed_at_utc TIMESTAMPTZ,
  next_due_at_utc TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS pm_plan_tenant_equipment_idx ON preventive_maintenance_plan (tenant_id, equipment_id);
ALTER TABLE preventive_maintenance_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS pm_plan_tenant_isolation ON preventive_maintenance_plan
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- MNT-03: Work order (corrective + preventive)
CREATE TABLE IF NOT EXISTS work_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  type VARCHAR(15) NOT NULL CHECK (type IN ('corrective', 'preventive')),
  status VARCHAR(15) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed', 'cancelled')),
  diagnosis TEXT,
  resolution TEXT,
  pm_plan_id UUID REFERENCES preventive_maintenance_plan(id),
  technician_id UUID,
  downtime_minutes INT NOT NULL DEFAULT 0 CHECK (downtime_minutes >= 0),
  labor_hours NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (labor_hours >= 0),
  opened_at_utc TIMESTAMPTZ NOT NULL,
  closed_at_utc TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_tenant_equipment_idx ON work_order (tenant_id, equipment_id);
CREATE INDEX IF NOT EXISTS work_order_status_idx ON work_order (tenant_id, status);
ALTER TABLE work_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS work_order_tenant_isolation ON work_order
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- MNT-04: Spare parts inventory with threshold
CREATE TABLE IF NOT EXISTS spare_part (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  sku VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  quantity_on_hand INT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  threshold_min INT CHECK (threshold_min IS NULL OR threshold_min >= 0),
  below_threshold BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tenant_id, site_id, sku)
);
ALTER TABLE spare_part ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS spare_part_tenant_isolation ON spare_part
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Audit: spare part consumed by work order
CREATE TABLE IF NOT EXISTS spare_part_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  work_order_id UUID NOT NULL REFERENCES work_order(id),
  spare_part_id UUID NOT NULL REFERENCES spare_part(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  consumed_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spc_wo_idx ON spare_part_consumption (work_order_id);
ALTER TABLE spare_part_consumption ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS spc_tenant_isolation ON spare_part_consumption
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- MNT-05: Materialized MTBF/MTTR projection
CREATE TABLE IF NOT EXISTS equipment_availability (
  equipment_id UUID PRIMARY KEY REFERENCES production_equipment(id),
  tenant_id UUID NOT NULL,
  mtbf_hours NUMERIC(12, 2),
  mttr_hours NUMERIC(12, 2),
  failure_count INT NOT NULL DEFAULT 0,
  total_downtime_minutes INT NOT NULL DEFAULT 0,
  computed_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE equipment_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS equipment_availability_tenant_isolation ON equipment_availability
  USING (tenant_id::text = current_setting('app.current_tenant', true));
