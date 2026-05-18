// Seed an operational dataset for the Gravel Ivoire demo.
// Order: operational_day → contract → tickets → rotations → maintenance → HSE → alerts → refuel.
import { Client } from 'pg';
const TENANT  = '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE    = '5213953c-3820-4da4-97ed-89bfbd605c07';
const ADMIN   = '00000000-0000-0000-0000-000000000001';
const ZONE_N  = '11111111-1111-1111-1111-111111111101';
const ZONE_S  = '11111111-1111-1111-1111-111111111102';
const BENCH_N1 = '22222222-2222-2222-2222-222222222201';
const BENCH_N2 = '22222222-2222-2222-2222-222222222202';
const TRUCK_1 = '33333333-3333-3333-3333-333333333304';
const TRUCK_2 = '33333333-3333-3333-3333-333333333305';
const EXC_1   = '33333333-3333-3333-3333-333333333302';
const EXC_2   = '33333333-3333-3333-3333-333333333303';
const DRILL_1 = '33333333-3333-3333-3333-333333333301';
const DRIVER_1 = '44444444-4444-4444-4444-444444444402'; // Aminata Touré
const DRIVER_2 = '44444444-4444-4444-4444-444444444403'; // Ibrahim Coulibaly
const DRIVER_3 = '44444444-4444-4444-4444-444444444405'; // Moussa Kouamé
const SUPER_1 = '44444444-4444-4444-4444-444444444401'; // Konan Yao - chef carrière
const TANK_A  = '88888888-8888-8888-8888-888888888801';
const STK1    = '77777777-7777-7777-7777-777777777701';
const STK2    = '77777777-7777-7777-7777-777777777702';
const CUST_1  = '66666666-6666-6666-6666-666666666601'; // Bouygues
const CUST_2  = '66666666-6666-6666-6666-666666666602'; // Colas

const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();
const log = (label, r) => console.log(`  ${label}: ${r.rowCount ?? 0}`);

// ─── 1. operational_day (needed by many child tables) ────────────────────
console.log('Operational day:');
const existing = await c.query(`SELECT id FROM operational_days WHERE site_id=$1 AND business_date=CURRENT_DATE LIMIT 1`, [SITE]);
let OPDAY;
if (existing.rows.length) {
  OPDAY = existing.rows[0].id;
  console.log(`  Using existing opday ${OPDAY}`);
} else {
  OPDAY = '99999999-9999-9999-9999-999999999901';
  log('Today', await c.query(`
    INSERT INTO operational_days
      (id, tenant_id, site_id, business_date, shift_start_local, iana_timezone, started_at_utc, ended_at_utc, created_at, updated_at, workforce_headcount, worked_hours)
    VALUES ($1,$2,$3, CURRENT_DATE, '06:00', 'Africa/Abidjan',
      (CURRENT_DATE || ' 06:00')::timestamp AT TIME ZONE 'Africa/Abidjan',
      (CURRENT_DATE || ' 18:00')::timestamp AT TIME ZONE 'Africa/Abidjan',
      now(), now(), 8, 12)`, [OPDAY, TENANT, SITE]));
}

// ─── 2. sale_contract (parent of bon_de_livraison) ───────────────────────
console.log('Sale contracts:');
const CONTRACT_1 = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaa01';
const CONTRACT_2 = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaa02';
log('CT-2026-001', await c.query(`
  INSERT INTO sale_contract (id, tenant_id, customer_id, reference, calibre_code, unit_price_minor_units, currency, planned_tonnage_t, period_from, period_to, authorized_transporter_ids, is_export)
  VALUES ($1, $2, $3, 'CT-2026-001', '0_25', 18000, 'XOF', 5000, CURRENT_DATE - 30, CURRENT_DATE + 60, '{}', false)
  ON CONFLICT (id) DO NOTHING`, [CONTRACT_1, TENANT, CUST_1]));
log('CT-2026-002', await c.query(`
  INSERT INTO sale_contract (id, tenant_id, customer_id, reference, calibre_code, unit_price_minor_units, currency, planned_tonnage_t, period_from, period_to, authorized_transporter_ids, is_export)
  VALUES ($1, $2, $3, 'CT-2026-002', '25_50', 22000, 'XOF', 3000, CURRENT_DATE - 15, CURRENT_DATE + 90, '{}', false)
  ON CONFLICT (id) DO NOTHING`, [CONTRACT_2, TENANT, CUST_2]));

// ─── 3. weighing_tickets (parent of truck_rotation + bon_de_livraison) ───
console.log('Weighing tickets:');
import('node:crypto').then(); // pre-import for md5
const { createHash } = await import('node:crypto');
const md5 = (s) => createHash('md5').update(s).digest('hex');
const tickets = [
  ['bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'WT-2026-0001', 32500, 12500, 20000, TRUCK_1, DRIVER_1, 'granite_brut'],
  ['bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'WT-2026-0002', 31200, 12500, 18700, TRUCK_2, DRIVER_2, 'granite_brut'],
  ['bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbb03', 'WT-2026-0003', 33800, 12500, 21300, TRUCK_1, DRIVER_3, 'granite_brut'],
];
for (const [id, num, gross, tare, net, truck, driver, mat] of tickets) {
  log(num, await c.query(`
    INSERT INTO weighing_ticket (id, tenant_id, site_id, ticket_number, gross_kg, tare_kg, truck_equipment_id, driver_id, material_type, weighed_at_local, iana_timezone, operational_day_id, operator_user_id, weighing_station_code, content_hash, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() - interval '2 hours', 'Africa/Abidjan', $10, $11, 'BASCULE-01', $13, $12)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, num, gross, tare, truck, driver, mat, OPDAY, ADMIN, ADMIN, md5(`${num}|${gross}`)]));
}

// ─── 4. truck_rotation ───────────────────────────────────────────────────
console.log('Truck rotations:');
for (let i = 0; i < tickets.length; i++) {
  const [tid, , , , net, truck, driver, mat] = tickets[i];
  const rid = `cccc1111-cccc-cccc-cccc-ccccccccc${String(i+1).padStart(3,'0')}`;
  log(`Rotation #${i+1}`, await c.query(`
    INSERT INTO truck_rotation (id, tenant_id, site_id, operational_day_id, truck_equipment_id, driver_id, loaded_at_bench_id, unloaded_at_zone_id, material_type, loaded_tonnage_t, weighing_ticket_id, loaded_at_utc, unloaded_at_utc, cycle_time_minutes, status, created_by, created_at_utc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() - interval '3 hours', now() - interval '2 hours 25 minutes', 35, 'COMPLETED', $12, now())
    ON CONFLICT (id) DO NOTHING`,
    [rid, TENANT, SITE, OPDAY, truck, driver, BENCH_N1, ZONE_N, mat, (net/1000).toFixed(2), tid, ADMIN]));
}

// ─── 5. bon_de_livraison ─────────────────────────────────────────────────
console.log('BLs:');
const bls = [
  ['dddd1111-dddd-dddd-dddd-dddddddddd01', 'BL-2026-0042', CUST_1, CONTRACT_1, '0_25', 20000, 'signed'],
  ['dddd1111-dddd-dddd-dddd-dddddddddd02', 'BL-2026-0043', CUST_1, CONTRACT_1, '0_25', 18700, 'signed'],
  ['dddd1111-dddd-dddd-dddd-dddddddddd03', 'BL-2026-0044', CUST_2, CONTRACT_2, '25_50', 21300, 'draft'],
];
for (const [id, num, cust, contract, cal, kg, status] of bls) {
  log(num, await c.query(`
    INSERT INTO bon_de_livraison (id, tenant_id, site_id, number, customer_id, sale_contract_id, stockpile_id, calibre_code, tonnage_kg, delivery_date, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, num, cust, contract, cal === '0_25' ? STK1 : STK2, cal, kg, status]));
}

// ─── 6. work_order ───────────────────────────────────────────────────────
console.log('Work orders:');
const wos = [
  ['eeee1111-eeee-eeee-eeee-eeeeeeeeee01', EXC_1, 'corrective', 'open',       'Vibration anormale moteur',      0,   0],
  ['eeee1111-eeee-eeee-eeee-eeeeeeeeee02', EXC_2, 'preventive', 'in_progress','Maintenance 500h',                240, 8],
  ['eeee1111-eeee-eeee-eeee-eeeeeeeeee03', DRILL_1,'corrective','closed',     'Remplacement taillant', 120, 4],
  ['eeee1111-eeee-eeee-eeee-eeeeeeeeee04', TRUCK_1,'corrective','open',       'Fuite hydraulique benne', 0, 0],
];
for (const [id, eq, type, status, diag, dt, lh] of wos) {
  log(diag, await c.query(`
    INSERT INTO work_order (id, tenant_id, site_id, equipment_id, type, status, diagnosis, technician_id, downtime_minutes, labor_hours, opened_at_utc, closed_at_utc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() - interval '6 hours', ${status === 'closed' ? "now() - interval '1 hour'" : 'NULL'})
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, eq, type, status, diag, ADMIN, dt, lh]));
}

// ─── 7. alerts ───────────────────────────────────────────────────────────
console.log('Alerts:');
const alerts = [
  ['ffff1111-ffff-ffff-ffff-ffffffffff01', 'STOCKPILE_LOW',     'high',   'Stockpile 0/25 sous seuil critique (12 t)'],
  ['ffff1111-ffff-ffff-ffff-ffffffffff02', 'EQUIPMENT_DOWN',    'high',   'Pelle Komatsu PC490 en maintenance'],
  ['ffff1111-ffff-ffff-ffff-ffffffffff03', 'FUEL_TANK_LOW',     'medium', 'TANK-B sous 30% — réapprovisionnement requis'],
  ['ffff1111-ffff-ffff-ffff-ffffffffff04', 'TF_THRESHOLD_HIGH', 'medium', 'Taux fréquence rolling 12m proche de seuil'],
];
for (const [id, type, sev, msg] of alerts) {
  log(type, await c.query(`
    INSERT INTO alert (id, tenant_id, site_id, source_event_type, severity, status, payload)
    VALUES ($1, $2, $3, $4, $5, 'open', $6::jsonb)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, type, sev, JSON.stringify({ message: msg, level: sev })]));
}

// ─── 8. equipment_refuel ─────────────────────────────────────────────────
console.log('Refuels:');
const refuels = [
  ['10000001-0000-0000-0000-000000000001', TANK_A, EXC_1,   DRIVER_1, 320, 4521],
  ['10000001-0000-0000-0000-000000000002', TANK_A, TRUCK_1, DRIVER_2, 180, 8745],
  ['10000001-0000-0000-0000-000000000003', TANK_A, DRILL_1, DRIVER_3, 95,  2103],
];
for (const [id, tank, eq, op, liters, hr] of refuels) {
  log(id.slice(-3), await c.query(`
    INSERT INTO equipment_refuel (id, tenant_id, site_id, tank_id, equipment_id, operator_id, liters, equipment_hour_meter_reading, operational_day_id, created_at_local, iana_timezone, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() - interval '4 hours', 'Africa/Abidjan', $10)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, tank, eq, op, liters, hr, OPDAY, ADMIN]));
}

// ─── 9. shift_entry (employee check-ins for today) ───────────────────────
console.log('Shift entries:');
const employees = [DRIVER_1, DRIVER_2, DRIVER_3, '44444444-4444-4444-4444-444444444404','44444444-4444-4444-4444-444444444406', '44444444-4444-4444-4444-444444444407'];
for (let i = 0; i < employees.length; i++) {
  const id = `20000002-0000-0000-0000-00000000000${i+1}`;
  log(`Entry #${i+1}`, await c.query(`
    INSERT INTO shift_entry (id, tenant_id, site_id, operational_day_id, employee_id, check_in_utc, check_out_utc, position_code, supervisor_id)
    VALUES ($1, $2, $3, $4, $5, now() - interval '8 hours', ${i < 4 ? 'NULL' : "now() - interval '1 hour'"}, 'OPERATEUR', $6)
    ON CONFLICT (id) DO NOTHING`,
    [id, TENANT, SITE, OPDAY, employees[i], SUPER_1]));
}

await c.end();
console.log('\nSeed operational complete.');
