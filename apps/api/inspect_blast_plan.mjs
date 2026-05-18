// Inspect live blast_plan schema to confirm gap between DB and BlastPlanService.create().
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

const { rows } = await c.query(
  `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'blast_plan'
    ORDER BY ordinal_position`,
);

console.log('blast_plan columns on prod:');
for (const r of rows) {
  console.log(`  ${r.column_name.padEnd(28)} ${r.data_type.padEnd(28)} ${r.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
}

const { rows: n } = await c.query(`SELECT COUNT(*)::int AS n FROM blast_plan`);
console.log(`\nrow count: ${n[0].n}`);

await c.end();
