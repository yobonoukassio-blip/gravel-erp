-- 1718000000001__add_site_id_to_alert_rule.sql
-- Phase 4 / Plan W1-P3 (DSH-06): Add site_id to alert_rule for per-site scoping.
-- site_id nullable: NULL means rule applies to ALL sites of the tenant.

ALTER TABLE alert_rule
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES site(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS alert_rule_site_idx ON alert_rule (tenant_id, site_id)
  WHERE site_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Default alert rules (tenant-wide, site_id = NULL).
-- These fire for all tenants via a DO $$ block using a loop over tenant rows.
-- For fresh installations the tenant table may be empty — the loop is safe.
--
-- 4 critical event types:
--   1. Stockpile threshold crossed        → DIRECTEUR_SITE + DIRECTION_GROUPE
--   2. Spare-part stock low               → MAINTENANCE + DIRECTEUR_SITE
--   3. HSE incident created               → HSE + DIRECTEUR_SITE + DIRECTION_GROUPE
--   4. Explosives reconciliation gap (TIR)→ DIRECTEUR_SITE + DIRECTION_GROUPE (critical only)
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t_row RECORD;
BEGIN
  FOR t_row IN SELECT id AS tenant_id FROM tenant LOOP

    -- 1. Stockpile seuil bas
    INSERT INTO alert_rule (id, tenant_id, site_id, event_type, severity_filter, channels, role_codes, user_ids, is_active)
    VALUES (
      gen_random_uuid(),
      t_row.tenant_id,
      NULL,
      'production.stockpile.threshold_crossed',
      NULL,  -- any severity
      ARRAY['in_app']::varchar[],
      ARRAY['DIRECTEUR_SITE', 'DIRECTION_GROUPE']::varchar[],
      ARRAY[]::uuid[],
      true
    )
    ON CONFLICT DO NOTHING;

    -- 2. Pièce de rechange basse
    INSERT INTO alert_rule (id, tenant_id, site_id, event_type, severity_filter, channels, role_codes, user_ids, is_active)
    VALUES (
      gen_random_uuid(),
      t_row.tenant_id,
      NULL,
      'maintenance.spare_part.threshold_crossed',
      'warning',
      ARRAY['in_app']::varchar[],
      ARRAY['MAINTENANCE', 'DIRECTEUR_SITE']::varchar[],
      ARRAY[]::uuid[],
      true
    )
    ON CONFLICT DO NOTHING;

    -- 3. Incident HSE
    INSERT INTO alert_rule (id, tenant_id, site_id, event_type, severity_filter, channels, role_codes, user_ids, is_active)
    VALUES (
      gen_random_uuid(),
      t_row.tenant_id,
      NULL,
      'hse.incident.created',
      NULL,  -- info + warning + critical
      ARRAY['in_app']::varchar[],
      ARRAY['HSE', 'DIRECTEUR_SITE', 'DIRECTION_GROUPE']::varchar[],
      ARRAY[]::uuid[],
      true
    )
    ON CONFLICT DO NOTHING;

    -- 4. Écart réconciliation explosifs (TIR-07) — critique uniquement
    INSERT INTO alert_rule (id, tenant_id, site_id, event_type, severity_filter, channels, role_codes, user_ids, is_active)
    VALUES (
      gen_random_uuid(),
      t_row.tenant_id,
      NULL,
      'tir.explosives.reconciliation_gap',
      'critical',
      ARRAY['in_app']::varchar[],
      ARRAY['DIRECTEUR_SITE', 'DIRECTION_GROUPE']::varchar[],
      ARRAY[]::uuid[],
      true
    )
    ON CONFLICT DO NOTHING;

  END LOOP;
END
$$;
