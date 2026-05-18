// Find tables referenced by the dashboard aggregator that lack a site_id column.
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const src = readFileSync('src/modules/production-dashboard/services/dashboard-aggregator.service.ts', 'utf8');

// Crude extract: tables that appear after FROM/JOIN in the SQL strings.
const tables = new Set();
const re = /\b(?:FROM|JOIN)\s+([a-z_][a-z_0-9]*)/gi;
let m;
while ((m = re.exec(src)) !== null) tables.add(m[1]);

console.log('Tables referenced by aggregator:', [...tables].sort().join(', '));
console.log();

for (const t of [...tables].sort()) {
  const { rows } = await c.query(
    `SELECT
       (SELECT count(*) FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=$1) AS exists,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name='site_id') AS has_site_id`,
    [t],
  );
  const r = rows[0];
  const status = r.exists === '0' || r.exists === 0
    ? 'MISSING TABLE'
    : (r.has_site_id === '0' || r.has_site_id === 0 ? 'NO site_id !!' : 'ok');
  console.log(`  ${t.padEnd(40)} ${status}`);
}

await c.end();
