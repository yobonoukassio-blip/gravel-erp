-- Phase 1 W1-P02 T01 — operational_days + shifts (D-19, D-22).

CREATE TABLE IF NOT EXISTS operational_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  business_date DATE NOT NULL,
  shift_start_local TIME NOT NULL,
  iana_timezone TEXT NOT NULL,
  started_at_utc TIMESTAMPTZ NOT NULL,
  ended_at_utc TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, business_date),
  CHECK (ended_at_utc > started_at_utc)
);

CREATE INDEX IF NOT EXISTS operational_days_tenant_idx ON operational_days (tenant_id);
CREATE INDEX IF NOT EXISTS operational_days_site_date_idx ON operational_days (site_id, business_date);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  operational_day_id UUID NOT NULL REFERENCES operational_days(id),
  kind TEXT NOT NULL CHECK (kind IN ('day', 'night', 'overlap')),
  started_at_utc TIMESTAMPTZ NOT NULL,
  ended_at_utc TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at_utc > started_at_utc)
);

CREATE INDEX IF NOT EXISTS shifts_tenant_idx ON shifts (tenant_id);
CREATE INDEX IF NOT EXISTS shifts_op_day_idx ON shifts (operational_day_id);
