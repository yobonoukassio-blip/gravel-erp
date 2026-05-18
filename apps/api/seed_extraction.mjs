import { Client } from 'pg';
const TENANT = '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE   = '5213953c-3820-4da4-97ed-89bfbd605c07';
const ADMIN  = '00000000-0000-0000-0000-000000000001';
const BENCH_N1 = '22222222-2222-2222-2222-222222222201';
const BENCH_N2 = '22222222-2222-2222-2222-222222222202';
const EXC_1  = '33333333-3333-3333-3333-333333333302';
const DRIVER_1 = '44444444-4444-4444-4444-444444444402';
const DRIVER_2 = '44444444-4444-4444-4444-444444444403';
const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();
const op = await c.query(`SELECT id FROM operational_days WHERE site_id=$1 AND business_date=CURRENT_DATE LIMIT 1`, [SITE]);
const OPDAY = op.rows[0].id;
const cycles = [
  ['30000003-0000-0000-0000-000000000001', BENCH_N1, EXC_1, DRIVER_1, 'granite_brut', 145.5],
  ['30000003-0000-0000-0000-000000000002', BENCH_N1, EXC_1, DRIVER_2, 'granite_brut', 132.8],
  ['30000003-0000-0000-0000-000000000003', BENCH_N2, EXC_1, DRIVER_1, 'granite_brut', 158.2],
  ['30000003-0000-0000-0000-000000000004', BENCH_N2, EXC_1, DRIVER_2, 'granite_brut', 121.0],
];
for (const [id, bench, eq, op_user, mat, tons] of cycles) {
  const r = await c.query(`
    INSERT INTO extraction_cycle (id, tenant_id, site_id, operational_day_id, bench_id, equipment_id, operator_id, material_type, estimated_tonnage_t, cycle_started_at_local, cycle_ended_at_local, iana_timezone, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() - interval '5 hours', now() - interval '4 hours', 'Africa/Abidjan', $10)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, OPDAY, bench, eq, op_user, mat, tons, ADMIN]);
  console.log(`  ${id.slice(-3)}: ${r.rowCount}`);
}
await c.end();
console.log('Done.');
