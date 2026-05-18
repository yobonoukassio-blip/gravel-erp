import { Client } from 'pg';
const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();
const r1 = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename ILIKE '%rotation%' OR tablename ILIKE '%sale%')`);
console.log('Tables matching rotation/sale:'); r1.rows.forEach(r => console.log(`  ${r.tablename}`));
for (const t of ['truck_rotation', 'sale_contract']) {
  const r = await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
  if (!r.rows.length) continue;
  console.log(`\n--- ${t} ---`);
  r.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type}${row.is_nullable==='NO'?' NN':''}`));
}
await c.end();
