-- Phase 1 follow-up — Supabase compatibility patch for application roles.
--
-- Context: 1715500000000__create_extensions_and_roles.sql declares roles
-- with `LOGIN PASSWORD`, which Supabase rejects (managed Postgres). On
-- Supabase the roles were initially created NOLOGIN out-of-band via an
-- emergency .mjs script; this migration captures the same effect as a
-- proper, idempotent migration so the schema is reproducible.
--
-- All roles are NOLOGIN — the app connects as the Supabase `postgres`
-- role and uses `SET ROLE` plus `app.current_tenant` GUC for RLS.

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'gravel_app',
    'gravel_service',
    'gravel_audit_writer',
    'gravel_admin',
    'gravel_readonly'
  ]
  LOOP
    BEGIN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    -- Allow the connecting role (postgres on Supabase) to assume them.
    EXECUTE format('GRANT %I TO postgres', r);
  END LOOP;
END
$$;

-- Re-apply schema usage grants (idempotent).
GRANT USAGE ON SCHEMA public TO gravel_app, gravel_service, gravel_audit_writer;
