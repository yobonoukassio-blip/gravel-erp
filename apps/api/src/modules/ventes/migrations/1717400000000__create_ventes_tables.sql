-- Phase 03 W2-P05: Ventes Part 1 schema (CRM + contrat + BL + FX + douane).

-- VTE-01: Customer (CRM léger)
CREATE TABLE IF NOT EXISTS customer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  default_currency CHAR(3) NOT NULL,
  payment_terms_days INT NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS customer_tenant_isolation ON customer
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- VTE-02: Sale contract
CREATE TABLE IF NOT EXISTS sale_contract (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  reference VARCHAR(50) NOT NULL,
  calibre_code VARCHAR(50) NOT NULL,
  unit_price_minor_units BIGINT NOT NULL CHECK (unit_price_minor_units >= 0),
  currency CHAR(3) NOT NULL,
  planned_tonnage_t NUMERIC(14, 2) NOT NULL CHECK (planned_tonnage_t > 0),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL CHECK (period_to >= period_from),
  authorized_transporter_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  is_export BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS sale_contract_tenant_customer_idx ON sale_contract (tenant_id, customer_id);
ALTER TABLE sale_contract ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS sale_contract_tenant_isolation ON sale_contract
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- VTE-03: Bon de Livraison
CREATE TABLE IF NOT EXISTS bon_de_livraison (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID NOT NULL,
  number VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  sale_contract_id UUID NOT NULL REFERENCES sale_contract(id),
  truck_rotation_id UUID,
  transporter_id UUID,
  stockpile_id UUID NOT NULL,
  calibre_code VARCHAR(50) NOT NULL,
  tonnage_kg NUMERIC(14, 3) NOT NULL CHECK (tonnage_kg > 0),
  delivery_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_signature', 'signed', 'cancelled')),
  client_signature_sha256 CHAR(64),
  driver_signature_sha256 CHAR(64),
  content_sha256 CHAR(64),
  signed_at_utc TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
ALTER TABLE bon_de_livraison ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS bl_tenant_isolation ON bon_de_livraison
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- IMMUTABILITY: BL becomes append-only once SIGNED
CREATE OR REPLACE FUNCTION bl_block_update_after_signed() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'BL_IMMUTABLE: bon_de_livraison is immutable after signed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bl_immutable_trigger ON bon_de_livraison;
CREATE TRIGGER bl_immutable_trigger
  BEFORE UPDATE OR DELETE ON bon_de_livraison
  FOR EACH ROW EXECUTE FUNCTION bl_block_update_after_signed();

-- FX rate snapshot (immutable once inserted)
CREATE TABLE IF NOT EXISTS fx_rate_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  currency_from CHAR(3) NOT NULL,
  currency_to CHAR(3) NOT NULL,
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  snapshot_date DATE NOT NULL,
  source VARCHAR(50) NOT NULL,
  UNIQUE (tenant_id, currency_from, currency_to, snapshot_date)
);
ALTER TABLE fx_rate_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS fx_snapshot_tenant_isolation ON fx_rate_snapshot
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- VTE-06: Customs dossier (auto-created for export BLs)
CREATE TABLE IF NOT EXISTS customs_dossier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  bl_id UUID NOT NULL UNIQUE REFERENCES bon_de_livraison(id),
  declaration_number VARCHAR(100),
  destination_country CHAR(3) NOT NULL,
  certificates JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE customs_dossier ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS customs_tenant_isolation ON customs_dossier
  USING (tenant_id::text = current_setting('app.current_tenant', true));
