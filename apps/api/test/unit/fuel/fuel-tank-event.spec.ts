import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  buildFuelCanonicalPayload,
  GENESIS_PREV_HASH,
  sha256Fuel,
  FuelTankEventService,
} from '../../../src/modules/fuel/services/fuel-tank-event.service';

/**
 * FuelTankEventService unit tests — CAR-01 (chain-of-hash + role guards).
 *
 * Uses a fake DataSource emulating partitioned table behavior sufficient for
 * chain semantics. Postgres-specific concerns (partitioning, RLS) are
 * exercised in CI integration runs.
 */

interface FakeRow {
  id: string;
  occurred_at_utc: Date;
  tenant_id: string;
  site_id: string;
  tank_id: string;
  event_type: string;
  liters_delta: string;
  operational_day_id: string;
  source_reference: Record<string, unknown>;
  created_by: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  cost_per_liter_minor_units: string | null;
  currency: string | null;
  created_at_utc: Date;
}

class FakeFuelTable {
  rows: FakeRow[] = [];

  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('SELECT row_hash')) {
      const [tenantId] = params as [string];
      const matching = this.rows
        .filter((r) => r.tenant_id === tenantId)
        .sort(
          (a, b) =>
            b.occurred_at_utc.getTime() - a.occurred_at_utc.getTime() ||
            b.id.localeCompare(a.id),
        );
      return matching.length === 0 ? [] : [{ row_hash: matching[0].row_hash }];
    }

    if (normalized.startsWith('INSERT INTO fuel_tank_event')) {
      const [
        id, tenantId, siteId, tankId, eventType, litersDelta,
        operationalDayId, sourceReference,
        occurredAtUtc, createdBy, prevHash, rowHash,
        costPerLiterMinorUnits, currency,
      ] = params as [
        string, string, string, string, string, string,
        string, string,
        Date, string, Buffer, Buffer,
        string | null, string | null,
      ];
      const row: FakeRow = {
        id, tenant_id: tenantId, site_id: siteId, tank_id: tankId,
        event_type: eventType, liters_delta: litersDelta,
        operational_day_id: operationalDayId,
        source_reference: JSON.parse(sourceReference),
        occurred_at_utc: occurredAtUtc, created_by: createdBy,
        prev_hash: prevHash, row_hash: rowHash,
        cost_per_liter_minor_units: costPerLiterMinorUnits,
        currency,
        created_at_utc: new Date(),
      };
      this.rows.push(row);
      return [row];
    }

    return [];
  }
}

class FakeDataSource {
  table = new FakeFuelTable();
  async transaction<T>(cb: (em: FakeFuelTable) => Promise<T>): Promise<T> {
    return cb(this.table);
  }
}

function makeService(): { svc: FuelTankEventService; ds: FakeDataSource; bus: EventEmitter2 } {
  const ds = new FakeDataSource();
  const bus = new EventEmitter2();
  const svc = new FuelTankEventService(ds as unknown as never, bus);
  return { svc, ds, bus };
}

function baseInput(overrides: Partial<Parameters<FuelTankEventService['append']>[0]> = {}) {
  return {
    tenantId: 't1',
    siteId: 's1',
    tankId: 'tank1',
    eventType: 'FUEL_DELIVERY_IN' as const,
    litersDelta: 500,
    operationalDayId: 'od1',
    occurredAtUtc: new Date('2026-06-01T10:00:00Z'),
    createdBy: 'u1',
    actorRole: 'CHEF_CARRIERE',
    ...overrides,
  };
}

describe('buildFuelCanonicalPayload + sha256Fuel', () => {
  it('produces deterministic bytes for identical input', () => {
    const args = {
      eventType: 'FUEL_DELIVERY_IN' as const,
      tankId: 'tank-1',
      litersDelta: 1000,
      operationalDayId: 'od-1',
      sourceReference: { supplier_bl_sha256: 'abc' },
      occurredAtUtc: new Date('2026-06-01T10:00:00Z'),
      costPerLiterMinorUnits: 75000n,
      currency: 'XOF',
    };
    const a = buildFuelCanonicalPayload(args);
    const b = buildFuelCanonicalPayload(args);
    expect(a.equals(b)).toBe(true);
  });

  it('sha256Fuel of (genesis || payload) is stable and 32 bytes', () => {
    const payload = Buffer.from('test-fuel', 'utf8');
    const h1 = sha256Fuel(GENESIS_PREV_HASH, payload);
    const h2 = sha256Fuel(GENESIS_PREV_HASH, payload);
    expect(h1.equals(h2)).toBe(true);
    expect(h1.length).toBe(32);
  });
});

describe('FuelTankEventService.append (CAR-01)', () => {
  it('appends 5 events (mix delivery, dispense, adjustment), each chaining to previous row_hash', async () => {
    const { svc, ds } = makeService();
    const events: Array<Parameters<FuelTankEventService['append']>[0]> = [
      baseInput({ eventType: 'FUEL_DELIVERY_IN', litersDelta: 500 }),
      baseInput({ eventType: 'FUEL_DISPENSE_OUT', litersDelta: -50, occurredAtUtc: new Date('2026-06-01T11:00:00Z') }),
      baseInput({ eventType: 'FUEL_DISPENSE_OUT', litersDelta: -30, occurredAtUtc: new Date('2026-06-01T12:00:00Z') }),
      baseInput({
        eventType: 'FUEL_ADJUSTMENT',
        litersDelta: -5,
        actorRole: 'SITE_MANAGER',
        occurredAtUtc: new Date('2026-06-01T13:00:00Z'),
        sourceReference: { gauge_photo_sha256: 'photo123', reason: 'Correction compteur' },
      }),
      baseInput({ eventType: 'FUEL_DELIVERY_IN', litersDelta: 200, occurredAtUtc: new Date('2026-06-01T14:00:00Z') }),
    ];

    for (const evt of events) {
      await svc.append(evt);
    }

    const rows = ds.table.rows.slice().sort(
      (a, b) => a.occurred_at_utc.getTime() - b.occurred_at_utc.getTime(),
    );

    expect(rows.length).toBe(5);
    expect(Buffer.from(rows[0].prev_hash).equals(GENESIS_PREV_HASH)).toBe(true);
    for (let i = 1; i < rows.length; i++) {
      expect(
        Buffer.from(rows[i].prev_hash).equals(Buffer.from(rows[i - 1].row_hash)),
      ).toBe(true);
    }
  });

  it('rejects FUEL_ADJUSTMENT without gauge_photo_sha256 (400)', async () => {
    const { svc } = makeService();
    await expect(
      svc.append(
        baseInput({
          eventType: 'FUEL_ADJUSTMENT',
          actorRole: 'SITE_MANAGER',
          sourceReference: { reason: 'Correction' },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects FUEL_ADJUSTMENT without reason (400)', async () => {
    const { svc } = makeService();
    await expect(
      svc.append(
        baseInput({
          eventType: 'FUEL_ADJUSTMENT',
          actorRole: 'SITE_MANAGER',
          sourceReference: { gauge_photo_sha256: 'photo123' },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects FUEL_ADJUSTMENT when actorRole != SITE_MANAGER (403)', async () => {
    const { svc } = makeService();
    await expect(
      svc.append(
        baseInput({
          eventType: 'FUEL_ADJUSTMENT',
          actorRole: 'CHEF_CARRIERE',
          sourceReference: { gauge_photo_sha256: 'photo123', reason: 'Correction' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('emits production.fuel.event_appended after insert', async () => {
    const { svc, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.event_appended', spy);
    await svc.append(baseInput());
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['eventType']).toBe('FUEL_DELIVERY_IN');
    expect(payload['litersDelta']).toBe(500);
  });
});
