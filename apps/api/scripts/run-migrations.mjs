#!/usr/bin/env node
// Idempotent SQL migration runner — fallback for environments where TypeORM CLI
// can't reach the DB (e.g. Supabase pooler from Railway with IPv6 quirks).
//
// Usage:
//   DATABASE_URL=postgres://... node apps/api/scripts/run-migrations.mjs
//
// Tracks applied migrations in a `_migrations` table.
// Scans:
//   - src/migrations/*.sql                 (canonical)
//   - src/modules/<module>/migrations/*.sql (per-module schema)
// All files are merged and applied in timestamp-prefixed alphabetical order
// (the prefix `1717100200000__...` keeps cross-module ordering deterministic).

import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import dns from 'node:dns';
import { Client } from 'pg';

dns.setDefaultResultOrder('ipv4first');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', 'src');
const CANONICAL_DIR = resolve(ROOT, 'migrations');
const MODULES_DIR = resolve(ROOT, 'modules');

/** Collect every `*.sql` file beneath the canonical dir and all module
 *  migration folders. Returns sorted list of `{ name, absPath }` entries.
 *  `name` is the filename only (timestamp prefix preserves ordering and
 *  uniquely identifies the migration in `_migrations`). */
async function collectMigrations() {
  const out = [];

  async function pushSqlFrom(dir) {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const f of entries) {
      if (f.endsWith('.sql')) out.push({ name: f, absPath: join(dir, f) });
    }
  }

  await pushSqlFrom(CANONICAL_DIR);

  try {
    const modules = await readdir(MODULES_DIR);
    for (const mod of modules) {
      const modDir = join(MODULES_DIR, mod, 'migrations');
      try {
        const s = await stat(modDir);
        if (s.isDirectory()) await pushSqlFrom(modDir);
      } catch {
        // module without migrations/ is fine
      }
    }
  } catch {
    // no modules dir — nothing to do
  }

  // Deduplicate by name (canonical wins over module file), then sort by name.
  const byName = new Map();
  for (const m of out) {
    if (!byName.has(m.name)) byName.set(m.name, m);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

const migrations = await collectMigrations();

const { rows: appliedRows } = await client.query('SELECT name FROM _migrations');
const applied = new Set(appliedRows.map((r) => r.name));

let okCount = 0;
let errCount = 0;
for (const { name, absPath } of migrations) {
  if (applied.has(name)) {
    console.log('SKIP', name);
    continue;
  }
  const sql = await readFile(absPath, 'utf8');
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

console.log(`\nApplied ${okCount}/${migrations.length} (errors: ${errCount}).`);
await client.end();

// In strict mode any migration failure aborts boot. Default behaviour keeps
// the API booting even if a migration errors — useful when schema drift from
// legacy ad-hoc DDL means some `CREATE TABLE` statements collide with the
// existing tables. The successful migrations still applied; the failing ones
// will be retried on the next deploy.
const strict = process.env.MIGRATE_STRICT === 'true';
if (errCount > 0 && strict) process.exit(2);
