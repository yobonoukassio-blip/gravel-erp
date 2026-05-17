// REQ: HSE-03 — EPI catalog + assignment + compliance.
//
// Pure-unit spec using in-memory fake Repository<EpiItem> / <EpiAssignment>.
// No DB. Verifies:
//   - createItem rejects empty name (BadRequest)
//   - issue creates a new assignment in 'good' condition
//   - issue rejects unknown item (NotFound)
//   - return fills returned_*, can mark damaged/condemned, rejects double-return
//   - checkCompliance returns employees missing mandatory categories
//   - checkCompliance excludes condemned items from coverage

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EpiAssignment } from '../entities/epi-assignment.entity';
import { EpiCategory, EpiItem } from '../entities/epi-item.entity';
import { EpiService } from '../services/epi.service';

const TENANT = '24cd97f8-0170-453e-89da-e9213dd710d7';

/** Tiny fake Repository<T> implementing only the methods EpiService uses. */
class FakeRepo<T extends { id: string }> {
  private readonly rows: T[] = [];
  private autoId = 1;

  create(partial: Partial<T>): T {
    return { ...(partial as object), id: `id-${this.autoId++}` } as T;
  }
  async save(row: T): Promise<T> {
    const i = this.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) {
      this.rows[i] = row;
    } else {
      this.rows.push(row);
    }
    return row;
  }
  async find(opts: {
    where?: Partial<T> | Record<string, unknown>;
    relations?: string[];
    order?: Record<string, unknown>;
  } = {}): Promise<T[]> {
    const where = (opts.where ?? {}) as Record<string, unknown>;
    return this.rows.filter((r) => {
      for (const [k, v] of Object.entries(where)) {
        // Crude IsNull() detection: typeorm IsNull() yields object
        const recordVal = (r as unknown as Record<string, unknown>)[k];
        if (v === null) {
          if (recordVal !== null) return false;
          continue;
        }
        if (typeof v === 'object' && v !== null && '_type' in (v as object)) {
          // typeorm operators — only IsNull supported in this fake
          if (recordVal !== null) return false;
          continue;
        }
        if (recordVal !== v) return false;
      }
      return true;
    });
  }
  async findOne(opts: {
    where: Partial<T> | Record<string, unknown>;
  }): Promise<T | null> {
    const rows = await this.find(opts);
    return rows[0] ?? null;
  }
  /** Test helper. */
  seed(rows: readonly T[]): void {
    for (const r of rows) this.rows.push(r);
  }
}

function mkItem(overrides: Partial<EpiItem> = {}): EpiItem {
  return {
    id: overrides.id ?? `item-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: TENANT,
    name: 'Casque chantier',
    category: 'casque' as EpiCategory,
    description: null,
    isMandatory: true,
    createdAtUtc: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

function mkAssignment(overrides: Partial<EpiAssignment> = {}): EpiAssignment {
  return {
    id: overrides.id ?? `as-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: TENANT,
    employeeId: 'emp-1',
    epiItemId: 'item-1',
    issuedAtUtc: new Date('2026-05-10T08:00:00Z'),
    issuedBy: 'sup-1',
    returnedAtUtc: null,
    returnedBy: null,
    condition: 'good',
    notes: null,
    createdAtUtc: new Date('2026-05-10T08:00:00Z'),
    ...overrides,
  };
}

describe('EpiService (HSE-03)', () => {
  let items: FakeRepo<EpiItem>;
  let assignments: FakeRepo<EpiAssignment>;
  let svc: EpiService;

  beforeEach(() => {
    items = new FakeRepo<EpiItem>();
    assignments = new FakeRepo<EpiAssignment>();
    svc = new EpiService(items as never, assignments as never);
  });

  it('createItem rejects empty name', async () => {
    await expect(
      svc.createItem({
        tenantId: TENANT,
        name: '   ',
        category: 'casque',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createItem trims the name and persists with defaults', async () => {
    const created = await svc.createItem({
      tenantId: TENANT,
      name: '  Gilet HV  ',
      category: 'gilet',
      isMandatory: true,
    });
    expect(created.name).toBe('Gilet HV');
    expect(created.tenantId).toBe(TENANT);
    expect(created.isMandatory).toBe(true);
    expect(created.description).toBe(null);
  });

  it('issue throws NotFound when the item does not exist', async () => {
    await expect(
      svc.issue({
        tenantId: TENANT,
        employeeId: 'emp-1',
        epiItemId: 'item-missing',
        issuedBy: 'sup-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issue creates an open assignment in good condition', async () => {
    const item = mkItem({ id: 'item-1' });
    items.seed([item]);

    const created = await svc.issue({
      tenantId: TENANT,
      employeeId: 'emp-1',
      epiItemId: 'item-1',
      issuedBy: 'sup-1',
      notes: 'taille L',
    });

    expect(created.condition).toBe('good');
    expect(created.returnedAtUtc).toBe(null);
    expect(created.returnedBy).toBe(null);
    expect(created.notes).toBe('taille L');
  });

  it('return fills returned_* and accepts the damaged condition', async () => {
    assignments.seed([mkAssignment({ id: 'as-1' })]);

    const updated = await svc.return({
      tenantId: TENANT,
      assignmentId: 'as-1',
      returnedBy: 'sup-2',
      condition: 'damaged',
    });

    expect(updated.returnedAtUtc).toBeInstanceOf(Date);
    expect(updated.returnedBy).toBe('sup-2');
    expect(updated.condition).toBe('damaged');
  });

  it('return rejects when the assignment is already returned', async () => {
    assignments.seed([
      mkAssignment({
        id: 'as-1',
        returnedAtUtc: new Date('2026-05-12'),
        returnedBy: 'sup-2',
        condition: 'condemned',
      }),
    ]);

    await expect(
      svc.return({
        tenantId: TENANT,
        assignmentId: 'as-1',
        returnedBy: 'sup-3',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checkCompliance flags employees missing a mandatory category', async () => {
    const helmet = mkItem({ id: 'helmet', category: 'casque', name: 'Casque' });
    const vest = mkItem({ id: 'vest', category: 'gilet', name: 'Gilet HV' });
    const optional = mkItem({
      id: 'glasses',
      category: 'lunettes',
      name: 'Lunettes',
      isMandatory: false,
    });
    items.seed([helmet, vest, optional]);

    // emp-1 only holds the helmet; emp-2 holds both; emp-3 holds nothing.
    assignments.seed([
      mkAssignment({ id: 'a1', employeeId: 'emp-1', epiItemId: 'helmet' }),
      mkAssignment({ id: 'a2', employeeId: 'emp-2', epiItemId: 'helmet' }),
      mkAssignment({ id: 'a3', employeeId: 'emp-2', epiItemId: 'vest' }),
    ]);
    // Hydrate the epiItem relation manually (FakeRepo doesn't join).
    for (const a of await assignments.find({ where: { tenantId: TENANT } })) {
      a.epiItem = items
        .seed as unknown as undefined; // dummy; will overwrite below
    }
    const allA = await assignments.find({ where: { tenantId: TENANT } });
    for (const a of allA) {
      a.epiItem =
        a.epiItemId === 'helmet' ? helmet : a.epiItemId === 'vest' ? vest : optional;
    }

    const result = await svc.checkCompliance(TENANT, ['emp-1', 'emp-2', 'emp-3']);

    // emp-1 missing vest
    const emp1 = result.find((r) => r.employeeId === 'emp-1');
    expect(emp1).toBeDefined();
    expect(emp1!.missingCategories).toEqual(['gilet']);

    // emp-2 missing none — should not appear
    expect(result.find((r) => r.employeeId === 'emp-2')).toBeUndefined();

    // emp-3 missing both
    const emp3 = result.find((r) => r.employeeId === 'emp-3');
    expect(emp3).toBeDefined();
    expect([...emp3!.missingCategories].sort()).toEqual(['casque', 'gilet']);
  });

  it('checkCompliance ignores condemned items as coverage', async () => {
    const helmet = mkItem({ id: 'helmet', category: 'casque' });
    items.seed([helmet]);
    const condemned = mkAssignment({
      id: 'cond',
      employeeId: 'emp-x',
      epiItemId: 'helmet',
      condition: 'condemned',
    });
    condemned.epiItem = helmet;
    assignments.seed([condemned]);

    const result = await svc.checkCompliance(TENANT, ['emp-x']);
    expect(result).toHaveLength(1);
    expect(result[0].missingCategories).toEqual(['casque']);
  });

  it('checkCompliance returns empty list when no mandatory items configured', async () => {
    items.seed([mkItem({ isMandatory: false })]);
    const result = await svc.checkCompliance(TENANT, ['emp-1', 'emp-2']);
    expect(result).toEqual([]);
  });
});
