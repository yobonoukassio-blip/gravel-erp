// REQ: EXT-02 — Calcul du rendement extraction par engin/opérateur/jour avec
// déduction des temps d'arrêt. Source: 02-W1-P03 / D2-20.
//
// Pure unit spec — exercises ExtractionYieldService.aggregate() against a
// deterministic in-memory dataset.

import { ExtractionCycle } from '../entities/extraction-cycle.entity';
import { ExtractionYieldService } from '../services/extraction-yield.service';

function cycle(
  partial: Partial<ExtractionCycle> & {
    startedISO: string;
    endedISO: string;
    tonnage: number;
    downtimeMin?: number | null;
  },
): ExtractionCycle {
  return {
    id: partial.id ?? `c-${partial.startedISO}`,
    tenantId: 'tenant-1',
    siteId: 'site-1',
    operationalDayId: 'day-1',
    benchId: 'bench-1',
    equipmentId: partial.equipmentId ?? 'EXC-01',
    operatorId: partial.operatorId ?? 'OP-01',
    materialType: 'granite_brut',
    estimatedTonnageT: partial.tonnage,
    cycleStartedAtLocal: new Date(partial.startedISO),
    cycleEndedAtLocal: new Date(partial.endedISO),
    ianaTimezone: 'Africa/Abidjan',
    downtimeMinutes: partial.downtimeMin ?? null,
    downtimeReasonCode: null,
    notes: null,
    correctsId: null,
    createdBy: 'OP-01',
    createdAtUtc: new Date(),
  } as ExtractionCycle;
}

describe('ExtractionYieldService — EXT-02', () => {
  const svc = new ExtractionYieldService(null as never);

  it('EXT-02: subtracts downtime from productive time — plan reference scenario', () => {
    // 5 cycles totalling 250 t, elapsed 10h (600min), 60min downtime
    //   productive = 540 min = 9 h
    //   yield      = 250 / 9 = 27.78 t/h
    const rows = [
      cycle({ startedISO: '2026-05-12T06:00:00', endedISO: '2026-05-12T08:00:00', tonnage: 50, downtimeMin: 60 }),
      cycle({ startedISO: '2026-05-12T08:00:00', endedISO: '2026-05-12T10:00:00', tonnage: 50 }),
      cycle({ startedISO: '2026-05-12T10:00:00', endedISO: '2026-05-12T12:00:00', tonnage: 50 }),
      cycle({ startedISO: '2026-05-12T13:00:00', endedISO: '2026-05-12T15:00:00', tonnage: 50 }),
      cycle({ startedISO: '2026-05-12T15:00:00', endedISO: '2026-05-12T17:00:00', tonnage: 50 }),
    ];
    const out = svc.aggregate(rows);
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.equipment_id).toBe('EXC-01');
    expect(r.operator_id).toBe('OP-01');
    expect(r.total_estimated_t).toBe(250);
    expect(r.productive_hours).toBe(9);
    // Downtime subtraction asserted explicitly:
    expect(r.yield_t_per_h).toBeCloseTo(27.78, 2);
    expect(r.cycle_count).toBe(5);
  });

  it('EXT-02: aggregates separately per equipment_id + operator_id', () => {
    const rows = [
      cycle({
        startedISO: '2026-05-12T06:00:00',
        endedISO: '2026-05-12T07:00:00',
        tonnage: 30,
        equipmentId: 'EXC-01',
        operatorId: 'OP-01',
      }),
      cycle({
        startedISO: '2026-05-12T06:00:00',
        endedISO: '2026-05-12T08:00:00',
        tonnage: 60,
        equipmentId: 'EXC-02',
        operatorId: 'OP-02',
      }),
    ];
    const out = svc.aggregate(rows);
    expect(out).toHaveLength(2);
    const r1 = out.find((r) => r.equipment_id === 'EXC-01')!;
    const r2 = out.find((r) => r.equipment_id === 'EXC-02')!;
    expect(r1.productive_hours).toBe(1);
    expect(r1.yield_t_per_h).toBe(30);
    expect(r2.productive_hours).toBe(2);
    expect(r2.yield_t_per_h).toBe(30);
  });

  it('EXT-02: yield = 0 when productive_hours = 0 (avoids division by zero)', () => {
    const rows = [
      cycle({
        startedISO: '2026-05-12T08:00:00',
        endedISO: '2026-05-12T09:00:00',
        tonnage: 10,
        downtimeMin: 60, // full hour of downtime
      }),
    ];
    const out = svc.aggregate(rows);
    expect(out[0].productive_hours).toBe(0);
    expect(out[0].yield_t_per_h).toBe(0);
  });

  it('EXT-02: handles missing downtime as zero', () => {
    const rows = [
      cycle({
        startedISO: '2026-05-12T08:00:00',
        endedISO: '2026-05-12T10:00:00',
        tonnage: 40,
        downtimeMin: null,
      }),
    ];
    const out = svc.aggregate(rows);
    expect(out[0].productive_hours).toBe(2);
    expect(out[0].yield_t_per_h).toBe(20);
  });

  it('EXT-02: empty input → empty result', () => {
    expect(svc.aggregate([])).toEqual([]);
  });
});
