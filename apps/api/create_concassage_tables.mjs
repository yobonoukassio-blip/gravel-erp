// Create missing concassage tables (crusher_session, screening_session) directly in Supabase.
import { Client } from 'pg';
const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();

console.log('Creating crusher_session...');
await c.query(`
  CREATE TABLE IF NOT EXISTS crusher_session (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    site_id uuid NOT NULL,
    operational_day_id uuid NOT NULL,
    crusher_id uuid NOT NULL,
    input_zone_id uuid,
    output_stockpile_id uuid NOT NULL,
    material_type varchar(40) NOT NULL,
    calibre_code varchar(20) NOT NULL,
    input_tonnage_kg numeric(12,2) NOT NULL DEFAULT 0,
    output_tonnage_kg numeric(12,2) NOT NULL DEFAULT 0,
    energy_kwh numeric(10,2) NOT NULL DEFAULT 0,
    operating_hours numeric(6,2) NOT NULL DEFAULT 0,
    performance_pct numeric(5,2) GENERATED ALWAYS AS
      (CASE WHEN input_tonnage_kg > 0 THEN (output_tonnage_kg / input_tonnage_kg) * 100 ELSE 0 END) STORED,
    session_start_utc timestamptz NOT NULL,
    session_end_utc timestamptz,
    operator_id uuid NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'ACTIVE',
    notes_md text,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    updated_at_utc timestamptz NOT NULL DEFAULT now()
  )`);
console.log('  ✓ crusher_session');

console.log('Creating screening_session...');
await c.query(`
  CREATE TABLE IF NOT EXISTS screening_session (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    site_id uuid NOT NULL,
    operational_day_id uuid NOT NULL,
    crusher_session_id uuid,
    screening_equipment_id uuid NOT NULL,
    input_tonnage_kg numeric(12,2) NOT NULL DEFAULT 0,
    output_by_calibre jsonb NOT NULL DEFAULT '{}'::jsonb,
    energy_kwh numeric(10,2) NOT NULL DEFAULT 0,
    operating_hours numeric(6,2) NOT NULL DEFAULT 0,
    session_start_utc timestamptz NOT NULL,
    session_end_utc timestamptz,
    operator_id uuid NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'ACTIVE',
    has_nonconformity boolean NOT NULL DEFAULT false,
    nonconformity_reason text,
    notes_md text,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    updated_at_utc timestamptz NOT NULL DEFAULT now()
  )`);
console.log('  ✓ screening_session');

// Seed a couple demo rows so the page isn't empty
console.log('Seeding crusher sessions...');
const SITE = '5213953c-3820-4da4-97ed-89bfbd605c07';
const TENANT = '24cd97f8-0170-453e-89da-e9213dd710d7';
const OPDAY = '60000000-0000-0000-0000-000000000016';
const STK1 = '77777777-7777-7777-7777-777777777701';
const STK2 = '77777777-7777-7777-7777-777777777702';
const ZONE_N = '11111111-1111-1111-1111-111111111101';
const OPERATOR = '44444444-4444-4444-4444-444444444401';
// Re-use a production_equipment id as crusher (any equipment will do for demo)
const CRUSHER = '33333333-3333-3333-3333-333333333302'; // Pelle Caterpillar (placeholder crusher)

const sessions = [
  ['b0000001-0000-0000-0000-000000000001', CRUSHER, ZONE_N, STK1, 'granite_brut', '0_25', 150, 138, 85, 4, 'COMPLETED'],
  ['b0000002-0000-0000-0000-000000000002', CRUSHER, ZONE_N, STK2, 'granite_brut', '25_50', 120, 115, 72, 3.5, 'COMPLETED'],
  ['b0000003-0000-0000-0000-000000000003', CRUSHER, ZONE_N, STK1, 'granite_brut', '0_25', 80, 35, 40, 2, 'ACTIVE'],
];
for (const [id, crusher, zone, stk, mat, cal, inputT, outputT, energy, hours, status] of sessions) {
  const r = await c.query(`
    INSERT INTO crusher_session (id, tenant_id, site_id, operational_day_id, crusher_id, input_zone_id, output_stockpile_id, material_type, calibre_code, input_tonnage_kg, output_tonnage_kg, energy_kwh, operating_hours, session_start_utc, session_end_utc, operator_id, status, created_at_utc, updated_at_utc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now() - interval '6 hours', ${status === 'COMPLETED' ? "now() - interval '2 hours'" : 'NULL'}, $14, $15, now(), now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, OPDAY, crusher, zone, stk, mat, cal, inputT * 1000, outputT * 1000, energy, hours, OPERATOR, status]);
  console.log(`  ${id.slice(-3)} ${status}: ${r.rowCount}`);
}

console.log('Seeding screening sessions...');
const screening = [
  ['c0000001-0000-0000-0000-000000000001', CRUSHER, 'COMPLETED', 138, { '0_25': 120, '25_50': 18 }, 45, 3.5, false],
  ['c0000002-0000-0000-0000-000000000002', CRUSHER, 'COMPLETED', 115, { '0_25': 95, '25_50': 20 }, 38, 3, false],
];
for (const [id, eq, status, inputT, outputByCal, energy, hours, nonconf] of screening) {
  const r = await c.query(`
    INSERT INTO screening_session (id, tenant_id, site_id, operational_day_id, screening_equipment_id, input_tonnage_kg, output_by_calibre, energy_kwh, operating_hours, session_start_utc, session_end_utc, operator_id, status, has_nonconformity, created_at_utc, updated_at_utc)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now() - interval '5 hours', now() - interval '1 hour', $10, $11, $12, now(), now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, OPDAY, eq, inputT * 1000, JSON.stringify(outputByCal), energy, hours, OPERATOR, status, nonconf]);
  console.log(`  ${id.slice(-3)}: ${r.rowCount}`);
}

await c.end();
console.log('Done.');
