-- Phase 08 W2-P01 T03 — Seed PM-opened alert_rule rows (D-14, D-15)
-- AND align the Phase-7 spare-part NULL-severity rule's role_codes
-- to the D-15 verbatim list (Phase 7 used a different set).
--
-- Three NEW rows inserted by Phase 8 (with NOT EXISTS guards):
--   1. preventive_opened, severity_filter=NULL    -> in_app + email
--   2. preventive_opened, severity_filter=critical -> in_app + email + sms
--   3. spare_part.threshold_crossed, severity_filter=critical -> in_app + email + sms
--
-- One UPDATE issued by Phase 8 (idempotent — re-running produces the same role_codes):
--   4. spare_part.threshold_crossed, severity_filter=NULL — role_codes aligned to D-15.
--
-- Idempotency: NOT EXISTS guard on (tenant_id, event_type, severity_filter)
-- for the INSERT — same guard used by Phase 7's seed migration.
--
-- Column types (per 1718000000000__create_analytics_tables.sql):
--   severity_filter VARCHAR(20) CHECK IN ('info','warning','critical')
--   channels        VARCHAR(20)[]
--   role_codes      VARCHAR(50)[]
--   user_ids        UUID[]

-- Step A: Insert the 3 NEW rules.
INSERT INTO alert_rule (
  id, tenant_id, event_type, severity_filter, channels, role_codes, user_ids, is_active
)
SELECT
  gen_random_uuid(),
  v.tenant_id::uuid,
  v.event_type,
  v.severity_filter,
  v.channels::varchar(20)[],
  v.role_codes::varchar(50)[],
  '{}'::uuid[],
  true
FROM (VALUES
  -- 1. PM preventive opened — any severity
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'maintenance.work_order.preventive_opened',
    NULL::varchar(20),
    ARRAY['in_app','email'],
    ARRAY['MAINTENANCE_MANAGER','MECANICIEN_CHEF','DIRECTEUR_SITE']
  ),
  -- 2. PM preventive opened — critical only, includes SMS
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'maintenance.work_order.preventive_opened',
    'critical',
    ARRAY['in_app','email','sms'],
    ARRAY['DIRECTEUR_SITE','DIRECTION_GROUPE']
  ),
  -- 3. Spare part low — critical only, includes SMS
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'maintenance.spare_part.threshold_crossed',
    'critical',
    ARRAY['in_app','email','sms'],
    ARRAY['DIRECTEUR_SITE']
  )
) AS v(tenant_id, event_type, severity_filter, channels, role_codes)
WHERE NOT EXISTS (
  SELECT 1 FROM alert_rule ar
  WHERE ar.tenant_id = v.tenant_id::uuid
    AND ar.event_type = v.event_type
    AND COALESCE(ar.severity_filter, '__null__') = COALESCE(v.severity_filter, '__null__')
);

-- Step B: Align Phase-7 spare-part NULL-severity rule's role_codes to D-15 verbatim.
-- Phase 7 seeded ['RESPONSABLE_MAINTENANCE','CHEF_CARRIERE'] which contradicts D-15.
-- This UPDATE is idempotent: re-running produces the same role_codes.
UPDATE alert_rule
SET role_codes = ARRAY['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']::varchar(50)[]
WHERE event_type = 'maintenance.spare_part.threshold_crossed'
  AND severity_filter IS NULL;
