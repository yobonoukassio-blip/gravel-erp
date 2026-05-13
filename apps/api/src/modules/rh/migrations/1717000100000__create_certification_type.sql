-- Migration: 1717000100000__create_certification_type
-- RH-04: CertificationType table
-- Phase 3 W0-P01

CREATE TABLE IF NOT EXISTS certification_type (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL,
  code              VARCHAR(50) NOT NULL,
  label             VARCHAR(200) NOT NULL,
  country_iso2      CHAR(2) NOT NULL,
  issuing_authority VARCHAR(200) NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at_utc    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT certification_type_tenant_code_uq UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS certification_type_tenant_idx ON certification_type (tenant_id);

ALTER TABLE certification_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY certification_type_tenant_isolation ON certification_type
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

COMMENT ON TABLE certification_type IS
  'Lookup table for certification codes (RH-04). '
  'Seed codes: PERMIS_EXPLOSIFS, CONDUITE_ENGIN_FOREUSE, CONDUITE_ENGIN_PELLE, '
  'CONDUITE_ENGIN_CAMION, FORMATION_HSE, CONDUITE_CHARGEUR.';

-- Seed Phase 3 certification types for CI tenant (ci-dev)
-- These are template seeds; production data loaded via admin API.
-- DO NOT hard-code a tenant_id here — use application-level seeding.
