// TIR-03 — Apply the blast_plan canonical-schema migration.
// Additive + relaxes legacy NOT NULL constraints. Idempotent, safe to re-run.
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
  'src/modules/tir/migrations/1718300000000__tir03_blast_plan_canonical.sql',
);
const sql = await readFile(sqlPath, 'utf8');

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();
console.log('Applying TIR-03 blast_plan canonical migration...');
await c.query(sql);

// Verify
const { rows } = await c.query(
  `SELECT column_name, is_nullable
     FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'blast_plan'
    ORDER BY ordinal_position`,
);
const have = new Set(rows.map((r) => r.column_name));
const required = [
  'operational_day_id', 'drilling_plan_id', 'planned_by', 'notes_md',
  'hse_approved_by', 'hse_approved_at_utc', 'loading_operator_id',
  'loading_approved_at_utc', 'fire_requested_at_utc', 'clearance_token', 'version',
];
const missing = required.filter((c) => !have.has(c));
console.log(`canonical columns present: ${required.length - missing.length}/${required.length}`);
if (missing.length) console.log(`  missing: ${missing.join(', ')}`);

const legacyRelaxed = rows
  .filter((r) => ['bench_id','label','planned_at_utc','hole_count','explosives_kg_planned','hse_clearance_status','created_by'].includes(r.column_name))
  .map((r) => `${r.column_name}=${r.is_nullable}`);
console.log(`legacy columns nullability: ${legacyRelaxed.join(', ')}`);

console.log('Done.');
await c.end();
