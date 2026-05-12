-- 1716300100000__create_stockpile_event_partitioned.sql
-- Phase 02 W2 P05 — Append-only event ledger with chain-of-hash (ADR-0006).
-- Partitioned BY RANGE (occurred_at_utc) — one partition per month.

CREATE TYPE stockpile_event_type AS ENUM (
    'STOCKPILE_INFLOW',
    'STOCKPILE_OUTFLOW_SALE',
    'STOCKPILE_ADJUSTMENT',
    'STOCKPILE_TRANSFER'
);

CREATE TABLE stockpile_event (
    id                          UUID NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id                   UUID NOT NULL,
    site_id                     UUID NOT NULL,
    stockpile_id                UUID NOT NULL REFERENCES stockpile(id),
    event_type                  stockpile_event_type NOT NULL,
    tonnage_delta_kg            BIGINT NOT NULL,
    material_type               material_type_enum NOT NULL,
    calibre_code                VARCHAR(50) NOT NULL,
    operational_day_id          UUID NOT NULL REFERENCES operational_days(id),
    source_reference            JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at_utc             TIMESTAMPTZ NOT NULL,
    created_by                  UUID NOT NULL,
    prev_hash                   BYTEA NOT NULL,
    row_hash                    BYTEA NOT NULL,
    cost_per_ton_minor_units    BIGINT NULL,
    currency                    CHAR(3) NULL,
    cost_model_version          INT NOT NULL DEFAULT 1,
    created_at_utc              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, occurred_at_utc)
)
PARTITION BY RANGE (occurred_at_utc);

-- Monthly partitions: current + next 2 (run-book extends this list quarterly).
CREATE TABLE stockpile_event_2026_05 PARTITION OF stockpile_event
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE stockpile_event_2026_06 PARTITION OF stockpile_event
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE stockpile_event_2026_07 PARTITION OF stockpile_event
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE INDEX stockpile_event_tenant_time_idx
    ON stockpile_event (tenant_id, occurred_at_utc);
CREATE INDEX stockpile_event_stockpile_idx
    ON stockpile_event (stockpile_id, occurred_at_utc);
CREATE INDEX stockpile_event_op_day_idx
    ON stockpile_event (operational_day_id);

-- Idempotency: at most one stockpile_event per rotation_id (per tenant).
CREATE UNIQUE INDEX stockpile_event_rotation_uq
    ON stockpile_event (tenant_id, ((source_reference->>'rotation_id')))
    WHERE source_reference ? 'rotation_id';

-- Defense in depth: block UPDATE / DELETE on the parent table.
CREATE OR REPLACE FUNCTION stockpile_event_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'stockpile_event is append-only'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stockpile_event_no_update
    BEFORE UPDATE OR DELETE ON stockpile_event
    FOR EACH ROW EXECUTE FUNCTION stockpile_event_block_mutation();

-- RLS on the partitioned parent — cascades to all partitions.
ALTER TABLE stockpile_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY stockpile_event_tenant_iso ON stockpile_event
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
