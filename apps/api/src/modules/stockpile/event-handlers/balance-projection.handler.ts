import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StockpileBalanceService } from '../services/stockpile-balance.service';
import { StockpileEventType } from '../entities/stockpile-event.entity';

/**
 * BalanceProjectionHandler — listens on `production.stockpile.event_appended`
 * and applies the delta to the `stockpile_balance` materialized projection.
 *
 * Side effects (threshold crossing alerts) are emitted by the underlying
 * StockpileBalanceService.applyEvent after the projection tx commits.
 */
export interface StockpileEventAppendedPayload {
  tenantId: string;
  siteId: string;
  stockpileId: string;
  calibreCode: string;
  eventType: StockpileEventType;
  tonnageDeltaKg: bigint;
  costPerTonMinorUnits: bigint | null;
  currency: string | null;
  eventId: string;
  occurredAtUtc: Date;
}

@Injectable()
export class BalanceProjectionHandler {
  private readonly logger = new Logger(BalanceProjectionHandler.name);

  constructor(private readonly balanceService: StockpileBalanceService) {}

  @OnEvent('production.stockpile.event_appended')
  async handle(payload: StockpileEventAppendedPayload): Promise<void> {
    try {
      await this.balanceService.applyEvent({
        tenantId: payload.tenantId,
        siteId: payload.siteId,
        stockpileId: payload.stockpileId,
        calibreCode: payload.calibreCode,
        eventType: payload.eventType,
        tonnageDeltaKg: payload.tonnageDeltaKg,
        costPerTonMinorUnits: payload.costPerTonMinorUnits,
        currency: payload.currency,
        eventId: payload.eventId,
      });
    } catch (err) {
      this.logger.error(
        `stockpile_balance projection failed for event ${payload.eventId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
