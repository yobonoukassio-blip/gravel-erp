// Phase 7 / FIN-R critère #5 : seed 5 alert_rule rows.
// (stockpile threshold, spare part low, HSE severity>=4, explosifs gap, fuel anomaly)
import { Client } from 'pg';
const TENANT = '24cd97f8-0170-453e-89da-e9213dd710d7';
const c = new Client({ connectionString: 'postgresql://postgres:Waliyatb123@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
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
