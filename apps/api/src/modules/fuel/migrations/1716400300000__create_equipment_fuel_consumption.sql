-- 1716400300000__create_equipment_fuel_consumption.sql
-- Phase 02 W3 P06 — EquipmentFuelConsumption per refuel row (D2-51, CAR-02).

CREATE TABLE equipment_fuel_consumption (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                   UUID NOT NULL,
    site_id                     UUID NOT NULL,
    equipment_id                UUID NOT NULL REFERENCES production_equipment(id),
    refuel_id                   UUID NOT NULL UNIQUE REFERENCES equipment_refuel(id),
    operational_day_id          UUID NOT NULL REFERENCES operational_days(id),
    liters                      NUMERIC(7,2) NOT NULL,
    hour_meter_reading          NUMERIC(8,1) NOT NULL,
    hours_since_previous        NUMERIC(7,2) NULL,
    cost_per_liter_minor_units  BIGINT NULL,
    currency                    CHAR(3) NULL,
    created_at_utc              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX efc_tenant_site_idx   ON equipment_fuel_consumption (tenant_id, site_id);
CREATE INDEX efc_equipment_idx     ON equipment_fuel_consumption (equipment_id, created_at_utc);
CREATE INDEX efc_op_day_idx        ON equipment_fuel_consumption (operational_day_id);

ALTER TABLE equipment_fuel_consumption ENABLE ROW LEVEL SECURITY;
CREATE POLICY efc_tenant_iso ON equipment_fuel_consumption
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
