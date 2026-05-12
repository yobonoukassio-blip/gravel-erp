-- Phase 1 W1-P02 T01 — master-data schema.
-- Source: D-23, D-24, D-25, D-26.

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  country_id UUID NOT NULL REFERENCES countries(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  gps_point GEOMETRY(Point, 4326) NOT NULL,
  iana_timezone TEXT NOT NULL,
  functional_currency CHAR(3) NOT NULL,
  manager_user_id UUID NULL,
  capacity_t_per_day BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'standby', 'closed', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS sites_tenant_idx ON sites (tenant_id);
CREATE INDEX IF NOT EXISTS sites_gps_gix ON sites USING GIST (gps_point);

CREATE TABLE IF NOT EXISTS production_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, code)
);

CREATE INDEX IF NOT EXISTS production_zones_tenant_idx ON production_zones (tenant_id);
CREATE INDEX IF NOT EXISTS production_zones_geom_gix ON production_zones USING GIST (geometry);

CREATE TABLE IF NOT EXISTS benches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  production_zone_id UUID NOT NULL REFERENCES production_zones(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  elevation_m NUMERIC(8, 2) NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (production_zone_id, code)
);

CREATE INDEX IF NOT EXISTS benches_tenant_idx ON benches (tenant_id);
CREATE INDEX IF NOT EXISTS benches_geom_gix ON benches USING GIST (geometry);

CREATE TABLE IF NOT EXISTS permits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  type TEXT NOT NULL CHECK (type IN ('exploration', 'exploitation', 'environnemental', 'explosifs')),
  authority TEXT NOT NULL,
  reference TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  document_url TEXT NULL,           -- D-29: object-content-addressed (SHA-256 key)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  archived_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, reference),
  CHECK (valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS permits_tenant_idx ON permits (tenant_id);
