-- Phase 8 — seed alert_rule entries for the new Phase-8 events + align Phase-7's spare_part rule to D-15.
--
-- D-15 (verbatim from 08-CONTEXT.md):
--   1. event_type = 'maintenance.work_order.preventive_opened', severity_filter = null,
--      channels = ['in_app','email'],
--      role_codes = ['MAINTENANCE_MANAGER','MECANICIEN_CHEF','DIRECTEUR_SITE']
--   2. event_type = 'maintenance.work_order.preventive_opened', severity_filter = 'critical',
--      channels = ['in_app','email','sms'],
--      role_codes = ['DIRECTEUR_SITE','DIRECTION_GROUPE']
--   3. event_type = 'maintenance.spare_part.threshold_crossed', severity_filter = null,
--      channels = ['in_app','email'],
--      role_codes = ['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']
--   4. event_type = 'maintenance.spare_part.threshold_crossed', severity_filter = 'critical',
--      channels = ['in_app','email','sms'],
--      role_codes = ['DIRECTEUR_SITE']
--
-- Phase 7 (migration 1718100000000__seed_alert_rules.sql) already seeded rule (3) but with
-- the WRONG role_codes (RESPONSABLE_MAINTENANCE, CHEF_CARRIERE). This migration UPDATEs
-- that row to align with D-15 verbatim, and INSERTs the three other rules.
--
-- D-14: role_codes only, NEVER user_ids.
-- D-16: SMS channel listed but the actual Twilio/Vonage integration ships in Phase 9 (NTF-02).

-- Tenant: Gravel Ivoire (only tenant in v1.1; v2 multi-tenant rollout will templatize this).
DO $$
DECLARE
  v_tenant_id UUID := '24cd97f8-0170-453e-89da-e9213dd710d7';
BEGIN

  -- 1. preventive_opened — default (warning/high → in_app + email)
  INSERT INTO alert_rule (id, tenant_id, event_type, severity_filter, channels, role_codes, user_ids)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'maintenance.work_order.preventive_opened',
    NULL,
    ARRAY['in_app','email']::varchar[],
    ARRAY['MAINTENANCE_MANAGER','MECANICIEN_CHEF','DIRECTEUR_SITE']::varchar[],
    ARRAY[]::uuid[]
  )
  ON CONFLICT DO NOTHING;

  -- 2. preventive_opened — critical (adds SMS)
  INSERT INTO alert_rule (id, tenant_id, event_type, severity_filter, channels, role_codes, user_ids)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'maintenance.work_order.preventive_opened',
    'critical',
    ARRAY['in_app','email','sms']::varchar[],
    ARRAY['DIRECTEUR_SITE','DIRECTION_GROUPE']::varchar[],
    ARRAY[]::uuid[]
  )
  ON CONFLICT DO NOTHING;

  -- 3. spare_part.threshold_crossed — default (warning/high → in_app + email)
  --    Phase-7 seeded this with different role_codes; UPDATE in place to D-15.
  UPDATE alert_rule
     SET role_codes = ARRAY['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']::varchar[],
         channels   = ARRAY['in_app','email']::varchar[],
         user_ids   = ARRAY[]::uuid[]
   WHERE tenant_id = v_tenant_id
     AND event_type = 'maintenance.spare_part.threshold_crossed'
     AND severity_filter IS NULL;

  -- If Phase-7 never seeded it (fresh DB), insert it now.
  INSERT INTO alert_rule (id, tenant_id, event_type, severity_filter, channels, role_codes, user_ids)
  SELECT
    gen_random_uuid(),
    v_tenant_id,
    'maintenance.spare_part.threshold_crossed',
    NULL,
    ARRAY['in_app','email']::varchar[],
    ARRAY['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']::varchar[],
    ARRAY[]::uuid[]
  WHERE NOT EXISTS (
    SELECT 1 FROM alert_rule
     WHERE tenant_id = v_tenant_id
       AND event_type = 'maintenance.spare_part.threshold_crossed'
       AND severity_filter IS NULL
  );

  -- 4. spare_part.threshold_crossed — critical (adds SMS)
  INSERT INTO alert_rule (id, tenant_id, event_type, severity_filter, channels, role_codes, user_ids)
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    'maintenance.spare_part.threshold_crossed',
    'critical',
    ARRAY['in_app','email','sms']::varchar[],
    ARRAY['DIRECTEUR_SITE']::varchar[],
    ARRAY[]::uuid[]
  )
  ON CONFLICT DO NOTHING;

END $$;
