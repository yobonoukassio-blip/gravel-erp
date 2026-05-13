import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockpileEventService } from '../services/stockpile-event.service';

/**
 * ScreeningSessionCompletedHandler (CRI-01).
 *
 * Consumes `production.screening.session_completed` emitted by the outbox worker.
 * Iterates calibre_yields and creates one STOCKPILE_INFLOW per calibre entry.
 *
 * Idempotency — Pitfall 3 (compound key per calibre):
 *   Key = `${session_id}_${calibre_code}` (NOT just session_id).
 *   A crash mid-loop allows safe replay of remaining calibres without
 *   re-inserting already-processed ones.
 *
 *   Double defense:
 *   1. Service pre-check on `source_reference->>'screening_idempotency_key'`
 *   2. DB unique partial index `stockpile_event_screening_calibre_uq`
 */
export interface CalibreYieldPayload {
  calibre_code: string;
  output_stockpile_id: string;
  tonnage_kg: number;
  is_nonconforming: boolean;
  nonconformity_reason: string | null;
}

export interface ScreeningSessionCompletedPayload {
  session_id: string;
  tenant_id: string;
  site_id: string;
  operational_day_id: string;
  screen_id: string;
  input_tonnage_kg: number;
  calibre_yields: CalibreYieldPayload[];
  operator_id: string;
  completed_at_utc: string;
}

@Injectable()
export class ScreeningSessionCompletedHandler {
  private readonly logger = new Logger(ScreeningSessionCompletedHandler.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly stockpileEvents: StockpileEventService,
  ) {}

  @OnEvent('production.screening.session_completed')
  async handle(event: ScreeningSessionCompletedPayload): Promise<void> {
    const occurredAt = new Date(event.completed_at_utc);

    for (const yield_ of event.calibre_yields) {
      // Compound idempotency key — Pitfall 3: per-calibre, not per-session.
      const idempotencyKey = `${event.session_id}_${yield_.calibre_code}`;

      try {
        // Pre-check idempotency (service-level, defense-in-depth).
        const existing = (await this.ds.query(
          `SELECT id FROM stockpile_event
            WHERE tenant_id = $1
              AND source_reference->>'screening_idempotency_key' = $2
            LIMIT 1`,
          [event.tenant_id, idempotencyKey],
        )) as Array<{ id: string }>;

        if (existing.length > 0) {
          this.logger.debug(
            `STOCKPILE_INFLOW for screening session ${event.session_id} calibre ${yield_.calibre_code} already exists — skipping`,
          );
          continue; // This calibre already processed — try the next one.
        }

        if (!yield_.tonnage_kg || yield_.tonnage_kg <= 0) {
          this.logger.warn(
            `Screening session ${event.session_id} calibre ${yield_.calibre_code}: tonnage_kg=${yield_.tonnage_kg} — skipping zero/negative inflow`,
          );
          continue;
        }

        await this.stockpileEvents.append({
          tenantId: event.tenant_id,
          siteId: event.site_id,
          stockpileId: yield_.output_stockpile_id,
          eventType: 'STOCKPILE_INFLOW',
          tonnageDeltaKg: BigInt(yield_.tonnage_kg),
          materialType: 'granite_brut',
          calibreCode: yield_.calibre_code,
          operationalDayId: event.operational_day_id,
          sourceReference: {
            screening_idempotency_key: idempotencyKey,
            session_id: event.session_id,
            screen_id: event.screen_id,
            calibre_code: yield_.calibre_code,
            is_nonconforming: yield_.is_nonconforming,
          },
          occurredAtUtc: occurredAt,
          createdBy: event.operator_id,
          actorRole: 'SYSTEM_OUTBOX',
        });

        this.logger.log(
          `STOCKPILE_INFLOW created for screening session ${event.session_id} calibre ${yield_.calibre_code}: ${yield_.tonnage_kg} kg → stockpile ${yield_.output_stockpile_id}`,
        );
      } catch (err) {
        this.logger.error(
          `STOCKPILE_INFLOW failed for screening session ${event.session_id} calibre ${yield_.calibre_code}: ${(err as Error).message}`,
        );
        // Re-throw to let the outbox worker retry the full event.
        // Already-processed calibres have idempotency protection so replaying is safe.
        throw err;
      }
    }
  }
}
