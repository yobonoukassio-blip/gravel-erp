// Phase 7 FIN-R01 — Seed analytical_entry ledger pour aujourd'hui.
// Les rows alimentent CostPerTonAggregatorService.aggregateForDate() qui lit
// par cost_center (EXT/TRA/CON/CRI). Sans ces entries le dashboard reste à 0.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const TENANT = '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE   = '5213953c-3820-4da4-97ed-89bfbd605c07';
const c = new Client({ connectionString: 'postgresql://postgres:***REDACTED_OLD_DB_PASSWORD***@db.qrkfkfhzavqjorhrlluj.supabase.co:5432/postgres' });
await c.connect();

// Cost components based on Phase 7 placeholder rates × seeded tonnages.
// Today's extraction = ~800 t (5 cycles × ~160 t/cycle).
// Today's transport  = 5 rotations × ~20 t.
// Today's crushing   = 3 sessions × ~138 t.
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const entries = [
  // Today
  { date: today,     cost_center: 'EXT', activity: 'extraction',  label: 'Coût extraction (5 cycles)',       amount: 2_000_000_00 }, // 2 000 000 XOF
  { date: today,     cost_center: 'TRA', activity: 'transport',   label: 'Coût transport (5 rotations)',    amount:   500_000_00 }, //   500 000 XOF
  { date: today,     cost_center: 'CON', activity: 'concassage',  label: 'Coût concassage (3 sessions)',    amount:   480_000_00 }, //   480 000 XOF
  { date: today,     cost_center: 'CRI', activity: 'criblage',    label: 'Coût criblage (2 sessions)',      amount:   240_000_00 }, //   240 000 XOF
  // Yesterday (so weekly/monthly KPIs aren't zero too)
  { date: yesterday, cost_center: 'EXT', activity: 'extraction',  label: 'Coût extraction (4 cycles)',       amount: 1_600_000_00 },
  { date: yesterday, cost_center: 'TRA', activity: 'transport',   label: 'Coût transport (3 rotations)',    amount:   300_000_00 },
  { date: yesterday, cost_center: 'CON', activity: 'concassage',  label: 'Coût concassage (2 sessions)',    amount:   320_000_00 },
  { date: yesterday, cost_center: 'CRI', activity: 'criblage',    label: 'Coût criblage (1 session)',       amount:   120_000_00 },
];

for (const e of entries) {
  const r = await c.query(
    `INSERT INTO analytical_entry
       (id, tenant_id, site_id, entry_date, cost_center, activity, label, amount_minor_units, currency, debit_credit, source_table, source_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'XOF', 'D', 'phase7_seed', $9, now())
     ON CONFLICT DO NOTHING`,
    [randomUUID(), TENANT, SITE, e.date, e.cost_center, e.activity, e.label, e.amount, randomUUID()],
  );
  console.log(`  ${e.date} ${e.cost_center} ${(e.amount/100).toLocaleString('fr-FR')} XOF: ${r.rowCount}`);
}

await c.end();
console.log('Done.');
