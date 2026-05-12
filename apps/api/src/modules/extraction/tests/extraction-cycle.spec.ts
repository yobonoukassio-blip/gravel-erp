// REQ: EXT-01 — Mobile capture du cycle d'extraction.
// Source: 02-W1-P03 / D2-20 / D2-21.
//
// Pure-unit spec: no DB. Uses an in-memory repo + a stubbed equipment
// service to verify create + append-only invariant.

import {
  BadRequestException,
  MethodNotAllowedException,
} from '@nestjs/common';
import {
  ExtractionCycle,
  DOWNTIME_REASON_VALUES,
  MATERIAL_TYPE_VALUES,
} from '../entities/extraction-cycle.entity';
import {
  CreateExtractionCycleInput,
  ExtractionCycleService,
} from '../services/extraction-cycle.service';

class InMemoryCycleRepo {
  rows: ExtractionCycle[] = [];
  private counter = 0;

  create(row: Partial<ExtractionCycle>): ExtractionCycle {
    this.counter += 1;
    return {
      id: row.id ?? `cyc-${this.counter}`,
      createdAtUtc: new Date(),
      correctsId: null,
      ...row,
    } as ExtractionCycle;
  }
  async save(row: ExtractionCycle): Promise<ExtractionCycle> {
    this.rows.push(row);
    return row;
  }
  async findOne(opts: {
    where: Partial<ExtractionCycle>;
  }): Promise<ExtractionCycle | null> {
    return (
      this.rows.find((r) =>
        Object.entries(opts.where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      ) ?? null
    );
  }
  async find(opts: { where: Partial<ExtractionCycle> }): Promise<ExtractionCycle[]> {
    return this.rows.filter((r) =>
      Object.entries(opts.where).every(
        ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
      ),
    );
  }
}

class StubEquipmentService {
  assertActiveCalls: Array<{ id: string; tenant: string }> = [];
  inactiveIds = new Set<string>();
  async assertActive(id: string, tenantId: string): Promise<void> {
    this.assertActiveCalls.push({ id, tenant: tenantId });
    if (this.inactiveIds.has(id)) {
      throw new BadRequestException('EQUIPMENT_NOT_ACTIVE');
    }
  }
}

const tenantId = '00000000-0000-0000-0000-000000000001';
const siteId = '00000000-0000-0000-0000-0000000000aa';
const dayId = '00000000-0000-0000-0000-0000000000d1';
const benchId = '00000000-0000-0000-0000-0000000000b1';
const equipmentId = '00000000-0000-0000-0000-0000000000e1';
const operatorId = '00000000-0000-0000-0000-0000000000f1';

function baseInput(
  overrides: Partial<CreateExtractionCycleInput> = {},
): CreateExtractionCycleInput {
  return {
    tenantId,
    siteId,
    operationalDayId: dayId,
    benchId,
    equipmentId,
    operatorId,
    materialType: 'granite_brut',
    estimatedTonnageT: 50,
    cycleStartedAtLocal: new Date('2026-05-12T08:00:00'),
    cycleEndedAtLocal: new Date('2026-05-12T10:00:00'),
    ianaTimezone: 'Africa/Abidjan',
    downtimeMinutes: null,
    downtimeReasonCode: null,
    notes: null,
    createdBy: operatorId,
    ...overrides,
  };
}

describe('ExtractionCycleService — EXT-01', () => {
  let repo: InMemoryCycleRepo;
  let equipment: StubEquipmentService;
  let svc: ExtractionCycleService;

  beforeEach(() => {
    repo = new InMemoryCycleRepo();
    equipment = new StubEquipmentService();
    svc = new ExtractionCycleService(repo as never, equipment as never);
  });

  it('EXT-01: persists a new extraction cycle for an active excavator', async () => {
    const row = await svc.create(baseInput());
    expect(row.materialType).toBe('granite_brut');
    expect(row.estimatedTonnageT).toBe(50);
    expect(repo.rows).toHaveLength(1);
    expect(equipment.assertActiveCalls).toHaveLength(1);
  });

  it('EXT-01: exposes the 3 Phase-2 material types', () => {
    expect(MATERIAL_TYPE_VALUES).toEqual(['granite_brut', 'tout_venant', 'sterile']);
  });

  it('EXT-01: exposes exactly the 6 downtime reasons specified in D2-20', () => {
    expect(DOWNTIME_REASON_VALUES).toEqual([
      'meal_break',
      'fuel',
      'mechanical',
      'weather',
      'safety',
      'other',
    ]);
  });

  it('EXT-01: rejects creation when equipment is not active (D2-14)', async () => {
    equipment.inactiveIds.add(equipmentId);
    await expect(svc.create(baseInput())).rejects.toThrow(BadRequestException);
    expect(repo.rows).toHaveLength(0);
  });

  it('EXT-01: rejects cycle_ended_at_local <= cycle_started_at_local', async () => {
    await expect(
      svc.create(
        baseInput({
          cycleStartedAtLocal: new Date('2026-05-12T10:00:00'),
          cycleEndedAtLocal: new Date('2026-05-12T10:00:00'),
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('EXT-01: rejects downtime_reason without downtime_minutes', async () => {
    await expect(
      svc.create(
        baseInput({
          downtimeMinutes: null,
          downtimeReasonCode: 'meal_break',
        }),
      ),
    ).rejects.toThrow(/downtime_reason_code requires downtime_minutes/);
  });

  it('EXT-01: rejects downtime_minutes greater than elapsed time', async () => {
    await expect(
      svc.create(
        baseInput({
          // 2h cycle but 200min downtime
          downtimeMinutes: 200,
          downtimeReasonCode: 'mechanical',
        }),
      ),
    ).rejects.toThrow(/downtime_minutes cannot exceed/);
  });

  it('EXT-01: accepts a valid downtime entry', async () => {
    const row = await svc.create(
      baseInput({
        downtimeMinutes: 30,
        downtimeReasonCode: 'fuel',
      }),
    );
    expect(row.downtimeMinutes).toBe(30);
    expect(row.downtimeReasonCode).toBe('fuel');
  });

  it('EXT-01: append-only — PATCH rejected with 405 (D2-20)', () => {
    expect(() => svc.rejectMutation()).toThrow(MethodNotAllowedException);
  });

  it('EXT-01: corrections land as new rows pointing at corrects_id', async () => {
    const original = await svc.create(baseInput());
    const correction = await svc.create(
      baseInput({
        estimatedTonnageT: 55,
        correctsId: original.id,
      }),
    );
    expect(correction.correctsId).toBe(original.id);
    expect(repo.rows).toHaveLength(2);
  });
});
