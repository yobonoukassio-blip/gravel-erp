// Seed operational data for TODAY's operational_day so dashboards (which filter
// by "today") show real KPIs instead of zeros. Idempotent.
import { Client } from 'pg';
import { createHash } from 'node:crypto';
const md5 = (s) => createHash('md5').update(s).digest('hex');

const TENANT  = '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE    = '5213953c-3820-4da4-97ed-89bfbd605c07';
const ADMIN   = '00000000-0000-0000-0000-000000000001';
const ZONE_N  = '11111111-1111-1111-1111-111111111101';
const BENCH_N1 = '22222222-2222-2222-2222-222222222201';
const BENCH_N2 = '22222222-2222-2222-2222-222222222202';
const TRUCK_1 = '33333333-3333-3333-3333-333333333304';
const TRUCK_2 = '33333333-3333-3333-3333-333333333305';
const TRUCK_3 = '33333333-3333-3333-3333-333333333306';
const EXC_1   = '33333333-3333-3333-3333-333333333302';
const DRILL_1 = '33333333-3333-3333-3333-333333333301';
const DRIVER_1 = '44444444-4444-4444-4444-444444444402';
const DRIVER_2 = '44444444-4444-4444-4444-444444444403';
const DRIVER_3 = '44444444-4444-4444-4444-444444444405';
const SUPER_1 = '44444444-4444-4444-4444-444444444401';
const HSE_1   = '44444444-4444-4444-4444-444444444404';
const PLAN_1  = '55555555-5555-5555-5555-555555555501';
const PLAN_2  = '55555555-5555-5555-5555-555555555502';
const TANK_A  = '88888888-8888-8888-8888-888888888801';
const TANK_B  = '88888888-8888-8888-8888-888888888802';

const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();
const log = (label, r) => console.log(`  ${label}: ${r.rowCount ?? 0}`);

// ─── 1. Today's operational_day ──────────────────────────────────────────
console.log('Today opday:');
const existing = await c.query(`SELECT id FROM operational_days WHERE site_id=$1 AND business_date=CURRENT_DATE LIMIT 1`, [SITE]);
let OPDAY;
if (existing.rows.length) {
  OPDAY = existing.rows[0].id;
  console.log(`  Existing today opday: ${OPDAY}`);
} else {
  OPDAY = '60000000-0000-0000-0000-000000000016';
  log('Created today', await c.query(`
    INSERT INTO operational_days (id, tenant_id, site_id, business_date, shift_start_local, iana_timezone, started_at_utc, ended_at_utc, workforce_headcount, worked_hours)
    VALUES ($1, $2, $3, CURRENT_DATE, '06:00', 'Africa/Abidjan',
      (CURRENT_DATE || ' 06:00')::timestamp AT TIME ZONE 'Africa/Abidjan',
      (CURRENT_DATE || ' 18:00')::timestamp AT TIME ZONE 'Africa/Abidjan',
      12, 14)`, [OPDAY, TENANT, SITE]));
}

// ─── 2. Today's extraction cycles (drives tonnage KPIs) ──────────────────
console.log('Extraction cycles (today):');
const cycles = [
  ['40000004-0000-0000-0000-000000000016', BENCH_N1, EXC_1, DRIVER_1, 'granite_brut', 168.5],
  ['40000004-0000-0000-0000-000000000017', BENCH_N1, EXC_1, DRIVER_2, 'granite_brut', 142.0],
  ['40000004-0000-0000-0000-000000000018', BENCH_N2, EXC_1, DRIVER_3, 'granite_brut', 195.3],
  ['40000004-0000-0000-0000-000000000019', BENCH_N2, EXC_1, DRIVER_1, 'granite_brut', 178.7],
  ['40000004-0000-0000-0000-000000000020', BENCH_N1, EXC_1, DRIVER_2, 'granite_brut', 156.2],
];
for (const [id, bench, eq, op_user, mat, tons] of cycles) {
  log(`${tons}t`, await c.query(`
    INSERT INTO extraction_cycle (id, tenant_id, site_id, operational_day_id, bench_id, equipment_id, operator_id, material_type, estimated_tonnage_t, cycle_started_at_local, cycle_ended_at_local, iana_timezone, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() - interval '6 hours', now() - interval '5 hours', 'Africa/Abidjan', $10)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, OPDAY, bench, eq, op_user, mat, tons, ADMIN]));
}

// ─── 3. Today's weighing tickets + rotations ─────────────────────────────
console.log('Weighing tickets + rotations (today):');
const todayTickets = [
  ['51000001-0000-0000-0000-000000000016', 'WT-T-0001', 33500, 12500, TRUCK_1, DRIVER_1],
  ['51000001-0000-0000-0000-000000000017', 'WT-T-0002', 32800, 12500, TRUCK_2, DRIVER_2],
  ['51000001-0000-0000-0000-000000000018', 'WT-T-0003', 34200, 12500, TRUCK_3, DRIVER_3],
  ['51000001-0000-0000-0000-000000000019', 'WT-T-0004', 31900, 12500, TRUCK_1, DRIVER_1],
  ['51000001-0000-0000-0000-000000000020', 'WT-T-0005', 33100, 12500, TRUCK_2, DRIVER_2],
];
for (const [id, num, gross, tare, truck, driver] of todayTickets) {
  await c.query(`
    INSERT INTO weighing_ticket (id, tenant_id, site_id, ticket_number, gross_kg, tare_kg, truck_equipment_id, driver_id, material_type, weighed_at_local, iana_timezone, operational_day_id, operator_user_id, weighing_station_code, content_hash, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'granite_brut', now() - interval '2 hours', 'Africa/Abidjan', $9, $10, 'BASCULE-01', $11, $12)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, num, gross, tare, truck, driver, OPDAY, ADMIN, md5(`${num}|${gross}`), ADMIN]);
}
console.log(`  ${todayTickets.length} tickets`);

console.log('Truck rotations (today):');
for (let i = 0; i < todayTickets.length; i++) {
  const [tid, , gross, tare, truck, driver] = todayTickets[i];
  const rid = `52000002-0000-0000-0000-${String(160 + i).padStart(12, '0')}`;
  const status = i < 3 ? 'COMPLETED' : 'IN_PROGRESS';
  log(`${rid.slice(-2)} ${status}`, await c.query(`
    INSERT INTO truck_rotation (id, tenant_id, site_id, operational_day_id, truck_equipment_id, driver_id, loaded_at_bench_id, unloaded_at_zone_id, material_type, loaded_tonnage_t, weighing_ticket_id, loaded_at_utc, unloaded_at_utc, cycle_time_minutes, status, created_by, created_at_utc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'granite_brut', $9, $10, now() - interval '3 hours', ${status === 'COMPLETED' ? "now() - interval '2 hours'" : 'NULL'}, ${status === 'COMPLETED' ? '38' : 'NULL'}, $11, $12, now())
    ON CONFLICT DO NOTHING`,
    [rid, TENANT, SITE, OPDAY, truck, driver, BENCH_N1, ZONE_N, ((gross-tare)/1000).toFixed(2), tid, status, ADMIN]));
}

// ─── 4. Drilled holes (so foration shows progress) ───────────────────────
console.log('Drilled holes:');
for (let i = 0; i < 8; i++) {
  const id = `70000007-0000-0000-0000-00000000${String(i+10).padStart(4,'0')}`;
  const violation = i === 5;
  log(`Hole ${i+1}${violation ? ' (violation)' : ''}`, await c.query(`
    INSERT INTO drilled_hole (id, tenant_id, site_id, plan_id, hole_index_in_plan, actual_depth_m, actual_diameter_mm, planned_depth_m, planned_inclination_deg, inclination_deg, started_at_local, ended_at_local, iana_timezone, operational_day_id, operator_id, machine_id, tolerance_violation, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, 89, 15.0, 90, 90, now() - interval '4 hours', now() - interval '3 hours 30 minutes', 'Africa/Abidjan', $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, PLAN_1, i+1, 14.5 + (i*0.1), OPDAY, DRIVER_1, DRILL_1, violation, ADMIN]));
}

// ─── 5. HSE incidents (so HSE page has content) ──────────────────────────
console.log('HSE incidents:');
const incidents = [
  ['80000008-0000-0000-0000-000000000001', 'accident_personnel', 2, 'Coupure légère lors manipulation explosifs', 'Zone Nord — Bench N1'],
  ['80000008-0000-0000-0000-000000000002', 'near_miss',          1, 'Glissade sur pierre instable — pas de blessure', 'Zone Sud — accès bench S1'],
  ['80000008-0000-0000-0000-000000000003', 'accident_materiel',  3, 'Bris de godet pelle Komatsu PC490', 'Zone Nord — Bench N2'],
];
for (const [id, cat, sev, chrono, loc] of incidents) {
  log(cat, await c.query(`
    INSERT INTO hse_incident (id, tenant_id, site_id, occurred_at_local, iana_timezone, occurred_at_utc, operational_day_id, category, severity, reporter_user_id, location_text, chronology_md, status, prev_hash, row_hash, created_at_utc)
    VALUES ($1, $2, $3, now() - interval '6 hours', 'Africa/Abidjan', now() - interval '6 hours', $4, $5, $6, $7, $8, $9, 'open', '\\x00'::bytea, '\\x00'::bytea, now())
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, OPDAY, cat, sev, HSE_1, loc, chrono]));
}

// ─── 6. Today's refuels ──────────────────────────────────────────────────
console.log('Refuels (today):');
const refuels = [
  ['90000009-0000-0000-0000-000000000016', TANK_A, EXC_1,   DRIVER_1, 280, 4801],
  ['90000009-0000-0000-0000-000000000017', TANK_A, TRUCK_1, DRIVER_2, 165, 8910],
  ['90000009-0000-0000-0000-000000000018', TANK_B, DRILL_1, DRIVER_3, 110, 2213],
];
for (const [id, tank, eq, op_user, liters, hr] of refuels) {
  log(`${liters}L`, await c.query(`
    INSERT INTO equipment_refuel (id, tenant_id, site_id, tank_id, equipment_id, operator_id, liters, equipment_hour_meter_reading, operational_day_id, created_at_local, iana_timezone, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() - interval '5 hours', 'Africa/Abidjan', $10)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, tank, eq, op_user, liters, hr, OPDAY, ADMIN]));
}

// ─── 7. Today's shift entries ────────────────────────────────────────────
console.log('Shift entries (today):');
const employees = [DRIVER_1, DRIVER_2, DRIVER_3, HSE_1, '44444444-4444-4444-4444-444444444406', '44444444-4444-4444-4444-444444444407'];
for (let i = 0; i < employees.length; i++) {
  const id = `a0000010-0000-0000-0000-00000000001${i}`;
  log(`Entry #${i+1}`, await c.query(`
    INSERT INTO shift_entry (id, tenant_id, site_id, operational_day_id, employee_id, check_in_utc, check_out_utc, position_code, supervisor_id)
    VALUES ($1, $2, $3, $4, $5, now() - interval '8 hours', NULL, 'OPERATEUR', $6)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, OPDAY, employees[i], SUPER_1]));
}

await c.end();
console.log('\nSeed today complete.');
