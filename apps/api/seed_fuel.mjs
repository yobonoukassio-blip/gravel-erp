import { Client } from 'pg';
const TENANT_ID = '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE_ID   = '5213953c-3820-4da4-97ed-89bfbd605c07';
const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();
const tanks = [
  ['88888888-8888-8888-8888-888888888801', 'TANK-A', 'Cuve principale 20m³',  20000, 'diesel'],
  ['88888888-8888-8888-8888-888888888802', 'TANK-B', 'Cuve auxiliaire 10m³', 10000, 'diesel'],
  ['88888888-8888-8888-8888-888888888803', 'TANK-C', 'Cuve essence 5m³',      5000, 'essence'],
];
for (const [id, code, label, capacity, fuel] of tanks) {
  const r = await c.query(`
    INSERT INTO fuel_tank (id, tenant_id, site_id, code, label, capacity_liters, fuel_type, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT_ID, SITE_ID, code, label, capacity, fuel]);
  console.log(`  ${code}: ${r.rowCount} row(s)`);
}
await c.end();
console.log('Done.');
