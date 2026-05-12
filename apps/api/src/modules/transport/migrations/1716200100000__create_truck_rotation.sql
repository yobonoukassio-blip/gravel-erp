-- 1716200100000__create_truck_rotation.sql
-- Phase 02 W2 P04 — TruckRotation (D2-30, D2-34, TRP-01, TRP-03).
-- Append-only; FK to weighing_ticket NOT NULL (UNIQUE: one rotation per ticket).
-- cycle_time_minutes is generated; outbox event production.transport.rotation_completed
-- is emitted by the application layer on completion (D2-35).

CREATE TABLE IF NOT EXISTS truck_rotation (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id              UUID NOT NULL,
    site_id                UUID NOT NULL,
    operational_day_id     UUID NOT NULL REFERENCES operational_days(id),
    truck_equipment_id     UUID NULL REFERENCES production_equipment(id),
    driver_id              UUID NULL,
    loaded_at_bench_id     UUID NOT NULL REFERENCES benches(id),
    unloaded_at_zone_id    UUID NOT NULL REFERENCES production_zones(id),
    material_type          material_type_enum NOT NULL,
    loaded_tonnage_t       NUMERIC(7,2) NOT NULL CHECK (loaded_tonnage_t > 0),
    weighing_ticket_id     UUID NOT NULL REFERENCES weighing_ticket(id),
    loaded_at_utc          TIMESTAMPTZ NOT NULL,
    unloaded_at_utc        TIMESTAMPTZ NULL,
    cycle_time_minutes     NUMERIC(7,2) GENERATED ALWAYS AS (
        CASE WHEN unloaded_at_utc IS NOT NULL
             THEN EXTRACT(EPOCH FROM (unloaded_at_utc - loaded_at_utc)) / 60.0
             ELSE NULL
        END
    ) STORED,
    created_by             UUID NOT NULL,
    created_at_utc         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT truck_rotation_weighing_ticket_uq UNIQUE (weighing_ticket_id),
    CONSTRAINT truck_rotation_time_window CHECK (
        unloaded_at_utc IS NULL OR unloaded_at_utc >= loaded_at_utc
    )
);

CREATE INDEX IF NOT EXISTS truck_rotation_op_day_idx ON truck_rotation (operational_day_id);
CREATE INDEX IF NOT EXISTS truck_rotation_truck_idx  ON truck_rotation (truck_equipment_id);

-- Defense-in-depth: DELETE blocked. UPDATE is allowed only when transitioning
-- from unloaded_at_utc=NULL to a non-NULL value (rotation completion), and
-- when assigning a truck_equipment_id. Any other column mutation is blocked.
CREATE OR REPLACE FUNCTION truck_rotation_guard_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'truck_rotation is append-only — DELETE not permitted'
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- Allow only: unloaded_at_utc transition (NULL -> non-NULL),
    -- truck_equipment_id assignment, driver_id assignment.
    IF (OLD.unloaded_at_utc IS NOT NULL AND NEW.unloaded_at_utc IS NULL)
       OR OLD.id IS DISTINCT FROM NEW.id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR OLD.site_id IS DISTINCT FROM NEW.site_id
       OR OLD.operational_day_id IS DISTINCT FROM NEW.operational_day_id
       OR OLD.loaded_at_bench_id IS DISTINCT FROM NEW.loaded_at_bench_id
       OR OLD.unloaded_at_zone_id IS DISTINCT FROM NEW.unloaded_at_zone_id
       OR OLD.material_type IS DISTINCT FROM NEW.material_type
       OR OLD.loaded_tonnage_t IS DISTINCT FROM NEW.loaded_tonnage_t
       OR OLD.weighing_ticket_id IS DISTINCT FROM NEW.weighing_ticket_id
       OR OLD.loaded_at_utc IS DISTINCT FROM NEW.loaded_at_utc
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.created_at_utc IS DISTINCT FROM NEW.created_at_utc
    THEN
        RAISE EXCEPTION 'truck_rotation immutable column mutation rejected'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER truck_rotation_no_mutation
    BEFORE UPDATE OR DELETE ON truck_rotation
    FOR EACH ROW EXECUTE FUNCTION truck_rotation_guard_mutation();

ALTER TABLE truck_rotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY truck_rotation_tenant_iso ON truck_rotation
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
