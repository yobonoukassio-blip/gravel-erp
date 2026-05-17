// REQ: FIN-04 — Revenue + maintenance + fuel cost writers populate
// analytical_entry for OHADA export back-traceability. Complements
// FIN-R01 (the production cost-center coverage).
//
// Pure-unit spec: no real DB, stub DataSource.query() with route-based
// fixtures so we can assert each handler emits the right INSERT.

import { AnalyticalEntryWriterHandler } from '../event-handlers/analytical-entry-writer.handler';

type QueryCall = { sql: string; params: unknown[] };

interface FixtureLookup {
  pattern: RegExp;
  rows: unknown[];
}

function makeStubDs(lookups: FixtureLookup[]) {
  const inserts: QueryCall[] = [];
  const ds = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/INSERT INTO analytical_entry/i.test(sql)) {
        inserts.push({ sql, params });
        return [];
      }
      for (const l of lookups) {
        if (l.pattern.test(sql)) return l.rows;
      }
      return [];
    },
  };
  return { ds, inserts };
}

const TENANT = '24cd97f8-0170-453e-89da-e9213dd710d7';
const SITE = '11111111-1111-1111-1111-111111111111';

describe('AnalyticalEntryWriterHandler (FIN-04 revenue + cost)', () => {
  it('writes a CREDIT VTE entry on production.vte.bl_signed', async () => {
    const { ds, inserts } = makeStubDs([
      {
        pattern: /FROM bon_de_livraison bl/i,
        rows: [
          {
            site_id: SITE,
            unit_price_minor_units: '50000', // 50_000 XOF/tonne (centimes XOF=0 dec)
            currency: 'XOF',
            delivery_date: '2026-05-15',
          },
        ],
      },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onBlSigned({
      tenantId: TENANT,
      blId: 'bl-1',
      calibreCode: '0-31',
      tonnageKg: '24500', // 24.5 tonnes
      signedAtUtc: '2026-05-15T08:00:00Z',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/'VTE'/);
    expect(inserts[0].sql).toMatch(/'C'/); // credit
    expect(inserts[0].sql).toMatch(/'bon_de_livraison'/);
    // 24500 g × 50000 / 1_000_000 = 1_225_000 minor units
    expect(inserts[0].params[4]).toBe('1225000');
    expect(inserts[0].params[5]).toBe('XOF');
    expect(inserts[0].params[6]).toBe('bl-1');
  });

  it('writes a DEBIT MNT entry on maintenance.work_order.closed (amount=0 until FIN-07)', async () => {
    const { ds, inserts } = makeStubDs([]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onWorkOrderClosed({
      tenantId: TENANT,
      workOrderId: 'wo-1',
      siteId: SITE,
      laborHours: '3.5',
      closedAtUtc: '2026-05-15T17:30:00Z',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/'MNT'/);
    expect(inserts[0].sql).toMatch(/'D'/); // debit
    expect(inserts[0].sql).toMatch(/'work_order'/);
    // 3.5 h × 4000 XOF/h = 14_000 XOF = 1_400_000 centimes
    expect(inserts[0].params[4]).toBe('1400000');
    expect(inserts[0].params[3]).toMatch(/3.5h/);
    expect(inserts[0].params[2]).toBe('2026-05-15');
  });

  it('writes a DEBIT CAR entry on production.fuel.refuel_appended', async () => {
    const { ds, inserts } = makeStubDs([
      {
        pattern: /FROM equipment_fuel_consumption efc/i,
        rows: [
          {
            cost_per_liter_minor_units: '750', // 750 XOF/L
            currency: 'XOF',
            op_business_date: '2026-05-15',
          },
        ],
      },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onFuelRefuelAppended({
      tenantId: TENANT,
      siteId: SITE,
      tankId: 'tank-1',
      equipmentId: 'eq-1',
      refuelId: 'rf-1',
      liters: 120.5,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/'CAR'/);
    expect(inserts[0].sql).toMatch(/'D'/);
    expect(inserts[0].sql).toMatch(/'equipment_refuel'/);
    // 120.5 L × 750 XOF/L = 90_375 XOF
    expect(inserts[0].params[4]).toBe('90375');
    expect(inserts[0].params[5]).toBe('XOF');
    expect(inserts[0].params[2]).toBe('2026-05-15');
  });

  it('writes a CAR entry with amount=0 if no cost_per_liter is known yet', async () => {
    const { ds, inserts } = makeStubDs([
      {
        pattern: /FROM equipment_fuel_consumption efc/i,
        rows: [
          {
            cost_per_liter_minor_units: null,
            currency: null,
            op_business_date: '2026-05-15',
          },
        ],
      },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onFuelRefuelAppended({
      tenantId: TENANT,
      siteId: SITE,
      tankId: 'tank-1',
      equipmentId: 'eq-1',
      refuelId: 'rf-2',
      liters: 50,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[4]).toBe('0');
    expect(inserts[0].params[5]).toBe('XOF'); // fallback currency
  });

  it('skips CAR entry write when consumption row is not yet present (race)', async () => {
    const { ds, inserts } = makeStubDs([
      { pattern: /FROM equipment_fuel_consumption efc/i, rows: [] },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onFuelRefuelAppended({
      tenantId: TENANT,
      siteId: SITE,
      tankId: 'tank-1',
      equipmentId: 'eq-1',
      refuelId: 'rf-missing',
      liters: 100,
    });

    expect(inserts).toHaveLength(0);
  });

  it('rethrows BL handler errors so EventEmitter2 retry path can handle them (SF-001)', async () => {
    const ds = {
      query: async (sql: string) => {
        if (/INSERT INTO analytical_entry/i.test(sql)) {
          throw new Error('synthetic insert failure');
        }
        return [
          {
            site_id: SITE,
            unit_price_minor_units: '50000',
            currency: 'XOF',
            delivery_date: '2026-05-15',
          },
        ];
      },
    };
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    // Post-SF-001 (audit 2026-05-16): handler MUST rethrow so the outbox
    // worker can retry. Previous swallow caused silent ledger drops.
    await expect(
      handler.onBlSigned({
        tenantId: TENANT,
        blId: 'bl-err',
        calibreCode: '0-31',
        tonnageKg: '10000',
        signedAtUtc: '2026-05-15T08:00:00Z',
      }),
    ).rejects.toThrow(/synthetic insert failure/);
  });
});
