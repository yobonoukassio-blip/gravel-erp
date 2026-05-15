#!/usr/bin/env node
// Seed today's operational_day + day-shift for Gravel Ivoire / Carriere Mobaye.
// Idempotent on (site_id, business_date). Reactivates /api/dashboards/site-director.
//
// Usage:
//   DATABASE_URL=postgres://... node apps/api/scripts/seed-operational-day-today.mjs
//
// Overridable via env: GRAVEL_TENANT_ID, GRAVEL_SITE_ID.

import dns from 'node:dns';
import { Client } from 'pg';

dns.setDefaultResultOrder('ipv4first');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required.');
  process.exit(1);
}

const TENANT_ID  = process.env.GRAVEL_TENANT_ID ?? '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE_ID    = process.env.GRAVEL_SITE_ID   ?? '5213953c-3820-4da4-97ed-89bfbd605c07';
const OP_DAY_ID  = '88888888-8888-8888-8888-888888888801';
const SHIFT_ID   = '88888888-8888-8888-8888-888888888901';

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

const opDayInsert = await c.query(
  `INSERT INTO operational_days (
     id, tenant_id, site_id, business_date,
     shift_start_local, iana_timezone,
     started_at_utc, ended_at_utc,
     workforce_headcount, worked_hours, metadata,
     created_at, updated_at
   )
   VALUES (
     $1, $2, $3, CURRENT_DATE,
     '06:00', 'Africa/Abidjan',
     (CURRENT_DATE::timestamp + interval '6 hours')  AT TIME ZONE 'Africa/Abidjan',
     (CURRENT_DATE::timestamp + interval '18 hours') AT TIME ZONE 'Africa/Abidjan',
     42, 12.0, '{"seeded_by": "scripts/seed-operational-day-today.mjs"}'::jsonb,
     now(), now()
   )
   ON CONFLICT (site_id, business_date) DO NOTHING`,
  [OP_DAY_ID, TENANT_ID, SITE_ID],
);
console.log(`operational_days: ${opDayInsert.rowCount} row(s) inserted (0 = already exists)`);

const shiftInsert = await c.query(
  `INSERT INTO shifts (
     id, tenant_id, operational_day_id, kind,
     started_at_utc, ended_at_utc, created_at, updated_at
   )
   SELECT $1, $2, od.id, 'day', od.started_at_utc, od.ended_at_utc, now(), now()
   FROM operational_days od
   WHERE od.site_id = $3 AND od.business_date = CURRENT_DATE
   ON CONFLICT DO NOTHING`,
  [SHIFT_ID, TENANT_ID, SITE_ID],
);
console.log(`shifts:           ${shiftInsert.rowCount} row(s) inserted (0 = already exists)`);

const check = await c.query(
  `SELECT
     od.business_date,
     od.shift_start_local,
     od.iana_timezone,
     od.workforce_headcount,
     od.worked_hours,
     (SELECT count(*) FROM shifts s WHERE s.operational_day_id = od.id) AS shift_count
   FROM operational_days od
   WHERE od.site_id = $1 AND od.business_date = CURRENT_DATE`,
  [SITE_ID],
);
console.log('\nResult:');
console.table(check.rows);

await c.end();
