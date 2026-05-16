-- Phase 07 Plan 01 — Seed default alert_rules (FIN-R06).
--
-- Seeds 5 default routing rules for the demo tenant. Event names must match
-- the @OnEvent decorators in AlertDispatcherService EXACTLY, otherwise
-- nothing will dispatch.
--
-- Idempotent: NOT EXISTS guard on (tenant_id, event_type, severity_filter)
-- so re-running the migration is a no-op.
--
-- Column types (per 1718000000000__create_analytics_tables.sql):
--   severity_filter VARCHAR(20) CHECK IN ('info','warning','critical')
--   channels        VARCHAR(20)[]
--   role_codes      VARCHAR(50)[]
--   user_ids        UUID[]

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
  -- 1. Stockpile threshold crossed (any severity)
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'production.stockpile.threshold_crossed',
    NULL::varchar(20),
    ARRAY['in_app','email'],
    ARRAY['DIRECTEUR_SITE','CHEF_CARRIERE']
  ),
  -- 2. Spare part stock low
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'maintenance.spare_part.threshold_crossed',
    NULL::varchar(20),
    ARRAY['in_app','email'],
    ARRAY['RESPONSABLE_MAINTENANCE','CHEF_CARRIERE']
  ),
  -- 3. HSE incident — critical severity routes also to SMS
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'hse.incident.created',
    'critical',
    ARRAY['in_app','email','sms'],
    ARRAY['DIRECTEUR_SITE','HSE_MANAGER','DIRECTION_GROUPE']
  ),
  -- 4. Explosives reconciliation gap (always critical)
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'tir.explosives.reconciliation_gap',
    NULL::varchar(20),
    ARRAY['in_app','email','sms'],
    ARRAY['DIRECTEUR_SITE','RESPONSABLE_TIR','HSE_MANAGER']
  ),
  -- 5. Fuel anomaly detected
  (
    '24cd97f8-0170-453e-89da-e9213dd710d7',
    'production.fuel.anomaly_detected',
    NULL::varchar(20),
    ARRAY['in_app','email'],
    ARRAY['DIRECTEUR_SITE','RESPONSABLE_LOGISTIQUE']
  )
) AS v(tenant_id, event_type, severity_filter, channels, role_codes)
WHERE NOT EXISTS (
  SELECT 1 FROM alert_rule ar
  WHERE ar.tenant_id = v.tenant_id::uuid
    AND ar.event_type = v.event_type
    AND COALESCE(ar.severity_filter, '__null__') = COALESCE(v.severity_filter, '__null__')
);
