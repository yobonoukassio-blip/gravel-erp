-- Phase 04: Analytics, Consolidation & Finance schema.

-- FIN-01: Daily materialized cost-per-ton snapshot per site × calibre
CREATE TABLE IF NOT EXISTS cost_per_ton_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  material_type VARCHAR(50) NOT NULL,
  calibre_code VARCHAR(50) NOT NULL,
  tonnage_produced_t NUMERIC(14, 2) NOT NULL CHECK (tonnage_produced_t >= 0),
  cost_extraction_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_extraction_minor >= 0),
  cost_transport_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_transport_minor >= 0),
  cost_concassage_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_concassage_minor >= 0),
  cost_criblage_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_criblage_minor >= 0),
  cost_carburant_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_carburant_minor >= 0),
  cost_main_oeuvre_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_main_oeuvre_minor >= 0),
  cost_amortissement_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_amortissement_minor >= 0),
  total_cost_minor BIGINT NOT NULL CHECK (total_cost_minor >= 0),
  cost_per_ton_minor BIGINT NOT NULL CHECK (cost_per_ton_minor >= 0),
  currency CHAR(3) NOT NULL,
  is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, site_id, snapshot_date, calibre_code)
);
ALTER TABLE cost_per_ton_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS cpt_tenant_isolation ON cost_per_ton_snapshot
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- FIN-03: Budget per site × year × category
CREATE TABLE IF NOT EXISTS budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  year INT NOT NULL CHECK (year BETWEEN 2024 AND 2100),
  category VARCHAR(30) NOT NULL CHECK (category IN (
    'extraction','transport','concassage','criblage','carburant',
    'main_oeuvre','amortissement','hse','maintenance'
  )),
  budget_minor_units BIGINT NOT NULL CHECK (budget_minor_units >= 0),
  currency CHAR(3) NOT NULL,
  UNIQUE (tenant_id, site_id, year, category)
);
ALTER TABLE budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS budget_tenant_isolation ON budget
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- FIN-04: Analytical accounting ledger
CREATE TABLE IF NOT EXISTS analytical_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  cost_center VARCHAR(30) NOT NULL,
  activity VARCHAR(50) NOT NULL,
  label VARCHAR(200) NOT NULL,
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units >= 0),
  currency CHAR(3) NOT NULL,
  debit_credit CHAR(1) NOT NULL CHECK (debit_credit IN ('D', 'C')),
  source_table VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_table, source_id, cost_center)
);
CREATE INDEX IF NOT EXISTS ae_tenant_site_date_idx ON analytical_entry (tenant_id, site_id, entry_date);
ALTER TABLE analytical_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS ae_tenant_isolation ON analytical_entry
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- DSH-06: Alert rules configuration
CREATE TABLE IF NOT EXISTS alert_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  severity_filter VARCHAR(20) CHECK (severity_filter IN ('info','warning','critical')),
  channels VARCHAR(20)[] NOT NULL,
  role_codes VARCHAR(50)[] NOT NULL DEFAULT '{}'::varchar[],
  user_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS alert_rule_tenant_event_idx ON alert_rule (tenant_id, event_type);
ALTER TABLE alert_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS alert_rule_tenant_isolation ON alert_rule
  USING (tenant_id::text = current_setting('app.current_tenant', true));
