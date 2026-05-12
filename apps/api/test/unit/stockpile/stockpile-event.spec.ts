import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  buildCanonicalPayload,
  GENESIS_PREV_HASH,
  sha256,
  StockpileEventService,
} from '../../../src/modules/stockpile/services/stockpile-event.service';
import {
  StockpileController,
} from '../../../src/modules/stockpile/controllers/stockpile.controller';

/**
 * StockpileEventService unit tests — STK-01 (chain-of-hash + role guards).
 *
 * Uses a fake DataSource that emulates the partitioned table behavior
 * sufficiently for chain semantics. Postgres-specific concerns
 * (partitioning, RLS, jsonb cast) are exercised in CI integration runs.
 */

interface FakeRow {
  id: string;
  occurred_at_utc: Date;
  tenant_id: string;
  site_id: string;
  stockpile_id: string;
  event_type: string;
  tonnage_delta_kg: string;
  material_type: string;
  calibre_code: string;
  operational_day_id: string;
  source_reference: Record<string, unknown>;
  created_by: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  cost_per_ton_minor_units: string | null;
  currency: string | null;
  cost_model_version: number;
  created_at_utc: Date;
}

class FakePartitionedTable {
  rows: FakeRow[] = [];

  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('SELECT id, occurred_at_utc')) {
      // Idempotency lookup by tenant + rotation_id.
      const [tenantId, rotationId] = params as [string, string];
      const match = this.rows.find(
        (r) =>
          r.tenant_id === tenantId &&
          (r.source_reference as Record<string, unknown>)['rotation_id'] === rotationId,
      );
      return match ? [match] : [];
    }

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

    if (normalized.startsWith('INSERT INTO stockpile_event')) {
      const [
        id,
        tenantId,
        siteId,
        stockpileId,
        eventType,
        tonnageDeltaKg,
        materialType,
        calibreCode,
        operationalDayId,
        sourceReference,
        occurredAtUtc,
        createdBy,
        prevHash,
        rowHash,
        costPerTonMinorUnits,
        currency,
        costModelVersion,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        Date,
        string,
        Buffer,
        Buffer,
        string | null,
        string | null,
        number,
      ];
      const row: FakeRow = {
        id,
        tenant_id: tenantId,
        site_id: siteId,
        stockpile_id: stockpileId,
        event_type: eventType,
        tonnage_delta_kg: tonnageDeltaKg,
        material_type: materialType,
        calibre_code: calibreCode,
        operational_day_id: operationalDayId,
        source_reference: JSON.parse(sourceReference),
        occurred_at_utc: occurredAtUtc,
        created_by: createdBy,
        prev_hash: prevHash,
        row_hash: rowHash,
        cost_per_ton_minor_units: costPerTonMinorUnits,
        currency,
        cost_model_version: costModelVersion,
        created_at_utc: new Date(),
      };
      this.rows.push(row);
      return [row];
    }

    return [];
  }
}

class FakeDataSource {
  table = new FakePartitionedTable();
  async transaction<T>(cb: (em: FakePartitionedTable) => Promise<T>): Promise<T> {
    return cb(this.table);
  }
}

function makeService(): { svc: StockpileEventService; ds: FakeDataSource; bus: EventEmitter2 } {
  const ds = new FakeDataSource();
  const bus = new EventEmitter2();
  // Cast through unknown — we only exercise the surface the service touches.
  const svc = new StockpileEventService(ds as unknown as never, bus);
  return { svc, ds, bus };
}

function baseInput(overrides: Partial<Parameters<StockpileEventService['append']>[0]> = {}) {
  return {
    tenantId: 't1',
    siteId: 's1',
    stockpileId: 'sp1',
    eventType: 'STOCKPILE_INFLOW' as const,
    tonnageDeltaKg: 1000n,
    materialType: 'granite_brut' as const,
    calibreCode: '0-31_5',
    operationalDayId: 'od1',
    occurredAtUtc: new Date('2026-06-01T10:00:00Z'),
    createdBy: 'u1',
    actorRole: 'CHEF_CARRIERE',
    ...overrides,
  };
}

describe('buildCanonicalPayload + sha256', () => {
  it('produces deterministic bytes for identical input', () => {
    const args = {
      eventType: 'STOCKPILE_INFLOW' as const,
      stockpileId: 'sp-1',
      tonnageDeltaKg: 1234n,
      materialType: 'granite_brut' as const,
      calibreCode: '0-31_5',
      operationalDayId: 'od-1',
      sourceReference: { rotation_id: 'r1' },
      occurredAtUtc: new Date('2026-06-01T10:00:00Z'),
    };
    const a = buildCanonicalPayload(args);
    const b = buildCanonicalPayload(args);
    expect(a.equals(b)).toBe(true);
  });

  it('sha256 of (genesis || payload) is stable', () => {
    const payload = Buffer.from('hello', 'utf8');
    const h1 = sha256(GENESIS_PREV_HASH, payload);
    const h2 = sha256(GENESIS_PREV_HASH, payload);
    expect(h1.equals(h2)).toBe(true);
    expect(h1.length).toBe(32);
  });
});

describe('StockpileEventService.append (STK-01)', () => {
  it('appends 5 events, each chaining to previous row_hash', async () => {
    const { svc, ds } = makeService();
    for (let i = 0; i < 5; i++) {
      await svc.append(
        baseInput({
          tonnageDeltaKg: BigInt(1000 + i),
          occurredAtUtc: new Date(Date.UTC(2026, 5, 1, 10, i, 0)),
          sourceReference: { idx: i },
        }),
      );
    }
    const rows = ds.table.rows.slice().sort((a, b) =>
      a.occurred_at_utc.getTime() - b.occurred_at_utc.getTime(),
    );
    expect(rows.length).toBe(5);
    expect(Buffer.from(rows[0].prev_hash).equals(GENESIS_PREV_HASH)).toBe(true);
    for (let i = 1; i < rows.length; i++) {
      expect(Buffer.from(rows[i].prev_hash).equals(Buffer.from(rows[i - 1].row_hash))).toBe(
        true,
      );
    }
  });

  it('rejects STOCKPILE_ADJUSTMENT when actorRole != SITE_MANAGER (403)', async () => {
    const { svc } = makeService();
    await expect(
      svc.append(
        baseInput({
          eventType: 'STOCKPILE_ADJUSTMENT',
          actorRole: 'CHEF_CARRIERE',
          sourceReference: { reason: 'recompte', photo_sha256: 'abcd' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects STOCKPILE_ADJUSTMENT without photo_sha256 (400)', async () => {
    const { svc } = makeService();
    await expect(
      svc.append(
        baseInput({
          eventType: 'STOCKPILE_ADJUSTMENT',
          actorRole: 'SITE_MANAGER',
          sourceReference: { reason: 'recompte' },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('emits production.stockpile.event_appended after insert', async () => {
    const { svc, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.stockpile.event_appended', spy);
    await svc.append(baseInput());
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0];
    expect(payload.eventType).toBe('STOCKPILE_INFLOW');
    expect(payload.tonnageDeltaKg).toBe(1000n);
  });

  it('idempotency: re-publishing same rotation_id returns existing row (no duplicate insert)', async () => {
    const { svc, ds } = makeService();
    await svc.append(baseInput({ sourceReference: { rotation_id: 'rot-1' } }));
    await svc.append(baseInput({ sourceReference: { rotation_id: 'rot-1' } }));
    expect(ds.table.rows.length).toBe(1);
  });
});

describe('StockpileController (append-only contract)', () => {
  it('PATCH/DELETE → 405', () => {
    // The framework would route HTTP verbs to rejectMutation via @All.
    // Direct invocation reproduces the 405 throw.
    const ctrl = new StockpileController({} as never);
    expect(() => ctrl.rejectMutation('any-id')).toThrow(/append-only/i);
  });
});
