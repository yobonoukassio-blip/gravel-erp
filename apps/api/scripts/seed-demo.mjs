#!/usr/bin/env node
// Seed demo data for the Gravel Ivoire tenant on Carriere Mobaye.
// Idempotent: uses ON CONFLICT DO NOTHING on natural keys.
//
// Usage:
//   DATABASE_URL=postgres://... node apps/api/scripts/seed-demo.mjs
//
// Override tenant/site/admin via env if seeding into a non-default workspace:
//   GRAVEL_TENANT_ID=... GRAVEL_SITE_ID=... GRAVEL_ADMIN_ID=... DATABASE_URL=... node ...

import dns from 'node:dns';
import { Client } from 'pg';

dns.setDefaultResultOrder('ipv4first'); // Supabase pooler: IPv6 routes flaky from some networks

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required (e.g. postgres://user:pass@host:port/db).');
  process.exit(1);
}

const TENANT_ID = process.env.GRAVEL_TENANT_ID ?? '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE_ID   = process.env.GRAVEL_SITE_ID   ?? '5213953c-3820-4da4-97ed-89bfbd605c07';
const ADMIN_ID  = process.env.GRAVEL_ADMIN_ID  ?? '00000000-0000-0000-0000-000000000001';

const c = new Client({ connectionString: DATABASE_URL });
await c.connect();

const log = (label, r) => console.log(`  ${label}: ${r.rowCount ?? 0} row(s)`);

// --- Zones ---------------------------------------------------------------
console.log('Zones:');
const zoneNord = '11111111-1111-1111-1111-111111111101';
const zoneSud  = '11111111-1111-1111-1111-111111111102';
log('Zone Nord', await c.query(`
  INSERT INTO production_zones (id, tenant_id, site_id, code, name, geometry, status, created_at, updated_at)
  VALUES ($1, $2, $3, 'ZN', 'Zone Nord',
    ST_GeomFromText('POLYGON((-4.030 5.350, -4.020 5.350, -4.020 5.340, -4.030 5.340, -4.030 5.350))', 4326),
    'active', now(), now())
  ON CONFLICT (id) DO NOTHING`, [zoneNord, TENANT_ID, SITE_ID]));
log('Zone Sud', await c.query(`
  INSERT INTO production_zones (id, tenant_id, site_id, code, name, geometry, status, created_at, updated_at)
  VALUES ($1, $2, $3, 'ZS', 'Zone Sud',
    ST_GeomFromText('POLYGON((-4.030 5.340, -4.020 5.340, -4.020 5.330, -4.030 5.330, -4.030 5.340))', 4326),
    'active', now(), now())
  ON CONFLICT (id) DO NOTHING`, [zoneSud, TENANT_ID, SITE_ID]));

// --- Benches -------------------------------------------------------------
console.log('Benches:');
const benches = [
  ['22222222-2222-2222-2222-222222222201', zoneNord, 'B-N1', 'Bench N1', 145],
  ['22222222-2222-2222-2222-222222222202', zoneNord, 'B-N2', 'Bench N2', 140],
  ['22222222-2222-2222-2222-222222222203', zoneSud,  'B-S1', 'Bench S1', 138],
];
for (const [id, zid, code, name, elev] of benches) {
  log(code, await c.query(`
    INSERT INTO benches (id, tenant_id, production_zone_id, code, name, geometry, elevation_m, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, ST_GeomFromText('POLYGON((-4.029 5.349, -4.021 5.349, -4.021 5.341, -4.029 5.341, -4.029 5.349))', 4326), $6, 'active', now(), now())
    ON CONFLICT (id) DO NOTHING`, [id, TENANT_ID, zid, code, name, elev]));
}

// --- Equipment -----------------------------------------------------------
console.log('Equipment:');
const equips = [
  ['33333333-3333-3333-3333-333333333301', 'DRL-01', 'Foreuse Atlas Copco D65',  'drill',     'active'],
  ['33333333-3333-3333-3333-333333333302', 'EXC-01', 'Pelle Caterpillar 390F',   'excavator', 'active'],
  ['33333333-3333-3333-3333-333333333303', 'EXC-02', 'Pelle Komatsu PC490',      'excavator', 'maintenance'],
  ['33333333-3333-3333-3333-333333333304', 'TRK-01', 'Camion Volvo FMX 6x4',     'truck',     'active'],
  ['33333333-3333-3333-3333-333333333305', 'TRK-02', 'Camion Scania G450 8x4',   'truck',     'active'],
  ['33333333-3333-3333-3333-333333333306', 'TRK-03', 'Camion Renault Kerax',     'truck',     'active'],
  ['33333333-3333-3333-3333-333333333307', 'GEN-01', 'Groupe electrogene 250kVA','generator', 'active'],
];
for (const [id, code, label, type, status] of equips) {
  log(code, await c.query(`
    INSERT INTO production_equipment (id, tenant_id, site_id, code, label, type, status, specs, is_out_of_service, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8, now(), now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT_ID, SITE_ID, code, label, type, status, status === 'out_of_service']));
}

// --- Employees -----------------------------------------------------------
console.log('Employees:');
const emps = [
  ['44444444-4444-4444-4444-444444444401', 'Konan',     'Yao',       'EMP-001', 'CDI',  'CHEF_CARRIERE'],
  ['44444444-4444-4444-4444-444444444402', 'Aminata',   'Toure',     'EMP-002', 'CDI',  'OPERATEUR'],
  ['44444444-4444-4444-4444-444444444403', 'Ibrahim',   'Coulibaly', 'EMP-003', 'CDI',  'OPERATEUR'],
  ['44444444-4444-4444-4444-444444444404', 'Fatou',     'Diallo',    'EMP-004', 'CDI',  'HSE'],
  ['44444444-4444-4444-4444-444444444405', 'Moussa',    'Kouame',    'EMP-005', 'CDI',  'OPERATEUR'],
  ['44444444-4444-4444-4444-444444444406', 'Awa',       'Bamba',     'EMP-006', 'CDD',  'MAINTENANCE'],
  ['44444444-4444-4444-4444-444444444407', 'Sekou',     'Traore',    'EMP-007', 'CDI',  'OPERATEUR'],
  ['44444444-4444-4444-4444-444444444408', 'Mariam',    'Sangare',   'EMP-008', 'CDI',  'FINANCE'],
];
for (const [id, fn, ln, num, ct, role] of emps) {
  log(num, await c.query(`
    INSERT INTO employee (id, tenant_id, site_id, first_name, last_name, employee_number, contract_type, role_code, is_active, hired_date, created_at_utc, updated_at_utc, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, '2024-01-15', now(), now(), $9)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT_ID, SITE_ID, fn, ln, num, ct, role, ADMIN_ID]));
}

// --- Drilling plans ------------------------------------------------------
console.log('Drilling plans:');
const plans = [
  ['55555555-5555-5555-5555-555555555501', benches[0][0], 24, 'active', 'Plan tir B-N1 - sept 2026'],
  ['55555555-5555-5555-5555-555555555502', benches[1][0], 18, 'active', 'Plan tir B-N2 - sept 2026'],
  ['55555555-5555-5555-5555-555555555503', benches[2][0], 30, 'draft',  'Plan tir B-S1 - preparation'],
];
for (const [id, benchId, holes, status, label] of plans) {
  log(label, await c.query(`
    INSERT INTO drilling_plan (id, tenant_id, site_id, zone_id, bench_id, planned_hole_count, target_depth_m, diameter_mm, valid_from, status, created_by, created_at, updated_at)
    VALUES ($1, $2, $3,
      (SELECT production_zone_id FROM benches WHERE id=$4),
      $4, $5, 15.0, 89, now() - interval '5 days', $6, $7, now(), now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT_ID, SITE_ID, benchId, holes, status, ADMIN_ID]));
}

// --- Customers -----------------------------------------------------------
console.log('Customers:');
const customers = [
  ['66666666-6666-6666-6666-666666666601', 'BTP-CI',   "Bouygues Travaux Publics Cote d'Ivoire"],
  ['66666666-6666-6666-6666-666666666602', 'COLAS-CI', 'Colas Afrique'],
  ['66666666-6666-6666-6666-666666666603', 'SETAO',    'SETAO BTP'],
];
for (const [id, code, name] of customers) {
  log(code, await c.query(`
    INSERT INTO customer (id, tenant_id, code, name, default_currency, payment_terms_days, contacts, is_active, created_at)
    VALUES ($1, $2, $3, $4, 'XOF', 30, '[]'::jsonb, true, now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT_ID, code, name]));
}

// --- Stockpiles ----------------------------------------------------------
console.log('Stockpiles:');
const piles = [
  ['77777777-7777-7777-7777-777777777701', zoneNord, 'STK-0-25',   '0/25 mm - Tout-venant',     '0_25'],
  ['77777777-7777-7777-7777-777777777702', zoneNord, 'STK-25-50',  '25/50 mm - Empierrement', '25_50'],
  ['77777777-7777-7777-7777-777777777703', zoneSud,  'STK-5-15',   '5/15 mm - Beton',          '5_15'],
];
for (const [id, zid, code, label, cal] of piles) {
  log(code, await c.query(`
    INSERT INTO stockpile (id, tenant_id, site_id, zone_id, code, label, default_calibre_code, is_active, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT_ID, SITE_ID, zid, code, label, cal]));
}

await c.end();
console.log('\nDone.');
