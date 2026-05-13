import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockpileEventService } from '../services/stockpile-event.service';

/**
 * CrusherSessionCompletedHandler (CON-01).
 *
 * Consumes `production.crusher.session_completed` emitted by the outbox worker.
 * Creates one STOCKPILE_INFLOW in the event-sourced stockpile ledger.
 *
 * Idempotency (double defense — ADR-0013):
 *   1. Service pre-check: query `source_reference->>'crusher_session_id'` before insert
 *   2. DB unique partial index: `stockpile_event_crusher_session_uq`
 *
 * Replaying the same event is safe — the handler returns early if the inflow
 * already exists. Concurrent replays are handled by the DB partial unique index
 * which will reject the second insert with a unique constraint violation.
 */
export interface CrusherSessionCompletedPayload {
  session_id: string;
  tenant_id: string;
  site_id: string;
  operational_day_id: string;
  crusher_id: string;
  output_stockpile_id: string;
  output_tonnage_kg: number;
  input_tonnage_kg: number;
  material_type: string;
  calibre_code: string;
  energy_kwh: number;
  operator_id: string;
  completed_at_utc: string;
}

@Injectable()
export class CrusherSessionCompletedHandler {
  private readonly logger = new Logger(CrusherSessionCompletedHandler.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly stockpileEvents: StockpileEventService,
  ) {}

  @OnEvent('production.crusher.session_completed')
  async handle(event: CrusherSessionCompletedPayload): Promise<void> {
    try {
      // Pre-check idempotency (service-level defense-in-depth).
      const existing = (await this.ds.query(
        `SELECT id FROM stockpile_event
          WHERE tenant_id = $1
            AND source_reference->>'crusher_session_id' = $2
          LIMIT 1`,
        [event.tenant_id, event.session_id],
      )) as Array<{ id: string }>;

      if (existing.length > 0) {
        this.logger.debug(
          `STOCKPILE_INFLOW for crusher session ${event.session_id} already exists — skipping replay`,
        );
        return;
      }

      if (!event.output_tonnage_kg || event.output_tonnage_kg <= 0) {
        this.logger.warn(
          `Crusher session ${event.session_id} has output_tonnage_kg=${event.output_tonnage_kg} — skipping zero/negative inflow`,
        );
        return;
      }

      await this.stockpileEvents.append({
        tenantId: event.tenant_id,
        siteId: event.site_id,
        stockpileId: event.output_stockpile_id,
        eventType: 'STOCKPILE_INFLOW',
        tonnageDeltaKg: BigInt(event.output_tonnage_kg),
        materialType: event.material_type as Parameters<typeof this.stockpileEvents.append>[0]['materialType'],
        calibreCode: event.calibre_code,
        operationalDayId: event.operational_day_id,
        sourceReference: {
          crusher_session_id: event.session_id,
          crusher_id: event.crusher_id,
          operator_id: event.operator_id,
        },
        occurredAtUtc: new Date(event.completed_at_utc),
        createdBy: event.operator_id,
        actorRole: 'SYSTEM_OUTBOX',
      });

      this.logger.log(
        `STOCKPILE_INFLOW created for crusher session ${event.session_id}: ${event.output_tonnage_kg} kg → stockpile ${event.output_stockpile_id}`,
      );
    } catch (err) {
      this.logger.error(
        `STOCKPILE_INFLOW failed for crusher session ${event.session_id}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
