-- Phase 1 W1-P02 T02 — apply RLS policies to every tenant-scoped table.
-- Source: D-06, D-07, D-08, RESEARCH.md Pattern 2, PITFALLS.md #5 #8.
--
-- Defense in depth layer 1 (database): ENABLE + FORCE ROW LEVEL SECURITY.
-- Layer 2 (ORM TenantRlsSubscriber) and Layer 3 (JWT gateway, plan W1-P04)
-- live in application code.
--
-- IMPORTANT: FORCE RLS is required because table owners (gravel_owner) bypass
-- standard RLS. Without FORCE, migrations and admin sessions silently see all
-- tenants. Pitfall #8.

DO $$
DECLARE
  t_name TEXT;
  tenant_tables TEXT[] := ARRAY[
    'tenants', 'countries', 'sites', 'production_zones', 'benches',
    'permits', 'operational_days', 'shifts', 'fx_rates'
  ];
BEGIN
  FOREACH t_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t_name);

    -- Drop existing policies if re-running.
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON %I', t_name, t_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_service_bypass ON %I', t_name, t_name);

    -- App role: isolation by tenant_id GUC.
    EXECUTE format($f$
      CREATE POLICY %I_isolation ON %I
        FOR ALL TO gravel_app
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t_name, t_name);

    -- Service role: bypass only when explicitly set.
    EXECUTE format($f$
      CREATE POLICY %I_service_bypass ON %I
        FOR ALL TO gravel_service
        USING (current_setting('app.bypass_rls', true) = 'on')
        WITH CHECK (current_setting('app.bypass_rls', true) = 'on')
    $f$, t_name, t_name);

    -- Grant DML to app role (already covered by default privileges, idempotent).
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO gravel_app', t_name);
    EXECUTE format('GRANT ALL ON %I TO gravel_service', t_name);
  END LOOP;
END $$;
