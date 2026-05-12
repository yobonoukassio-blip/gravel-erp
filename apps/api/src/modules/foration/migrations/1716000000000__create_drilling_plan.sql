-- 1716000000000__create_drilling_plan.sql
-- Phase 02 W1 P02 — Foration vertical slice.
-- DrillingPlan = mutable plan owned by Chef Carrière (D2-10).
-- Sync strategy: pessimistic_lock (web-only edit surface).
-- RLS enforced via tenant_id + app.current_tenant GUC.

CREATE TYPE drilling_plan_status AS ENUM ('draft','active','closed','archived');

CREATE TABLE drilling_plan (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID NOT NULL,
    site_id               UUID NOT NULL REFERENCES sites(id),
    zone_id               UUID NOT NULL REFERENCES production_zones(id),
    bench_id              UUID NOT NULL REFERENCES benches(id),
    planned_hole_count    INTEGER NOT NULL CHECK (planned_hole_count > 0),
    target_depth_m        NUMERIC(6,2) NOT NULL CHECK (target_depth_m > 0),
    diameter_mm           INTEGER NOT NULL CHECK (diameter_mm > 0),
    assigned_operator_id  UUID NULL,
    assigned_machine_id   UUID NULL REFERENCES production_equipment(id),
    valid_from            TIMESTAMPTZ NOT NULL,
    valid_to              TIMESTAMPTZ NULL,
    status                drilling_plan_status NOT NULL DEFAULT 'draft',
    created_by            UUID NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by             UUID NULL,
    closed_at_utc         TIMESTAMPTZ NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX drilling_plan_tenant_site_idx ON drilling_plan (tenant_id, site_id);
CREATE INDEX drilling_plan_bench_idx       ON drilling_plan (bench_id);
CREATE INDEX drilling_plan_status_idx      ON drilling_plan (status) WHERE status IN ('draft','active');

-- RLS: tenant isolation.
ALTER TABLE drilling_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY drilling_plan_tenant_iso ON drilling_plan
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
