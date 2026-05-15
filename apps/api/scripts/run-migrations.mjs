#!/usr/bin/env node
// Idempotent SQL migration runner — fallback for environments where TypeORM CLI
// can't reach the DB (e.g. Supabase pooler from Railway with IPv6 quirks).
//
// Usage:
//   DATABASE_URL=postgres://... node apps/api/scripts/run-migrations.mjs
//
// Tracks applied migrations in a `_migrations` table.
// Iterates *.sql files in src/migrations/ alphabetically.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dns from 'node:dns';
import { Client } from 'pg';

dns.setDefaultResultOrder('ipv4first');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '..', 'src', 'migrations');

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

const sqlFiles = (await readdir(MIGRATIONS_DIR))
  .filter((f) => f.endsWith('.sql'))
  .sort();

const { rows: appliedRows } = await client.query('SELECT name FROM _migrations');
const applied = new Set(appliedRows.map((r) => r.name));

let okCount = 0;
let errCount = 0;
for (const name of sqlFiles) {
  if (applied.has(name)) {
    console.log('SKIP', name);
    continue;
  }
  const sql = await readFile(`${MIGRATIONS_DIR}/${name}`, 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations(name) VALUES($1)', [name]);
    await client.query('COMMIT');
    console.log('  OK ', name);
    okCount++;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('  ERR', name, '→', e.message.split('\n')[0]);
    errCount++;
  }
}

console.log(`\nApplied ${okCount}/${sqlFiles.length} (errors: ${errCount}).`);
await client.end();
if (errCount > 0) process.exit(2);
