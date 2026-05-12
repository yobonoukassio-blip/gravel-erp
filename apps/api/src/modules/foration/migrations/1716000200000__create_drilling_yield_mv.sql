-- 1716000200000__create_drilling_yield_mv.sql
-- Phase 02 W1 P02 — FOR-03 drilling yield m/h.
--
-- Materialized view aggregating drilled_hole per (tenant, operational_day,
-- machine, operator). Excludes correction events (corrects_hole_id IS NULL)
-- to avoid double-counting depth on the originals being corrected.
--
-- Refreshed CONCURRENTLY 30s-debounced by ForationEventHandlers on
-- `production.foration.hole_drilled`.

CREATE MATERIALIZED VIEW drilling_yield_per_machine_day AS
SELECT
    tenant_id,
    operational_day_id,
    machine_id,
    operator_id,
    SUM(actual_depth_m) AS total_depth_m,
    EXTRACT(EPOCH FROM SUM(ended_at_local - started_at_local)) / 3600.0
        AS total_machine_hours,
    CASE
        WHEN EXTRACT(EPOCH FROM SUM(ended_at_local - started_at_local)) / 3600.0 > 0
        THEN SUM(actual_depth_m) /
             (EXTRACT(EPOCH FROM SUM(ended_at_local - started_at_local)) / 3600.0)
        ELSE 0
    END AS yield_m_per_h,
    COUNT(*) AS hole_count
FROM drilled_hole
WHERE corrects_hole_id IS NULL
GROUP BY tenant_id, operational_day_id, machine_id, operator_id;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX idx_drilling_yield_unique
    ON drilling_yield_per_machine_day
       (tenant_id, operational_day_id, machine_id, operator_id);

CREATE INDEX idx_drilling_yield_tenant_day
    ON drilling_yield_per_machine_day (tenant_id, operational_day_id);
