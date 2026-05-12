import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  EquipmentStatus,
  EquipmentType,
  ProductionEquipment,
} from '../production-equipment.entity';
import { ProductionEquipmentService } from '../production-equipment.service';

class InMemoryEquipmentRepo {
  private rows: ProductionEquipment[] = [];
  private counter = 0;

  create(row: Partial<ProductionEquipment>): ProductionEquipment {
    this.counter += 1;
    return {
      id: row.id ?? `eq-${this.counter}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as EquipmentStatus,
      specs: {},
      ...row,
    } as ProductionEquipment;
  }
  async save(row: ProductionEquipment): Promise<ProductionEquipment> {
    const idx = this.rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      row.updatedAt = new Date();
      this.rows[idx] = row;
    } else {
      this.rows.push(row);
    }
    return row;
  }
  async findOne(opts: { where: Partial<ProductionEquipment> }): Promise<ProductionEquipment | null> {
    return (
      this.rows.find((r) =>
        Object.entries(opts.where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      ) ?? null
    );
  }
  async find(opts: {
    where: Partial<ProductionEquipment>;
    order?: Record<string, unknown>;
  }): Promise<ProductionEquipment[]> {
    return this.rows
      .filter((r) =>
        Object.entries(opts.where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      )
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  async delete(opts: { id: string }): Promise<void> {
    this.rows = this.rows.filter((r) => r.id !== opts.id);
  }
}

describe('ProductionEquipmentService', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const siteId = '00000000-0000-0000-0000-0000000000aa';
  let repo: InMemoryEquipmentRepo;
  let svc: ProductionEquipmentService;

  beforeEach(() => {
    repo = new InMemoryEquipmentRepo();
    svc = new ProductionEquipmentService(repo as never);
  });

  it('creates a piece of equipment with status=active by default', async () => {
    const row = await svc.create({
      tenantId,
      siteId,
      code: 'DRILL-01',
      label: 'Atlas Copco Diamec U6',
      type: 'drill' as EquipmentType,
    });
    expect(row.status).toBe('active');
    expect(row.type).toBe('drill');
  });

  it('lists equipment sorted by code', async () => {
    await svc.create({ tenantId, siteId, code: 'TRUCK-02', label: 'T2', type: 'truck' });
    await svc.create({ tenantId, siteId, code: 'EXC-01', label: 'E1', type: 'excavator' });
    const list = await svc.findAll(tenantId, siteId);
    expect(list.map((r) => r.code)).toEqual(['EXC-01', 'TRUCK-02']);
  });

  it('setStatus transitions active → maintenance', async () => {
    const a = await svc.create({ tenantId, siteId, code: 'GEN-01', label: 'G1', type: 'generator' });
    const updated = await svc.setStatus(a.id, tenantId, 'maintenance');
    expect(updated.status).toBe('maintenance');
  });

  it('assertActive resolves silently for active equipment', async () => {
    const a = await svc.create({ tenantId, siteId, code: 'DRILL-02', label: 'D2', type: 'drill' });
    await expect(svc.assertActive(a.id, tenantId)).resolves.toBeUndefined();
  });

  it('assertActive throws EQUIPMENT_NOT_ACTIVE when status is maintenance', async () => {
    const a = await svc.create({ tenantId, siteId, code: 'DRILL-03', label: 'D3', type: 'drill' });
    await svc.setStatus(a.id, tenantId, 'maintenance');
    await expect(svc.assertActive(a.id, tenantId)).rejects.toThrow(BadRequestException);
  });

  it('assertActive throws when status is out_of_service', async () => {
    const a = await svc.create({ tenantId, siteId, code: 'DRILL-04', label: 'D4', type: 'drill' });
    await svc.setStatus(a.id, tenantId, 'out_of_service');
    await expect(svc.assertActive(a.id, tenantId)).rejects.toThrow(/EQUIPMENT_NOT_ACTIVE|out_of_service/);
  });

  it('findById throws NotFound when id absent', async () => {
    await expect(svc.findById('nope', tenantId)).rejects.toThrow(NotFoundException);
  });

  it('update modifies label without changing status', async () => {
    const a = await svc.create({ tenantId, siteId, code: 'EXC-09', label: 'Old', type: 'excavator' });
    await svc.setStatus(a.id, tenantId, 'maintenance');
    const updated = await svc.update(a.id, tenantId, { label: 'New label' });
    expect(updated.label).toBe('New label');
    expect(updated.status).toBe('maintenance');
  });
});
