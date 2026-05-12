-- 1716200000000__create_weighing_ticket.sql
-- Phase 02 W2 P04 — WeighingTicket (D2-31, D2-32, D2-33, TRP-02).
-- Append-only. Numbering offline-safe SITE-YYYYMMDD-DEVICE-SEQ. content_hash SHA-256.

CREATE TABLE IF NOT EXISTS weighing_ticket (
    id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                     UUID NOT NULL,
    site_id                       UUID NOT NULL,
    ticket_number                 VARCHAR(80) NOT NULL,
    gross_kg                      INTEGER NOT NULL CHECK (gross_kg > 0),
    tare_kg                       INTEGER NOT NULL CHECK (tare_kg >= 0),
    net_kg                        INTEGER GENERATED ALWAYS AS (gross_kg - tare_kg) STORED,
    truck_equipment_id            UUID NOT NULL REFERENCES production_equipment(id),
    driver_id                     UUID NOT NULL,
    material_type                 material_type_enum NOT NULL,
    weighed_at_local              TIMESTAMP NOT NULL,
    iana_timezone                 VARCHAR(64) NOT NULL,
    operational_day_id            UUID NOT NULL REFERENCES operational_days(id),
    operator_user_id              UUID NOT NULL,
    weighing_station_code         VARCHAR(50) NOT NULL,
    client_signature_blob_sha256  VARCHAR(64) NULL,
    driver_signature_blob_sha256  VARCHAR(64) NULL,
    notes                         TEXT NULL,
    is_offline_generated          BOOLEAN NOT NULL DEFAULT false,
    content_hash                  VARCHAR(64) NOT NULL,
    created_by                    UUID NOT NULL,
    created_at_utc                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT weighing_ticket_gross_gt_tare CHECK (gross_kg > tare_kg),
    CONSTRAINT weighing_ticket_tenant_no_uq UNIQUE (tenant_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS weighing_ticket_op_day_idx
    ON weighing_ticket (operational_day_id);
CREATE INDEX IF NOT EXISTS weighing_ticket_truck_idx
    ON weighing_ticket (truck_equipment_id);

-- Defense-in-depth: append-only at the DB layer.
CREATE OR REPLACE FUNCTION weighing_ticket_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'weighing_ticket is append-only'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER weighing_ticket_no_update
    BEFORE UPDATE OR DELETE ON weighing_ticket
    FOR EACH ROW EXECUTE FUNCTION weighing_ticket_block_mutation();

ALTER TABLE weighing_ticket ENABLE ROW LEVEL SECURITY;
CREATE POLICY weighing_ticket_tenant_iso ON weighing_ticket
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
