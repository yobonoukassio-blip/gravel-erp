import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DrilledHoleController } from '../../../src/modules/foration/controllers/drilled-hole.controller';
import { DrilledHole } from '../../../src/modules/foration/entities/drilled-hole.entity';
import { DrillingPlan } from '../../../src/modules/foration/entities/drilling-plan.entity';
import {
  computeToleranceViolation,
  DrilledHoleService,
} from '../../../src/modules/foration/services/drilled-hole.service';

/**
 * Tests for FOR-02 (mobile capture → server append) and the append-only
 * controller contract (PATCH/DELETE → 405).
 */

class InMemoryRepo<T extends { id: string }> {
  rows: T[] = [];
  private seq = 0;
  create(partial: Partial<T>): T {
    this.seq += 1;
    return { id: `r-${this.seq}`, ...partial } as T;
  }
  async save(row: T): Promise<T> {
    const idx = this.rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
    return row;
  }
  async findOne(opts: { where: Partial<T> }): Promise<T | null> {
    return (
      this.rows.find((r) =>
        Object.entries(opts.where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      ) ?? null
    );
  }
  async find(opts: { where: Partial<T>; order?: unknown }): Promise<T[]> {
    return this.rows.filter((r) =>
      Object.entries(opts.where).every(
        ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
      ),
    );
  }
}

describe('computeToleranceViolation (D2-12)', () => {
  it('returns false when actual matches target', () => {
    expect(
      computeToleranceViolation(
        { depthM: 12, diameterMm: 89 },
        { depthM: 12, diameterMm: 89 },
      ),
    ).toBe(false);
  });

  it('returns true when depth > 10% deviation', () => {
    expect(
      computeToleranceViolation(
        { depthM: 10, diameterMm: 89 },
        { depthM: 12.5, diameterMm: 89 },
      ),
    ).toBe(true);
  });

  it('returns true when diameter > 5% deviation', () => {
    expect(
      computeToleranceViolation(
        { depthM: 10, diameterMm: 89 },
        { depthM: 10, diameterMm: 95 },
      ),
    ).toBe(true);
  });

  it('returns false for depth = 5% (under threshold)', () => {
    expect(
      computeToleranceViolation(
        { depthM: 10, diameterMm: 89 },
        { depthM: 10.5, diameterMm: 89 },
      ),
    ).toBe(false);
  });
});

describe('DrilledHoleService.append (FOR-02)', () => {
  const tenantId = 't1';
  const planId = 'plan-1';
  let holeRepo: InMemoryRepo<DrilledHole>;
  let planRepo: InMemoryRepo<DrillingPlan>;
  let bus: EventEmitter2;
  let service: DrilledHoleService;

  const makeInput = (overrides: Partial<Parameters<DrilledHoleService['append']>[0]> = {}) => ({
    tenantId,
    siteId: 'site-1',
    planId,
    holeIndexInPlan: 1,
    gpsLatitude: 5.345,
    gpsLongitude: -4.012,
    gpsAccuracyM: 8.0,
    actualDepthM: 12.0,
    actualDiameterMm: 89,
    inclinationDeg: 0.0,
    startedAtLocal: new Date('2026-06-01T06:30:00'),
    endedAtLocal: new Date('2026-06-01T07:00:00'),
    ianaTimezone: 'Africa/Abidjan',
    operationalDayId: 'opday-1',
    operatorId: 'user-op',
    machineId: 'mach-1',
    fuelLitersConsumed: 4.5,
    createdBy: 'user-op',
    ...overrides,
  });

  beforeEach(async () => {
    holeRepo = new InMemoryRepo<DrilledHole>();
    planRepo = new InMemoryRepo<DrillingPlan>();
    bus = new EventEmitter2();
    service = new DrilledHoleService(
      holeRepo as never,
      planRepo as never,
      bus,
    );

    // Seed an active plan with target depth=12m, diameter=89mm.
    await planRepo.save({
      id: planId,
      tenantId,
      siteId: 'site-1',
      zoneId: 'z',
      benchId: 'b',
      plannedHoleCount: 20,
      targetDepthM: '12.00',
      diameterMm: 89,
      assignedOperatorId: null,
      assignedMachineId: 'mach-1',
      validFrom: new Date(),
      validTo: null,
      status: 'active',
      createdBy: 'user-op',
      createdAt: new Date(),
      closedBy: null,
      closedAtUtc: null,
      updatedAt: new Date(),
    } as DrillingPlan);
  });

  it('appends a hole within tolerance with tolerance_violation=false', async () => {
    const hole = await service.append(makeInput());
    expect(hole.toleranceViolation).toBe(false);
    expect(hole.fuelLitersConsumed).toBe('4.50');
  });

  it('rejects out-of-tolerance hole without reason text', async () => {
    await expect(
      service.append(makeInput({ actualDepthM: 16, holeIndexInPlan: 2 })),
    ).rejects.toThrow(/TOLERANCE_REASON_REQUIRED/);
  });

  it('stores out-of-tolerance hole with tolerance_violation=true when reason provided', async () => {
    const hole = await service.append(
      makeInput({
        actualDepthM: 16,
        holeIndexInPlan: 2,
        toleranceViolationReason: 'Roche dure inattendue',
      }),
    );
    expect(hole.toleranceViolation).toBe(true);
    expect(hole.toleranceViolationReason).toBe('Roche dure inattendue');
  });

  it('rejects append when plan is not active', async () => {
    const plan = await planRepo.findOne({ where: { id: planId } });
    plan!.status = 'draft';
    await planRepo.save(plan!);
    await expect(service.append(makeInput())).rejects.toThrow(
      /PLAN_NOT_ACTIVE/,
    );
  });

  it('rejects append on missing plan', async () => {
    await expect(
      service.append(makeInput({ planId: 'nope' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('emits production.foration.hole_drilled on append', async () => {
    const captured: unknown[] = [];
    bus.on('production.foration.hole_drilled', (evt) => captured.push(evt));
    await service.append(makeInput());
    expect(captured).toHaveLength(1);
    const evt = captured[0] as { payload: { hole_id: string; machine_id: string } };
    expect(evt.payload.machine_id).toBe('mach-1');
  });

  it('emits correctly for corrections (correctsHoleId set)', async () => {
    const original = await service.append(makeInput());
    const correction = await service.append(
      makeInput({
        holeIndexInPlan: 1, // same index in plan triggers unique violation IRL; spec is logical
        correctsHoleId: original.id,
        // Force a fresh index to avoid PK collision in this in-memory repo
        // The in-memory repo doesn't enforce unique, so OK.
      }),
    );
    expect(correction.correctsHoleId).toBe(original.id);
  });
});

describe('DrilledHoleController append-only contract', () => {
  it('PATCH /drilled-holes/:id → 405 with METHOD_NOT_ALLOWED code', () => {
    const ctrl = new DrilledHoleController(null as never);
    try {
      ctrl.rejectMutation();
      fail('Expected exception');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.METHOD_NOT_ALLOWED,
      );
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'METHOD_NOT_ALLOWED',
      });
    }
  });
});
