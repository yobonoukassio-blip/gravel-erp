// Phase 3 / TIR — Create missing explosives_event + blast_plan tables.
// Tables absentes confirmées par audit (2026-05-16).
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres';
const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

console.log('Creating explosives_event...');
await c.query(`
  CREATE TABLE IF NOT EXISTS explosives_event (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    site_id uuid NOT NULL,
    occurred_at_utc timestamptz NOT NULL,
    event_type varchar(40) NOT NULL,
    product_type varchar(40) NOT NULL,
    quantity_g bigint NOT NULL,
    doc_reference varchar(200),
    pdf_sha256 varchar(64),
    operational_day_id uuid,
    created_by uuid NOT NULL,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    prev_hash bytea NOT NULL DEFAULT '\\x00'::bytea,
    row_hash bytea NOT NULL DEFAULT '\\x00'::bytea
  )`);
await c.query(`CREATE INDEX IF NOT EXISTS idx_explosives_event_tenant_site ON explosives_event (tenant_id, site_id)`);
console.log('  ✓ explosives_event');

console.log('Creating blast_plan...');
await c.query(`
  CREATE TABLE IF NOT EXISTS blast_plan (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    site_id uuid NOT NULL,
    bench_id uuid NOT NULL,
    label varchar(200) NOT NULL,
    planned_at_utc timestamptz NOT NULL,
    hole_count integer NOT NULL,
    explosives_kg_planned numeric(10,2) NOT NULL DEFAULT 0,
    status varchar(20) NOT NULL DEFAULT 'draft',
    hse_clearance_status varchar(20) NOT NULL DEFAULT 'pending',
    fired_at_utc timestamptz,
    fired_by uuid,
    notes text,
    created_by uuid NOT NULL,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    updated_at_utc timestamptz NOT NULL DEFAULT now()
  )`);
console.log('  ✓ blast_plan');

// Seed quelques events + plans pour que les pages affichent du contenu
const TENANT = '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE   = '5213953c-3820-4da4-97ed-89bfbd605c07';
const ADMIN  = '00000000-0000-0000-0000-000000000001';
const BENCH_N1 = '22222222-2222-2222-2222-222222222201';
const OPDAY  = '60000000-0000-0000-0000-000000000016';

console.log('Seeding explosives_event...');
const events = [
  ['d0000001-0000-0000-0000-000000000001', 'EXPLOSIVES_IN',         'ANFO',      50_000_000n, 'BL-EXP-2026-001', '5 sacs 1t ANFO'],
  ['d0000001-0000-0000-0000-000000000002', 'EXPLOSIVES_IN',         'EMULSION',  20_000_000n, 'BL-EXP-2026-002', '20 cartouches 1kg émulsion'],
  ['d0000001-0000-0000-0000-000000000003', 'EXPLOSIVES_IN',         'DETONATEUR',     500n,    'BL-DET-2026-003', '500 détonateurs électriques'],
  ['d0000001-0000-0000-0000-000000000004', 'EXPLOSIVES_OUT_LOAD',   'ANFO',     -15_000_000n, 'BP-2026-001',     'Sortie pour plan tir B-N1'],
  ['d0000001-0000-0000-0000-000000000005', 'EXPLOSIVES_OUT_LOAD',   'DETONATEUR',    -150n,    'BP-2026-001',     'Sortie 150 détonateurs'],
];
for (const [id, type, product, qty, doc, notes] of events) {
  const r = await c.query(`
    INSERT INTO explosives_event (id, tenant_id, site_id, occurred_at_utc, event_type, product_type, quantity_g, doc_reference, operational_day_id, created_by)
    VALUES ($1, $2, $3, now() - interval '6 hours', $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, type, product, qty, doc, OPDAY, ADMIN]);
  console.log(`  ${type} ${product}: ${r.rowCount}`);
}

console.log('Seeding blast_plan...');
const plans = [
  ['e0000001-0000-0000-0000-000000000001', 'BP-2026-001 — Bench Nord 1', 'fired',    24, 1200.0, 'cleared'],
  ['e0000001-0000-0000-0000-000000000002', 'BP-2026-002 — Bench Nord 2', 'planned',  18,  900.0, 'pending'],
];
for (const [id, label, status, holes, kg, hse] of plans) {
  const r = await c.query(`
    INSERT INTO blast_plan (id, tenant_id, site_id, bench_id, label, planned_at_utc, hole_count, explosives_kg_planned, status, hse_clearance_status, fired_at_utc, fired_by, created_by)
    VALUES ($1, $2, $3, $4, $5, now() + interval '2 hours', $6, $7, $8, $9, ${status === 'fired' ? "now() - interval '8 hours'" : 'NULL'}, ${status === 'fired' ? '$10' : 'NULL'}, $10)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, BENCH_N1, label, holes, kg, status, hse, ADMIN]);
  console.log(`  ${label}: ${r.rowCount}`);
}

await c.end();
console.log('Done.');
