-- Migration: 1716600000000__create_dashboard_projections
-- Creates dashboard_kpi_daily projection table for caching aggregations (Phase 2 DSH-01)

CREATE TABLE IF NOT EXISTS dashboard_kpi_daily (
  tenant_id           UUID        NOT NULL,
  site_id             UUID        NOT NULL,
  operational_day_id  UUID        NOT NULL,
  kpi_key             VARCHAR(80) NOT NULL,
  kpi_value_json      JSONB       NOT NULL,
  computed_at_utc     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, site_id, operational_day_id, kpi_key)
);

-- Index for tenant+site lookups (dashboard load)
CREATE INDEX IF NOT EXISTS idx_dkd_tenant_site_day
  ON dashboard_kpi_daily (tenant_id, site_id, operational_day_id);

-- Row-level security: only the owning tenant can read/write
ALTER TABLE dashboard_kpi_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_dkd_tenant ON dashboard_kpi_daily
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
