-- 1716400400000__create_energy_consumption_reading.sql
-- Phase 02 W3 P06 — Manual monthly energy consumption readings (CAR-04).

CREATE TYPE energy_usage_type AS ENUM (
    'concassage',
    'criblage',
    'ateliers',
    'bureaux'
);

CREATE TABLE energy_consumption_reading (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL,
    site_id             UUID NOT NULL,
    year_month          CHAR(7) NOT NULL,
    usage_type          energy_usage_type NOT NULL,
    kwh                 NUMERIC(10,2) NOT NULL CHECK (kwh >= 0),
    source_meter_code   VARCHAR(50) NULL,
    recorded_by         UUID NOT NULL,
    recorded_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes               TEXT NULL,
    CONSTRAINT energy_reading_tenant_site_month_type_uq
        UNIQUE (tenant_id, site_id, year_month, usage_type)
);

CREATE INDEX energy_reading_tenant_site_idx ON energy_consumption_reading (tenant_id, site_id);
CREATE INDEX energy_reading_year_month_idx  ON energy_consumption_reading (year_month);

ALTER TABLE energy_consumption_reading ENABLE ROW LEVEL SECURITY;
CREATE POLICY energy_reading_tenant_iso ON energy_consumption_reading
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
