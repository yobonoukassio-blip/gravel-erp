-- Seed today's operational_day + day-shift for the Gravel Ivoire tenant on
-- Carriere Mobaye. Idempotent: ON CONFLICT DO NOTHING on (site_id, business_date).
--
-- Usage:
--   psql "$DATABASE_URL" -f apps/api/scripts/seed-operational-day-today.sql
--
-- After running, /api/dashboards/site-director stops 500'ing and the default
-- route can be flipped back from /sites to /dashboard.

\set TENANT_ID '\'24cd97f8-0170-453e-89da-e9213dd710d7\''
\set SITE_ID   '\'5213953c-3820-4da4-97ed-89bfbd605c07\''
\set OP_DAY_ID '\'88888888-8888-8888-8888-888888888801\''
\set SHIFT_ID  '\'88888888-8888-8888-8888-888888888901\''

-- Operational day = CURRENT_DATE (Africa/Abidjan), shift 06:00 local -> 18:00 local.
INSERT INTO operational_days (
  id, tenant_id, site_id, business_date,
  shift_start_local, iana_timezone,
  started_at_utc, ended_at_utc,
  workforce_headcount, worked_hours, metadata,
  created_at, updated_at
)
VALUES (
  :OP_DAY_ID, :TENANT_ID, :SITE_ID, CURRENT_DATE,
  '06:00', 'Africa/Abidjan',
  (CURRENT_DATE::timestamp + interval '6 hours')  AT TIME ZONE 'Africa/Abidjan',
  (CURRENT_DATE::timestamp + interval '18 hours') AT TIME ZONE 'Africa/Abidjan',
  42, 12.0, '{"seeded_by": "scripts/seed-operational-day-today.sql"}'::jsonb,
  now(), now()
)
ON CONFLICT (site_id, business_date) DO NOTHING;

-- Resolve the operational_day_id idempotently (may have been created earlier).
INSERT INTO shifts (
  id, tenant_id, operational_day_id, kind,
  started_at_utc, ended_at_utc, created_at, updated_at
)
SELECT
  :SHIFT_ID, :TENANT_ID, od.id, 'day',
  od.started_at_utc, od.ended_at_utc, now(), now()
FROM operational_days od
WHERE od.site_id = :SITE_ID AND od.business_date = CURRENT_DATE
ON CONFLICT DO NOTHING;

SELECT
  od.business_date, od.shift_start_local, od.iana_timezone,
  od.workforce_headcount, od.worked_hours,
  (SELECT count(*) FROM shifts s WHERE s.operational_day_id = od.id) AS shift_count
FROM operational_days od
WHERE od.site_id = :SITE_ID AND od.business_date = CURRENT_DATE;
