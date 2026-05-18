// NTF-04 — Apply notification table migration to prod DB.
// Additive + idempotent. Safe to re-run.
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
  'src/modules/notification/migrations/1718500000000__create_notification.sql',
);
const sql = await readFile(sqlPath, 'utf8');

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();
console.log('Applying notification table migration...');
await c.query(sql);

const { rows } = await c.query(
  `SELECT to_regclass('public.notification') AS exists`,
);
console.log(`notification table exists: ${rows[0].exists !== null}`);
console.log('Done.');
await c.end();
