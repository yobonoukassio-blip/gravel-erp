-- Phase 1 W1-P02 T01 — Postgres extensions + 4 application roles.
-- Source: D-06 (RLS), D-07 (defense in depth), D-40 (PG 18 + PostGIS 3.5 + TimescaleDB).
--
-- Roles (NONE has BYPASSRLS):
--   gravel_owner        : owns schema, runs migrations
--   gravel_app          : runtime app role, RLS applies
--   gravel_service      : trigger/maintenance, can SET app.bypass_rls = 'on'
--   gravel_audit_writer : INSERT on audit_log only

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- TimescaleDB: optional (not in postgis/postgis:17-3.5 CI image; present in production).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'timescaledb not available — skipping (CI/dev only)';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gravel_owner') THEN
    CREATE ROLE gravel_owner LOGIN PASSWORD 'change_me_dev';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gravel_app') THEN
    CREATE ROLE gravel_app LOGIN PASSWORD 'change_me_dev' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gravel_service') THEN
    CREATE ROLE gravel_service LOGIN PASSWORD 'change_me_dev' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gravel_audit_writer') THEN
    CREATE ROLE gravel_audit_writer LOGIN PASSWORD 'change_me_dev' NOBYPASSRLS;
  END IF;
END $$;

-- Defense in depth: gravel_app cannot create objects, only DML.
GRANT USAGE ON SCHEMA public TO gravel_app, gravel_service, gravel_audit_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO gravel_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO gravel_app;
