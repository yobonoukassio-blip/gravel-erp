import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DrillingPlan, DrillingPlanStatus } from '../../../src/modules/foration/entities/drilling-plan.entity';
import { DrillingPlanService } from '../../../src/modules/foration/services/drilling-plan.service';
import { ProductionEquipment } from '../../../src/modules/master-data/production-equipment.entity';
import { ProductionEquipmentService } from '../../../src/modules/master-data/production-equipment.service';

/**
 * Tests for FOR-01 (plan state machine) and FOR-05 (broken drill blocks
 * activate). Pure-TS (no Postgres) — uses in-memory repos.
 */

class InMemoryRepo<T extends { id: string }> {
  rows: T[] = [];
  private seq = 0;

  create(partial: Partial<T>): T {
    this.seq += 1;
    return {
      id: `row-${this.seq}`,
      ...partial,
    } as T;
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
  async delete(opts: { id: string }): Promise<void> {
    this.rows = this.rows.filter((r) => r.id !== opts.id);
  }
}

describe('DrillingPlanService (FOR-01, FOR-05)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const siteId = '00000000-0000-0000-0000-0000000000aa';
  const zoneId = '00000000-0000-0000-0000-0000000000ab';
  const benchId = '00000000-0000-0000-0000-0000000000ac';
  const userId = '00000000-0000-0000-0000-000000000099';

  let planRepo: InMemoryRepo<DrillingPlan>;
  let equipRepo: InMemoryRepo<ProductionEquipment>;
  let equipSvc: ProductionEquipmentService;
  let service: DrillingPlanService;

  const baseInput = () => ({
    tenantId,
    siteId,
    zoneId,
    benchId,
    plannedHoleCount: 20,
    targetDepthM: 12.5,
    diameterMm: 89,
    validFrom: new Date('2026-06-01T06:00:00Z'),
    createdBy: userId,
  });

  beforeEach(async () => {
    planRepo = new InMemoryRepo<DrillingPlan>();
    equipRepo = new InMemoryRepo<ProductionEquipment>();
    equipSvc = new ProductionEquipmentService(equipRepo as never);
    service = new DrillingPlanService(planRepo as never, equipSvc);
  });

  async function makeMachine(status: 'active' | 'maintenance' | 'out_of_service' = 'active') {
    return equipSvc.create({
      tenantId,
      siteId,
      code: `DRILL-${status}`,
      label: 'Atlas Copco',
      type: 'drill',
    }).then(async (m) => {
      if (status !== 'active') await equipSvc.setStatus(m.id, tenantId, status);
      return m;
    });
  }

  it('creates a draft plan with status=draft', async () => {
    const plan = await service.create(baseInput());
    expect(plan.status).toBe('draft' as DrillingPlanStatus);
    expect(plan.plannedHoleCount).toBe(20);
    expect(plan.targetDepthM).toBe('12.50');
  });

  it('rejects creation with non-positive planned_hole_count', async () => {
    await expect(
      service.create({ ...baseInput(), plannedHoleCount: 0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('FOR-05: activate fails ERR_EQUIPMENT_NOT_ACTIVE when drill in maintenance', async () => {
    const machine = await makeMachine('maintenance');
    const plan = await service.create({
      ...baseInput(),
      assignedMachineId: machine.id,
    });
    await expect(service.activate(plan.id, tenantId, userId)).rejects.toThrow(
      /EQUIPMENT_NOT_ACTIVE|maintenance/,
    );
  });

  it('FOR-05: activate fails when drill is out_of_service', async () => {
    const machine = await makeMachine('out_of_service');
    const plan = await service.create({
      ...baseInput(),
      assignedMachineId: machine.id,
    });
    await expect(service.activate(plan.id, tenantId, userId)).rejects.toThrow(
      /EQUIPMENT_NOT_ACTIVE|out_of_service/,
    );
  });

  it('activate succeeds when drill is active', async () => {
    const machine = await makeMachine('active');
    const plan = await service.create({
      ...baseInput(),
      assignedMachineId: machine.id,
    });
    const activated = await service.activate(plan.id, tenantId, userId);
    expect(activated.status).toBe('active');
  });

  it('activate refuses if no machine assigned', async () => {
    const plan = await service.create(baseInput());
    await expect(service.activate(plan.id, tenantId, userId)).rejects.toThrow(
      /NO_MACHINE_ASSIGNED|machine/i,
    );
  });

  it('assignMachine rejects when equipment is in maintenance (D2-14)', async () => {
    const machine = await makeMachine('maintenance');
    const plan = await service.create(baseInput());
    await expect(
      service.assignMachine(plan.id, tenantId, machine.id),
    ).rejects.toThrow(/EQUIPMENT_NOT_ACTIVE|maintenance/);
  });

  it('close requires creator or SITE_MANAGER', async () => {
    const machine = await makeMachine('active');
    const plan = await service.create({
      ...baseInput(),
      assignedMachineId: machine.id,
    });
    await service.activate(plan.id, tenantId, userId);
    const stranger = '00000000-0000-0000-0000-0000000000ff';
    await expect(
      service.closePlan(plan.id, tenantId, stranger, false),
    ).rejects.toThrow(ForbiddenException);
    const closed = await service.closePlan(plan.id, tenantId, stranger, true);
    expect(closed.status).toBe('closed');
    expect(closed.closedBy).toBe(stranger);
  });

  it('rejects illegal status transition (draft → closed)', async () => {
    const plan = await service.create(baseInput());
    await expect(
      service.closePlan(plan.id, tenantId, userId, true),
    ).rejects.toMatchObject({ response: { code: 'INVALID_STATUS_TRANSITION' } });
  });

  it('archive transitions closed → archived', async () => {
    const machine = await makeMachine('active');
    const plan = await service.create({
      ...baseInput(),
      assignedMachineId: machine.id,
    });
    await service.activate(plan.id, tenantId, userId);
    await service.closePlan(plan.id, tenantId, userId, true);
    const archived = await service.archive(plan.id, tenantId);
    expect(archived.status).toBe('archived');
  });

  it('findById throws NotFound when missing', async () => {
    await expect(service.findById('nope', tenantId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
