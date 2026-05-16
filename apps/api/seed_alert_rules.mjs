// Phase 7 / FIN-R critère #5 : seed 5 alert_rule rows.
// (stockpile threshold, spare part low, HSE severity>=4, explosifs gap, fuel anomaly)
//
// P0-2 (audit 2026-05-16): no hardcoded credentials. Run with the same
// DATABASE_URL the API uses:
//   $env:DATABASE_URL = (Get-Content apps/api/.env | Select-String DATABASE_URL).Line.Split('=', 2)[1]
//   node apps/api/seed_alert_rules.mjs
// or POSIX:
//   set -a; source apps/api/.env; set +a; node apps/api/seed_alert_rules.mjs
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Source apps/api/.env first.');
  process.exit(1);
}

const TENANT = process.env.SEED_TENANT_ID;
if (!TENANT) {
  console.error('SEED_TENANT_ID must be set (target tenant uuid).');
  process.exit(1);
}

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

const rules = [
  {
    id: '11111111-aaaa-bbbb-cccc-000000000001',
    event_type: 'stockpile.threshold.crossed',
    severity_filter: 'warning',
    channels: ['email', 'in_app'],
    role_codes: ['DIRECTEUR_SITE', 'CHEF_CARRIERE'],
  },
  {
    id: '11111111-aaaa-bbbb-cccc-000000000002',
    event_type: 'maintenance.spare_part.threshold_crossed',
    severity_filter: 'warning',
    channels: ['email', 'in_app'],
    role_codes: ['MAINTENANCE'],
  },
  {
    id: '11111111-aaaa-bbbb-cccc-000000000003',
    event_type: 'hse.incident.high_severity',
    severity_filter: 'critical',
    channels: ['email', 'sms', 'in_app'],
    role_codes: ['DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'HSE'],
  },
  {
    id: '11111111-aaaa-bbbb-cccc-000000000004',
    event_type: 'tir.explosives.inventory_gap',
    severity_filter: 'critical',
    channels: ['email', 'in_app'],
    role_codes: ['HSE', 'DIRECTEUR_SITE'],
  },
  {
    id: '11111111-aaaa-bbbb-cccc-000000000005',
    event_type: 'fuel.tank.anomaly',
    severity_filter: 'warning',
    channels: ['email', 'in_app'],
    role_codes: ['DIRECTEUR_SITE', 'CHEF_CARRIERE'],
  },
];

for (const r of rules) {
  const res = await c.query(
    `INSERT INTO alert_rule (id, tenant_id, event_type, severity_filter, channels, role_codes, user_ids, is_active)
     VALUES ($1, $2, $3, $4::alert_rule_severity_filter_enum, $5::text[], $6::text[], $7::uuid[], true)
     ON CONFLICT (id) DO NOTHING`,
    [r.id, TENANT, r.event_type, r.severity_filter, r.channels, r.role_codes, []],
  );
  console.log(`  ${r.event_type}: ${res.rowCount}`);
}

await c.end();
console.log('Done.');
