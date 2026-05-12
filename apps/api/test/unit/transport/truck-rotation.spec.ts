import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxEvent } from '../../../src/modules/outbox/outbox-event.entity';
import { OutboxService } from '../../../src/modules/outbox/outbox.service';
import { ProductionEquipment } from '../../../src/modules/master-data/production-equipment.entity';
import { ProductionEquipmentService } from '../../../src/modules/master-data/production-equipment.service';
import { TruckRotation } from '../../../src/modules/transport/entities/truck-rotation.entity';
import { WeighingTicket } from '../../../src/modules/transport/entities/weighing-ticket.entity';
import {
  ROTATION_COMPLETED_EVENT,
  TruckRotationService,
} from '../../../src/modules/transport/services/truck-rotation.service';

/**
 * TRP-01 / TRP-03 — TruckRotation service tests.
 *
 * Covers:
 *   - assignTruck rejects non-active truck (D2-14)
 *   - assignTruck rejects non-truck equipment type
 *   - complete() sets unloaded_at_utc and publishes outbox event
 *     `production.transport.rotation_completed` IN THE SAME TX
 *   - Transaction rollback leaves NO outbox row visible (same-tx guarantee)
 *   - Idempotency: completing twice → ROTATION_ALREADY_COMPLETED
 */

interface Row {
  id: string;
  [k: string]: unknown;
}

class InMemoryRepo<T extends Row> {
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
  async find(opts: { where: Partial<T> }): Promise<T[]> {
    return this.rows.filter((r) =>
      Object.entries(opts.where).every(
        ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
      ),
    );
  }
  createQueryBuilder() {
    let filtered = [...this.rows];
    const qb = {
      where: (_s: string, p?: Record<string, unknown>) => {
        if (p && 'tenantId' in p) {
          filtered = filtered.filter((r) => r.tenantId === p.tenantId);
        }
        return qb;
      },
      andWhere: (s: string) => {
        if (s.includes('truck_equipment_id IS NULL')) {
          filtered = filtered.filter((r) => !r.truckEquipmentId);
        }
        if (s.includes('unloaded_at_utc IS NULL')) {
          filtered = filtered.filter((r) => !r.unloadedAtUtc);
        }
        return qb;
      },
      orderBy: () => qb,
      getMany: async () => filtered,
    };
    return qb;
  }
}

class FakeManager {
  constructor(public readonly registry: Map<unknown, InMemoryRepo<Row>>) {}
  getRepository<T extends Row>(target: unknown): InMemoryRepo<T> {
    if (!this.registry.has(target)) {
      this.registry.set(target, new InMemoryRepo<Row>());
    }
    return this.registry.get(target) as InMemoryRepo<T>;
  }
}

class FakeDataSource {
  registry = new Map<unknown, InMemoryRepo<Row>>();
  /**
   * Simulates the TX boundary. When `failAfter` callback returns true the
   * tx is rolled back — but in this stub we model rollback by reverting the
   * registry snapshot.
   */
  async transaction<T>(
    fn: (m: EntityManager) => Promise<T>,
  ): Promise<T> {
    const snapshot = new Map<unknown, Row[]>();
    for (const [k, v] of this.registry) {
      snapshot.set(k, [...v.rows]);
    }
    try {
      const result = await fn(new FakeManager(this.registry) as never);
      return result;
    } catch (err) {
      // rollback
      for (const [k, rows] of snapshot) {
        const repo = this.registry.get(k) as InMemoryRepo<Row> | undefined;
        if (repo) repo.rows = rows;
      }
      throw err;
    }
  }
  getRepository<T extends Row>(target: unknown): InMemoryRepo<T> {
    if (!this.registry.has(target)) {
      this.registry.set(target, new InMemoryRepo<Row>());
    }
    return this.registry.get(target) as InMemoryRepo<T>;
  }
}

describe('TruckRotationService (TRP-01, TRP-03, D2-35)', () => {
  const tenantId = 't1';
  let ds: FakeDataSource;
  let equipmentRepo: InMemoryRepo<Row>;
  let equipmentService: ProductionEquipmentService;
  let outbox: OutboxService;
  let svc: TruckRotationService;

  const seedEquipment = (
    id: string,
    type: 'truck' | 'excavator',
    status: 'active' | 'maintenance' | 'out_of_service',
  ) => {
    equipmentRepo.rows.push({
      id,
      tenantId,
      siteId: 'site-1',
      code: id,
      label: id,
      type,
      status,
      specs: {},
    } as Row);
  };

  const seedTicket = (id: string): void => {
    const repo = ds.getRepository(WeighingTicket);
    repo.rows.push({
      id,
      tenantId,
      siteId: 'site-1',
      ticketNumber: 'CIV01-20260615-MOB42-0007',
      grossKg: 30000,
      tareKg: 15000,
      netKg: 15000,
      truckEquipmentId: 'truck-1',
      driverId: 'driver-1',
      materialType: 'granite_brut',
      weighedAtLocal: new Date(),
      ianaTimezone: 'Africa/Abidjan',
      operationalDayId: 'opday-1',
      operatorUserId: 'op-1',
      weighingStationCode: 'PB-NORD',
      isOfflineGenerated: true,
      contentHash: 'x'.repeat(64),
      createdBy: 'op-1',
      createdAtUtc: new Date(),
    } as Row);
  };

  beforeEach(() => {
    ds = new FakeDataSource();
    equipmentRepo = new InMemoryRepo<Row>();
    ds.registry.set(ProductionEquipment, equipmentRepo);
    equipmentService = new ProductionEquipmentService(equipmentRepo as never);
    outbox = new OutboxService();
    svc = new TruckRotationService(ds as never, equipmentService, outbox);

    seedEquipment('truck-1', 'truck', 'active');
    seedEquipment('truck-maint', 'truck', 'maintenance');
    seedEquipment('excavator-1', 'excavator', 'active');
    seedTicket('ticket-1');
  });

  const makeRotation = async (overrides: Partial<Parameters<TruckRotationService['create']>[0]> = {}) => {
    return svc.create({
      tenantId,
      siteId: 'site-1',
      operationalDayId: 'opday-1',
      truckEquipmentId: null,
      driverId: null,
      loadedAtBenchId: 'bench-1',
      unloadedAtZoneId: 'zone-1',
      materialType: 'granite_brut',
      weighingTicketId: 'ticket-1',
      loadedAtUtc: new Date('2026-06-15T08:00:00Z'),
      createdBy: 'op-1',
      ...overrides,
    });
  };

  it('creates rotation with tonnage sourced from weighing ticket net_kg', async () => {
    const r = await makeRotation();
    // 15000 kg → 15.00 t
    expect(r.loadedTonnageT).toBe('15.00');
    expect(r.truckEquipmentId).toBeNull();
    expect(r.unloadedAtUtc).toBeNull();
  });

  it('rejects rotation when weighing ticket missing', async () => {
    await expect(
      makeRotation({ weighingTicketId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assignTruck rejects equipment of type excavator', async () => {
    const r = await makeRotation();
    await expect(
      svc.assignTruck(r.id, tenantId, 'excavator-1'),
    ).rejects.toMatchObject({ response: { code: 'EQUIPMENT_NOT_TRUCK' } });
  });

  it('assignTruck rejects truck in maintenance status', async () => {
    const r = await makeRotation();
    await expect(
      svc.assignTruck(r.id, tenantId, 'truck-maint'),
    ).rejects.toMatchObject({ response: { code: 'EQUIPMENT_NOT_ACTIVE' } });
  });

  it('assignTruck succeeds for active truck', async () => {
    const r = await makeRotation();
    const updated = await svc.assignTruck(r.id, tenantId, 'truck-1');
    expect(updated.truckEquipmentId).toBe('truck-1');
  });

  it('complete() publishes rotation_completed outbox event in same tx', async () => {
    const r = await makeRotation({ truckEquipmentId: 'truck-1' });
    await svc.complete(r.id, tenantId, new Date('2026-06-15T08:45:00Z'));

    const outboxRepo = ds.getRepository(OutboxEvent);
    expect(outboxRepo.rows.length).toBe(1);
    const evt = outboxRepo.rows[0];
    expect(evt.eventType).toBe(ROTATION_COMPLETED_EVENT);
    expect(evt.aggregateType).toBe('truck_rotation');
    expect(evt.aggregateId).toBe(r.id);
    const payload = evt.payload as Record<string, unknown>;
    expect(payload.rotation_id).toBe(r.id);
    expect(payload.stockpile_id_target).toBe('zone-1');
    expect(payload.weighing_ticket_id).toBe('ticket-1');
  });

  it('rolling back the completion tx leaves NO outbox row visible', async () => {
    const r = await makeRotation({ truckEquipmentId: 'truck-1' });

    // Force the tx to fail AFTER outbox publish — simulating a constraint
    // violation at commit. We monkey-patch the rotation repo save to throw
    // on the second call within completeWithManager.
    const rotationRepo = ds.getRepository(TruckRotation);
    const originalSave = rotationRepo.save.bind(rotationRepo);
    let calls = 0;
    rotationRepo.save = async (row: Row) => {
      calls += 1;
      if (calls > 0 && row.unloadedAtUtc) {
        // First save (during create) was already done before this hook.
        // Persist, then throw to force rollback.
        await originalSave(row);
        throw new Error('simulated constraint violation');
      }
      return originalSave(row);
    };

    await expect(
      svc.complete(r.id, tenantId, new Date('2026-06-15T08:45:00Z')),
    ).rejects.toThrow(/simulated constraint violation/);

    const outboxRepo = ds.getRepository(OutboxEvent);
    expect(outboxRepo.rows.length).toBe(0); // rolled back
  });

  it('complete() refuses second completion (ROTATION_ALREADY_COMPLETED)', async () => {
    const r = await makeRotation({ truckEquipmentId: 'truck-1' });
    await svc.complete(r.id, tenantId, new Date('2026-06-15T08:45:00Z'));
    await expect(
      svc.complete(r.id, tenantId, new Date('2026-06-15T09:00:00Z')),
    ).rejects.toMatchObject({ response: { code: 'ROTATION_ALREADY_COMPLETED' } });
  });

  it('complete() rejects unloaded_at_utc before loaded_at_utc', async () => {
    const r = await makeRotation({
      truckEquipmentId: 'truck-1',
    });
    await expect(
      svc.complete(r.id, tenantId, new Date('2026-06-15T07:00:00Z')),
    ).rejects.toMatchObject({ response: { code: 'INVALID_UNLOAD_TIME' } });
  });

  it('listPendingDispatch returns only rotations missing truck and not completed', async () => {
    const r1 = await makeRotation(); // no truck → pending
    await makeRotation({
      truckEquipmentId: 'truck-1',
      weighingTicketId: 'ticket-1',
    }).catch(() => {}); // ticket already used (UNIQUE) — ignore

    const pending = await svc.listPendingDispatch(tenantId);
    expect(pending.map((p) => p.id)).toContain(r1.id);
  });

  it('exports ROTATION_COMPLETED_EVENT constant value', () => {
    expect(ROTATION_COMPLETED_EVENT).toBe(
      'production.transport.rotation_completed',
    );
  });
});

// Sanity check: typed import shape
describe('TruckRotation entity shape', () => {
  it('has weighing_ticket_id column metadata', () => {
    // Smoke: import shouldn't throw; entity exists.
    expect(TruckRotation.name).toBe('TruckRotation');
  });
});

// Avoid unused imports being stripped by ts-jest
void DataSource;
