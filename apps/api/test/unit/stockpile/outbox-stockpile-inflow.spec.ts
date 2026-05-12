import { EventEmitter2 } from '@nestjs/event-emitter';
import { StockpileEventService } from '../../../src/modules/stockpile/services/stockpile-event.service';
import { StockpileValuationService } from '../../../src/modules/stockpile/services/stockpile-valuation.service';
import { RotationCompletedHandler } from '../../../src/modules/stockpile/event-handlers/rotation-completed.handler';

/**
 * Task 2 spec — outbox rotation.completed → STOCKPILE_INFLOW.
 *
 * Replays the documented W2-P04 payload contract through the handler and
 * asserts:
 *  - one stockpile_event row created with type=STOCKPILE_INFLOW
 *  - tonnage_delta_kg = loaded_tonnage_kg
 *  - source_reference.rotation_id is set
 *  - duplicate publish does NOT create a second row (idempotency)
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

class FakeDb {
  events: FakeRow[] = [];
  stockpiles: Array<{ id: string; tenant_id: string; zone_id: string; default_calibre_code: string }> = [];

  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT id, default_calibre_code FROM stockpile')) {
      const [tenantId, zoneId] = params as [string, string];
      const m = this.stockpiles.find(
        (sp) => sp.tenant_id === tenantId && sp.zone_id === zoneId,
      );
      return m ? [{ id: m.id, default_calibre_code: m.default_calibre_code }] : [];
    }

    if (s.startsWith('SELECT id, occurred_at_utc')) {
      const [tenantId, rotationId] = params as [string, string];
      const m = this.events.find(
        (e) =>
          e.tenant_id === tenantId &&
          (e.source_reference as Record<string, unknown>)['rotation_id'] === rotationId,
      );
      return m ? [m] : [];
    }

    if (s.startsWith('SELECT row_hash')) {
      const [tenantId] = params as [string];
      const matching = this.events
        .filter((e) => e.tenant_id === tenantId)
        .sort(
          (a, b) =>
            b.occurred_at_utc.getTime() - a.occurred_at_utc.getTime() ||
            b.id.localeCompare(a.id),
        );
      return matching.length === 0 ? [] : [{ row_hash: matching[0].row_hash }];
    }

    if (s.startsWith('INSERT INTO stockpile_event')) {
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
      this.events.push(row);
      return [row];
    }

    return [];
  }

  async transaction<T>(cb: (em: FakeDb) => Promise<T>): Promise<T> {
    return cb(this);
  }
}

describe('RotationCompletedHandler (Task 2)', () => {
  it('materializes STOCKPILE_INFLOW for a rotation_completed event', async () => {
    const db = new FakeDb();
    db.stockpiles.push({
      id: 'sp-1',
      tenant_id: 't1',
      zone_id: 'zone-1',
      default_calibre_code: '0-31_5',
    });

    const svc = new StockpileEventService(db as unknown as never, new EventEmitter2());
    const valuation = new StockpileValuationService();
    const handler = new RotationCompletedHandler(db as unknown as never, svc, valuation);

    await handler.handle({
      tenant_id: 't1',
      site_id: 's1',
      rotation_id: 'rot-1',
      weighing_ticket_id: 'wt-1',
      loaded_tonnage_kg: 12500,
      material_type: 'granite_brut',
      unloaded_at_zone_id: 'zone-1',
      operational_day_id: 'od-1',
      occurred_at_utc: '2026-06-01T10:00:00Z',
      created_by: 'system',
    });

    expect(db.events.length).toBe(1);
    expect(db.events[0].event_type).toBe('STOCKPILE_INFLOW');
    expect(db.events[0].tonnage_delta_kg).toBe('12500');
    expect((db.events[0].source_reference as Record<string, unknown>)['rotation_id']).toBe(
      'rot-1',
    );
  });

  it('is idempotent: replaying the same rotation does not create a duplicate', async () => {
    const db = new FakeDb();
    db.stockpiles.push({
      id: 'sp-1',
      tenant_id: 't1',
      zone_id: 'zone-1',
      default_calibre_code: '0-31_5',
    });

    const svc = new StockpileEventService(db as unknown as never, new EventEmitter2());
    const valuation = new StockpileValuationService();
    const handler = new RotationCompletedHandler(db as unknown as never, svc, valuation);

    const payload = {
      tenant_id: 't1',
      site_id: 's1',
      rotation_id: 'rot-1',
      weighing_ticket_id: 'wt-1',
      loaded_tonnage_kg: 12500,
      material_type: 'granite_brut' as const,
      unloaded_at_zone_id: 'zone-1',
      operational_day_id: 'od-1',
      occurred_at_utc: '2026-06-01T10:00:00Z',
      created_by: 'system',
    };

    await handler.handle(payload);
    await handler.handle(payload);

    expect(db.events.length).toBe(1);
  });

  it('skips silently when no stockpile is mapped to the unload zone', async () => {
    const db = new FakeDb();
    // No stockpile registered for zone-X.
    const svc = new StockpileEventService(db as unknown as never, new EventEmitter2());
    const valuation = new StockpileValuationService();
    const handler = new RotationCompletedHandler(db as unknown as never, svc, valuation);

    await handler.handle({
      tenant_id: 't1',
      site_id: 's1',
      rotation_id: 'rot-X',
      weighing_ticket_id: 'wt-1',
      loaded_tonnage_kg: 1000,
      material_type: 'granite_brut',
      unloaded_at_zone_id: 'zone-X',
      operational_day_id: 'od-1',
      occurred_at_utc: '2026-06-01T10:00:00Z',
      created_by: 'system',
    });

    expect(db.events.length).toBe(0);
  });
});
