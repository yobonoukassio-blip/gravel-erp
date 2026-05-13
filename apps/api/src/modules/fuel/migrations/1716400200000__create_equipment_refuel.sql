-- 1716400200000__create_equipment_refuel.sql
-- Phase 02 W3 P06 — EquipmentRefuel append-only (D2-51, CAR-02).

CREATE TABLE equipment_refuel (
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                       UUID NOT NULL,
    site_id                         UUID NOT NULL,
    tank_id                         UUID NOT NULL REFERENCES fuel_tank(id),
    equipment_id                    UUID NOT NULL REFERENCES production_equipment(id),
    operator_id                     UUID NOT NULL,
    liters                          NUMERIC(7,2) NOT NULL CHECK (liters > 0),
    equipment_hour_meter_reading    NUMERIC(8,1) NOT NULL CHECK (equipment_hour_meter_reading >= 0),
    gauge_photo_blob_sha256         VARCHAR(64) NULL,
    operational_day_id              UUID NOT NULL REFERENCES operational_days(id),
    created_at_local                TIMESTAMP NOT NULL,
    iana_timezone                   VARCHAR(64) NOT NULL,
    notes                           TEXT NULL,
    created_by                      UUID NOT NULL,
    created_at_utc                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE equipment_refuel IS 'Append-only. @SyncEntity(strategy: append_only_event). CAR-02.';

CREATE INDEX equipment_refuel_tenant_site_idx ON equipment_refuel (tenant_id, site_id);
CREATE INDEX equipment_refuel_tank_idx        ON equipment_refuel (tank_id);
CREATE INDEX equipment_refuel_equipment_idx   ON equipment_refuel (equipment_id);
CREATE INDEX equipment_refuel_op_day_idx      ON equipment_refuel (operational_day_id);

ALTER TABLE equipment_refuel ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_refuel_tenant_iso ON equipment_refuel
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
