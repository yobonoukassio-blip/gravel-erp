import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(
  `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'corrective_action'
    ORDER BY ordinal_position`,
);
console.log('corrective_action columns:');
rows.forEach(r => console.log(`  ${r.column_name.padEnd(28)} ${r.data_type}`));
await c.end();
