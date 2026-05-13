-- 1716400000000__create_fuel_tank.sql
-- Phase 02 W3 P06 — Fuel tank master row (D2-50, CAR-01).

CREATE TABLE fuel_tank (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL,
    site_id             UUID NOT NULL,
    code                VARCHAR(50) NOT NULL,
    label               VARCHAR(200) NOT NULL,
    capacity_liters     INT NOT NULL CHECK (capacity_liters > 0),
    fuel_type           VARCHAR(20) NOT NULL DEFAULT 'gasoil',
    gps_point           GEOGRAPHY(POINT, 4326) NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fuel_tank_tenant_site_code_uq UNIQUE (tenant_id, site_id, code)
);

CREATE INDEX fuel_tank_tenant_site_idx ON fuel_tank (tenant_id, site_id);

ALTER TABLE fuel_tank ENABLE ROW LEVEL SECURITY;
CREATE POLICY fuel_tank_tenant_iso ON fuel_tank
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
