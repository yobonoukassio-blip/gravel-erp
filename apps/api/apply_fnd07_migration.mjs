// FND-07 — Apply the 3-representation money migration to the live DB.
// Idempotent and additive (ADD COLUMN IF NOT EXISTS). Safe to re-run.
//
// Run with:
//   $env:DATABASE_URL = (Get-Content apps/api/.env | Select-String DATABASE_URL).Line.Split('=', 2)[1]
//   node apps/api/apply_fnd07_migration.mjs
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  __dirname,
  'src/modules/analytics/migrations/1718200000000__fnd07_three_rep_money.sql',
);
const sql = await readFile(sqlPath, 'utf8');

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();
console.log('Applying FND-07 migration...');
await c.query(sql);
console.log('Done.');
await c.end();
