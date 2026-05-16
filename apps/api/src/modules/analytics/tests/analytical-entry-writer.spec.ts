// REQ: FIN-R01 — Cost-component writers append analytical_entry rows for
// extraction, transport, concassage, criblage domain events.
//
// Pure-unit spec: no real DB. Stubs DataSource.query() with route-based
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

describe('AnalyticalEntryWriterHandler (FIN-R01)', () => {
  it('writes a DEBIT EXT entry on production.extraction.cycle_recorded', async () => {
    const { ds, inserts } = makeStubDs([
      {
        pattern: /FROM extraction_cycle ec/i,
        rows: [
          {
            business_date: '2026-05-15',
            cycle_started_at_local: '2026-05-15T06:00:00.000Z',
            cycle_ended_at_local: '2026-05-15T08:00:00.000Z',
            downtime_minutes: 0,
          },
        ],
      },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onExtractionCycleRecorded({
      tenantId: TENANT,
      siteId: SITE,
      cycleId: 'cyc-1',
      operationalDayId: 'od-1',
      equipmentId: 'eq-1',
      operatorId: 'op-1',
      materialType: 'granite_brut',
      estimatedTonnageT: 12,
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/'EXT'/);
    expect(inserts[0].sql).toMatch(/'extraction_cycle'/);
    // 2h * 3500 XOF/h = 7000 XOF = 700_000 centimes
    expect(inserts[0].params[4]).toBe('700000');
    expect(inserts[0].params[2]).toBe('2026-05-15');
  });

  it('writes a DEBIT TRA entry on production.transport.rotation_completed', async () => {
    const { ds, inserts } = makeStubDs([
      { pattern: /FROM operational_days WHERE id/i, rows: [{ business_date: '2026-05-15' }] },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onRotationCompleted({
      tenant_id: TENANT,
      site_id: SITE,
      rotation_id: 'rot-1',
      weighing_ticket_id: 'wt-1',
      loaded_tonnage_t: '24.50',
      material_type: 'granite_brut',
      stockpile_id_target: 'sp-1',
      operational_day_id: 'od-1',
      occurred_at_utc: '2026-05-15T08:00:00Z',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/'TRA'/);
    expect(inserts[0].sql).toMatch(/'truck_rotation'/);
    // 5000 XOF flat -> 500_000 centimes
    expect(inserts[0].params[4]).toBe('500000');
  });

  it('writes a DEBIT CON entry on production.crusher.session_completed', async () => {
    const { ds, inserts } = makeStubDs([
      { pattern: /FROM operational_days WHERE id/i, rows: [{ business_date: '2026-05-15' }] },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onCrusherSessionCompleted({
      session_id: 'cs-1',
      tenant_id: TENANT,
      site_id: SITE,
      operational_day_id: 'od-1',
      crusher_id: 'cr-1',
      output_stockpile_id: 'sp-1',
      output_tonnage_kg: 12000,
      input_tonnage_kg: 15000,
      material_type: 'granite_brut',
      calibre_code: '0-31',
      energy_kwh: 100,
      operator_id: 'op-1',
      completed_at_utc: '2026-05-15T16:00:00Z',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/'CON'/);
    expect(inserts[0].sql).toMatch(/'crusher_session'/);
    // 100 kWh * 120 XOF/kWh = 12000 XOF -> 1_200_000 centimes
    expect(inserts[0].params[4]).toBe('1200000');
  });

  it('writes a DEBIT CRI entry on production.screening.session_completed', async () => {
    const { ds, inserts } = makeStubDs([
      {
        pattern: /FROM screening_session ss/i,
        rows: [
          {
            business_date: '2026-05-15',
            session_start_utc: '2026-05-15T06:00:00.000Z',
            session_end_utc: '2026-05-15T09:00:00.000Z',
          },
        ],
      },
    ]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onScreeningSessionCompleted({
      session_id: 'ss-1',
      tenant_id: TENANT,
      site_id: SITE,
      operational_day_id: 'od-1',
      screen_id: 'scr-1',
      input_tonnage_kg: 50000,
      calibre_yields: [],
      operator_id: 'op-1',
      completed_at_utc: '2026-05-15T09:00:00.000Z',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toMatch(/'CRI'/);
    expect(inserts[0].sql).toMatch(/'screening_session'/);
    // 3h * 2000 XOF/h = 6000 XOF -> 600_000 centimes
    expect(inserts[0].params[4]).toBe('600000');
  });

  it('skips entry write when extraction cycle is not found (defensive)', async () => {
    const { ds, inserts } = makeStubDs([{ pattern: /FROM extraction_cycle ec/i, rows: [] }]);
    const handler = new AnalyticalEntryWriterHandler(ds as never);

    await handler.onExtractionCycleRecorded({
      tenantId: TENANT,
      siteId: SITE,
      cycleId: 'missing',
      operationalDayId: 'od-1',
      equipmentId: 'eq-1',
      operatorId: 'op-1',
      materialType: 'granite_brut',
      estimatedTonnageT: 0,
    });

    expect(inserts).toHaveLength(0);
  });
});
