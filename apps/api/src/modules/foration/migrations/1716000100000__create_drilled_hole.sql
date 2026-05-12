-- 1716000100000__create_drilled_hole.sql
-- Phase 02 W1 P02 — DrilledHole append-only event table (D2-11).
-- Server enforces append-only via controller (405) AND DB trigger (defense in depth).

CREATE TABLE drilled_hole (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                   UUID NOT NULL,
    site_id                     UUID NOT NULL,
    plan_id                     UUID NOT NULL REFERENCES drilling_plan(id),
    hole_index_in_plan          INTEGER NOT NULL,
    gps_point                   GEOGRAPHY(POINT, 4326) NULL,
    gps_accuracy_m              NUMERIC(5,1) NULL,
    actual_depth_m              NUMERIC(6,2) NOT NULL CHECK (actual_depth_m > 0),
    actual_diameter_mm          INTEGER NOT NULL CHECK (actual_diameter_mm > 0),
    inclination_deg             NUMERIC(4,1) NULL CHECK (inclination_deg IS NULL OR inclination_deg BETWEEN 0 AND 90),
    started_at_local            TIMESTAMP NOT NULL,
    ended_at_local              TIMESTAMP NOT NULL,
    iana_timezone               VARCHAR(64) NOT NULL,
    operational_day_id          UUID NOT NULL REFERENCES operational_days(id),
    operator_id                 UUID NOT NULL,
    machine_id                  UUID NOT NULL REFERENCES production_equipment(id),
    fuel_liters_consumed        NUMERIC(7,2) NULL CHECK (fuel_liters_consumed IS NULL OR fuel_liters_consumed >= 0),
    notes_text                  TEXT NULL,
    photo_blob_sha256           VARCHAR(64) NULL,
    tolerance_violation         BOOLEAN NOT NULL DEFAULT false,
    tolerance_violation_reason  TEXT NULL,
    corrects_hole_id            UUID NULL REFERENCES drilled_hole(id),
    created_by                  UUID NOT NULL,
    created_at_utc              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT drilled_hole_time_window CHECK (ended_at_local >= started_at_local),
    CONSTRAINT drilled_hole_plan_index_uq UNIQUE (plan_id, hole_index_in_plan)
);

CREATE INDEX drilled_hole_plan_idx     ON drilled_hole (plan_id);
CREATE INDEX drilled_hole_op_day_idx   ON drilled_hole (operational_day_id);
CREATE INDEX drilled_hole_machine_idx  ON drilled_hole (machine_id);
CREATE INDEX drilled_hole_gps_gix      ON drilled_hole USING GIST (gps_point);

-- Defense-in-depth: prevent UPDATE / DELETE at the DB layer. Corrections
-- are NEW rows with corrects_hole_id pointing to the original.
CREATE OR REPLACE FUNCTION drilled_hole_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'drilled_hole is append-only (use corrects_hole_id for corrections)'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER drilled_hole_no_update
    BEFORE UPDATE OR DELETE ON drilled_hole
    FOR EACH ROW EXECUTE FUNCTION drilled_hole_block_mutation();

ALTER TABLE drilled_hole ENABLE ROW LEVEL SECURITY;
CREATE POLICY drilled_hole_tenant_iso ON drilled_hole
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
