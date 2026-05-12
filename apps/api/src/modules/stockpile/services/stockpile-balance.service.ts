import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { StockpileValuationService } from './stockpile-valuation.service';
import { StockpileThresholdService } from './stockpile-threshold.service';
import { StockpileEventType } from '../entities/stockpile-event.entity';

export interface ApplyEventInput {
  tenantId: string;
  siteId: string;
  stockpileId: string;
  calibreCode: string;
  eventType: StockpileEventType;
  tonnageDeltaKg: bigint;
  costPerTonMinorUnits?: bigint | null;
  currency?: string | null;
  eventId: string;
}

export interface ApplyEventResult {
  oldBalanceKg: bigint;
  newBalanceKg: bigint;
  weightedAvgCostPerTonMinorUnits: bigint;
}

interface BalanceRow {
  tenant_id: string;
  stockpile_id: string;
  calibre_code: string;
  site_id: string;
  balance_kg: string;
  weighted_avg_cost_per_ton_minor_units: string;
  currency: string | null;
}

/**
 * StockpileBalanceService — applies events to the materialized projection.
 *
 * Listens via `StockpileProjectionHandler` (event-handlers/) to
 * `production.stockpile.event_appended` and applies the delta atomically:
 *   - SELECT FOR UPDATE on the (tenant, stockpile, calibre) row
 *   - balance_kg += tonnage_delta_kg
 *   - on INFLOW: recompute weighted_avg via StockpileValuationService
 *   - UPSERT, return { oldBalanceKg, newBalanceKg }
 *
 * Then delegates threshold-crossing check to StockpileThresholdService.
 */
@Injectable()
export class StockpileBalanceService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly valuation: StockpileValuationService,
    private readonly thresholds: StockpileThresholdService,
    private readonly events: EventEmitter2,
  ) {}

  async applyEvent(input: ApplyEventInput): Promise<ApplyEventResult> {
    const result = await this.ds.transaction(async (em) => this.applyEventInTx(em, input));

    // Crossing check + alert emission outside the projection tx — the
    // projection row is already committed, so a downstream notification
    // failure cannot roll back inventory state.
    await this.thresholds.checkCrossing({
      tenantId: input.tenantId,
      siteId: input.siteId,
      stockpileId: input.stockpileId,
      calibreCode: input.calibreCode,
      oldBalanceKg: result.oldBalanceKg,
      newBalanceKg: result.newBalanceKg,
    });

    return result;
  }

  /**
   * Full recompute by replaying every event for a (tenant, stockpile, calibre)
   * — used by the nightly drift-detection job.
   */
  async recomputeFromEvents(
    tenantId: string,
    stockpileId: string,
    calibreCode: string,
  ): Promise<bigint> {
    const rows = (await this.ds.query(
      `SELECT COALESCE(SUM(tonnage_delta_kg), 0)::text AS total
         FROM stockpile_event
        WHERE tenant_id = $1 AND stockpile_id = $2 AND calibre_code = $3`,
      [tenantId, stockpileId, calibreCode],
    )) as Array<{ total: string }>;
    return BigInt(rows[0]?.total ?? '0');
  }

  private async applyEventInTx(em: EntityManager, input: ApplyEventInput): Promise<ApplyEventResult> {
    const rows = (await em.query(
      `SELECT tenant_id, stockpile_id, calibre_code, site_id,
              balance_kg, weighted_avg_cost_per_ton_minor_units, currency
         FROM stockpile_balance
        WHERE tenant_id = $1 AND stockpile_id = $2 AND calibre_code = $3
        FOR UPDATE`,
      [input.tenantId, input.stockpileId, input.calibreCode],
    )) as BalanceRow[];

    const oldBalanceKg = rows.length > 0 ? BigInt(rows[0].balance_kg) : 0n;
    const oldAvg =
      rows.length > 0 ? BigInt(rows[0].weighted_avg_cost_per_ton_minor_units) : 0n;
    const newBalanceKg = oldBalanceKg + input.tonnageDeltaKg;

    let newAvg = oldAvg;
    let newCurrency = rows.length > 0 ? rows[0].currency : null;
    if (input.eventType === 'STOCKPILE_INFLOW' && input.tonnageDeltaKg > 0n) {
      newAvg = this.valuation.computeWeightedAverage({
        oldAvgMinorUnits: oldAvg,
        oldBalanceKg,
        newCostPerTonMinorUnits: input.costPerTonMinorUnits ?? 0n,
        newInflowKg: input.tonnageDeltaKg,
      });
      newCurrency = input.currency ?? newCurrency;
    }

    if (rows.length === 0) {
      await em.query(
        `INSERT INTO stockpile_balance
           (tenant_id, site_id, stockpile_id, calibre_code,
            balance_kg, last_event_id, last_refresh_utc,
            weighted_avg_cost_per_ton_minor_units, currency)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8)`,
        [
          input.tenantId,
          input.siteId,
          input.stockpileId,
          input.calibreCode,
          newBalanceKg.toString(),
          input.eventId,
          newAvg.toString(),
          newCurrency,
        ],
      );
    } else {
      await em.query(
        `UPDATE stockpile_balance
            SET balance_kg = $4,
                last_event_id = $5,
                last_refresh_utc = now(),
                weighted_avg_cost_per_ton_minor_units = $6,
                currency = $7
          WHERE tenant_id = $1 AND stockpile_id = $2 AND calibre_code = $3`,
        [
          input.tenantId,
          input.stockpileId,
          input.calibreCode,
          newBalanceKg.toString(),
          input.eventId,
          newAvg.toString(),
          newCurrency,
        ],
      );
    }

    return {
      oldBalanceKg,
      newBalanceKg,
      weightedAvgCostPerTonMinorUnits: newAvg,
    };
  }
}
