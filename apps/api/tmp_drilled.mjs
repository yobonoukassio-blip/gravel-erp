import { Client } from 'pg';
const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();
const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='drilled_hole' ORDER BY ordinal_position`);
console.log('drilled_hole cols:', r.rows.map(x=>x.column_name).join(', '));
await c.end();
