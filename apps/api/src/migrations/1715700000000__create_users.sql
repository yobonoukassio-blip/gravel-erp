-- W2-P04 — Identity: users table.
-- Source: D-04 (claim shape), D-07 (defense in depth via RLS), D-32 (preferred_locale).
-- `id` matches Keycloak `sub` claim (UUID). All access is RLS-scoped on tenant_id.
-- Audit trigger is attached by the audit_log generator from W1-P02
-- (apps/api/scripts/generate-audit-triggers.ts — P03 regenerates if it touches users).

BEGIN;

-- citext for case-insensitive email uniqueness.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  keycloak_sub    TEXT NOT NULL UNIQUE,
  email           CITEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN (
                    'DIRECTION_GROUPE',
                    'DIRECTEUR_SITE',
                    'CHEF_CARRIERE',
                    'MAINTENANCE',
                    'HSE',
                    'FINANCE',
                    'OPERATEUR_TERRAIN'
                  )),
  group_scope     TEXT NULL CHECK (group_scope IS NULL OR group_scope = 'group'),
  site_ids        UUID[] NOT NULL DEFAULT '{}',
  preferred_locale CHAR(5) NOT NULL DEFAULT 'fr-CI',
  mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
  archived_at     TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX users_tenant_role_idx ON users (tenant_id, role) WHERE archived_at IS NULL;
CREATE INDEX users_keycloak_sub_idx ON users (keycloak_sub);

-- D-07 layer 1: RLS on tenant_id.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_isolation ON users
  FOR ALL TO gravel_app
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- service role bypass (mirrors pattern from 1715500600000__apply_rls_policies.sql).
CREATE POLICY users_service_bypass ON users
  FOR ALL TO gravel_service
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON users TO gravel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO gravel_owner, gravel_service;

-- Audit trigger (gravel_audit_trigger() function defined in W1-P02
-- 1715500700000__generate_audit_triggers.sql).
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION gravel_audit_trigger();

-- updated_at touch trigger.
CREATE OR REPLACE FUNCTION users_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch_updated_at_trg
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_touch_updated_at();

COMMIT;
