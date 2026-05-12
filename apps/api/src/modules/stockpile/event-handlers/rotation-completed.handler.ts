import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockpileEventService } from '../services/stockpile-event.service';
import { StockpileValuationService } from '../services/stockpile-valuation.service';

/**
 * Outbox-driven inflow materializer.
 *
 * Consumes `production.transport.rotation_completed` (published by the
 * transport outbox worker in W2-P04). For each rotation, locates the
 * target stockpile by its unload-zone, computes inflow cost via the
 * valuation service (v1: carburant-only, stub if fuel module not wired),
 * and appends a STOCKPILE_INFLOW event.
 *
 * Idempotency: enforced via `source_reference.rotation_id`. The
 * StockpileEventService checks this before insert; the DB unique partial
 * index `stockpile_event_rotation_uq` is the defense-in-depth.
 *
 * Note (parallel waves): W2-P04 is in flight in parallel. We code against
 * the documented payload contract:
 *   { tenant_id, site_id, rotation_id, weighing_ticket_id,
 *     loaded_tonnage_kg, material_type, unloaded_at_zone_id,
 *     operational_day_id, occurred_at_utc, created_by }
 * Final wiring is validated post-wave via integration test.
 */
export interface RotationCompletedPayload {
  tenant_id: string;
  site_id: string;
  rotation_id: string;
  weighing_ticket_id: string;
  loaded_tonnage_kg: string | number;
  material_type: 'granite_brut' | 'tout_venant' | 'sterile';
  unloaded_at_zone_id: string;
  operational_day_id: string;
  occurred_at_utc: string | Date;
  created_by: string;
}

interface StockpileLookupRow {
  id: string;
  default_calibre_code: string;
}

@Injectable()
export class RotationCompletedHandler {
  private readonly logger = new Logger(RotationCompletedHandler.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly stockpileEvents: StockpileEventService,
    private readonly valuation: StockpileValuationService,
  ) {}

  @OnEvent('production.transport.rotation_completed')
  async handle(payload: RotationCompletedPayload): Promise<void> {
    try {
      const stockpile = await this.lookupStockpileByZone(
        payload.tenant_id,
        payload.unloaded_at_zone_id,
      );
      if (!stockpile) {
        this.logger.warn(
          `No stockpile mapped to zone ${payload.unloaded_at_zone_id} (tenant ${payload.tenant_id}) — STOCKPILE_INFLOW skipped`,
        );
        return;
      }

      const cost = await this.valuation.computeInflowCost({
        tenantId: payload.tenant_id,
        rotationId: payload.rotation_id,
        operationalDayId: payload.operational_day_id,
        loadedTonnageKg: BigInt(payload.loaded_tonnage_kg),
      });

      await this.stockpileEvents.append({
        tenantId: payload.tenant_id,
        siteId: payload.site_id,
        stockpileId: stockpile.id,
        eventType: 'STOCKPILE_INFLOW',
        tonnageDeltaKg: BigInt(payload.loaded_tonnage_kg),
        materialType: payload.material_type,
        calibreCode: stockpile.default_calibre_code,
        operationalDayId: payload.operational_day_id,
        sourceReference: {
          rotation_id: payload.rotation_id,
          weighing_ticket_id: payload.weighing_ticket_id,
        },
        occurredAtUtc:
          payload.occurred_at_utc instanceof Date
            ? payload.occurred_at_utc
            : new Date(payload.occurred_at_utc),
        createdBy: payload.created_by,
        actorRole: 'SYSTEM_OUTBOX',
        costPerTonMinorUnits: cost.costPerTonMinorUnits,
        currency: cost.currency,
      });
    } catch (err) {
      this.logger.error(
        `STOCKPILE_INFLOW materialization failed for rotation ${payload.rotation_id}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  private async lookupStockpileByZone(
    tenantId: string,
    zoneId: string,
  ): Promise<StockpileLookupRow | null> {
    const rows = (await this.ds.query(
      `SELECT id, default_calibre_code
         FROM stockpile
        WHERE tenant_id = $1 AND zone_id = $2
        LIMIT 1`,
      [tenantId, zoneId],
    )) as StockpileLookupRow[];
    return rows.length > 0 ? rows[0] : null;
  }
}
