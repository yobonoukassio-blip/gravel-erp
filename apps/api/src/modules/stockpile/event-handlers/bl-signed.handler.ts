import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StockpileEventService } from '../services/stockpile-event.service';

/**
 * Phase 3 W2-P05 cross-module handler.
 *
 * Listens to 'production.vte.bl_signed' emitted by VentesModule and creates a
 * STOCKPILE_OUTFLOW_SALE event idempotently (source_reference.bl_id key).
 *
 * StockpileModule is NOT imported by VentesModule — coupling is via EventEmitter.
 */
export interface BlSignedPayload {
  tenantId: string;
  blId: string;
  stockpileId: string;
  calibreCode: string;
  tonnageKg: string;
  contentSha256: string;
  signedAtUtc: string;
}

@Injectable()
export class BlSignedHandler {
  private readonly logger = new Logger(BlSignedHandler.name);

  constructor(private readonly stockpileEvents: StockpileEventService) {}

  @OnEvent('production.vte.bl_signed')
  async handle(payload: BlSignedPayload): Promise<void> {
    try {
      await this.stockpileEvents.append({
        tenantId: payload.tenantId,
        siteId: '',
        stockpileId: payload.stockpileId,
        eventType: 'STOCKPILE_OUTFLOW_SALE',
        tonnageDeltaKg: -BigInt(Math.round(Number(payload.tonnageKg) * 1000)) / 1000n,
        materialType: 'granite_brut',
        calibreCode: payload.calibreCode,
        operationalDayId: '',
        sourceReference: { bl_id: payload.blId, content_sha256: payload.contentSha256 },
        occurredAtUtc: new Date(payload.signedAtUtc),
        createdBy: 'system',
        actorRole: 'VTE_BL_HANDLER',
        costPerTonMinorUnits: null,
        currency: null,
      });
    } catch (err) {
      this.logger.error(
        `bl_signed → STOCKPILE_OUTFLOW_SALE failed for BL ${payload.blId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
