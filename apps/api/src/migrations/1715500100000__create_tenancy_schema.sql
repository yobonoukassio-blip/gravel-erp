-- Phase 1 W1-P02 T01 — tenancy schema: tenants + countries.
-- Source: D-23, D-26 (soft-delete only).

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  default_locale TEXT NOT NULL DEFAULT 'fr-CI',
  group_pivot_currency CHAR(3) NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenants table: tenant_id IS the row's id. We expose a generated column to
-- keep the RLS policy uniform across all tables (always `tenant_id` predicate).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_id UUID GENERATED ALWAYS AS (id) STORED;

CREATE TABLE IF NOT EXISTS countries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  iso_alpha2 CHAR(2) NOT NULL,
  name TEXT NOT NULL,
  default_currency CHAR(3) NOT NULL,
  default_timezone TEXT NOT NULL,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, iso_alpha2)
);

CREATE INDEX IF NOT EXISTS countries_tenant_idx ON countries (tenant_id);
