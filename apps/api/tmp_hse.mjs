import { Client } from 'pg';
const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();
const r = await c.query(`SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid WHERE t.typname='hse_category' ORDER BY e.enumsortorder`);
r.rows.forEach(x => console.log('  ' + x.enumlabel));
await c.end();
