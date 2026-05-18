// Verify FND-07 migration landed: check columns on analytical_entry and fx_rate table.
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

const expectedCols = [
  'amount_original_minor',
  'amount_site_functional_minor',
  'amount_group_minor',
  'site_currency',
  'group_currency',
  'fx_rate_id',
];

for (const table of ['analytical_entry', 'bon_de_livraison', 'invoice']) {
  const { rows } = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1`,
    [table],
  );
  const have = new Set(rows.map((r) => r.column_name));
  const present = expectedCols.filter((c) => have.has(c));
  const missing = expectedCols.filter((c) => !have.has(c));
  console.log(`[${table}] present=${present.length}/${expectedCols.length} missing=${JSON.stringify(missing)}`);
}

const { rows: fx } = await c.query(
  `SELECT to_regclass('public.fx_rate') AS exists`,
);
console.log(`[fx_rate] table exists: ${fx[0].exists !== null}`);

const { rows: ae } = await c.query(
  `SELECT COUNT(*)::int AS n,
          COUNT(amount_original_minor)::int AS backfilled
     FROM analytical_entry`,
);
console.log(`[analytical_entry] rows=${ae[0].n} backfilled=${ae[0].backfilled}`);

await c.end();
