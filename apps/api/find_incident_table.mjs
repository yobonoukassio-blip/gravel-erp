import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name ~* 'incident'
    ORDER BY table_name`,
);
console.log('Tables matching /incident/i:', rows.map(r => r.table_name));

if (rows.length) {
  const t = rows[0].table_name;
  const { rows: cols } = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
        AND column_name IN ('site_id', 'id')`,
    [t],
  );
  console.log(`${t} columns:`, cols.map(r => r.column_name));
}
await c.end();
