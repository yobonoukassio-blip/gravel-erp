-- 1716400100000__create_fuel_tank_event_partitioned.sql
-- Phase 02 W3 P06 — Append-only fuel event ledger with chain-of-hash (ADR-0007).
-- Partitioned BY RANGE (occurred_at_utc) — one partition per month.

CREATE TYPE fuel_tank_event_type AS ENUM (
    'FUEL_DELIVERY_IN',
    'FUEL_DISPENSE_OUT',
    'FUEL_ADJUSTMENT',
    'FUEL_RECONCILIATION'
);

CREATE TABLE fuel_tank_event (
    id                          UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id                   UUID NOT NULL,
    site_id                     UUID NOT NULL,
    tank_id                     UUID NOT NULL REFERENCES fuel_tank(id),
    event_type                  fuel_tank_event_type NOT NULL,
    liters_delta                NUMERIC(10,2) NOT NULL,
    operational_day_id          UUID NOT NULL REFERENCES operational_days(id),
    source_reference            JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at_utc             TIMESTAMPTZ NOT NULL,
    created_by                  UUID NOT NULL,
    prev_hash                   BYTEA NOT NULL,
    row_hash                    BYTEA NOT NULL,
    cost_per_liter_minor_units  BIGINT NULL,
    currency                    CHAR(3) NULL,
    created_at_utc              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, occurred_at_utc)
)
PARTITION BY RANGE (occurred_at_utc);

-- Monthly partitions: current + next 2 (run-book extends this list quarterly).
CREATE TABLE fuel_tank_event_2026_05 PARTITION OF fuel_tank_event
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE fuel_tank_event_2026_06 PARTITION OF fuel_tank_event
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE fuel_tank_event_2026_07 PARTITION OF fuel_tank_event
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE INDEX fuel_tank_event_tenant_time_idx
    ON fuel_tank_event (tenant_id, occurred_at_utc);
CREATE INDEX fuel_tank_event_tank_idx
    ON fuel_tank_event (tank_id, occurred_at_utc);
CREATE INDEX fuel_tank_event_op_day_idx
    ON fuel_tank_event (operational_day_id);

-- Defense in depth: block UPDATE / DELETE on the parent table.
CREATE OR REPLACE FUNCTION fuel_tank_event_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'fuel_tank_event is append-only'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fuel_tank_event_no_update
    BEFORE UPDATE OR DELETE ON fuel_tank_event
    FOR EACH ROW EXECUTE FUNCTION fuel_tank_event_block_mutation();

-- RLS on the partitioned parent — cascades to all partitions.
ALTER TABLE fuel_tank_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY fuel_tank_event_tenant_iso ON fuel_tank_event
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
