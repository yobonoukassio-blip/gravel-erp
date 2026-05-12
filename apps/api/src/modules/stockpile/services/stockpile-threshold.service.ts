import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CheckCrossingInput {
  tenantId: string;
  siteId: string;
  stockpileId: string;
  calibreCode: string;
  oldBalanceKg: bigint;
  newBalanceKg: bigint;
}

export type ThresholdType = 'critical_low' | 'low' | 'high';

export interface ThresholdCrossedEvent {
  tenantId: string;
  siteId: string;
  stockpileId: string;
  calibreCode: string;
  thresholdType: ThresholdType;
  balanceKg: string;
  criticalLowKg: string;
  lowKg: string;
  highKg: string;
  severity: 'low' | 'high' | 'critical';
}

interface ThresholdRow {
  critical_low_kg: string;
  low_kg: string;
  high_kg: string;
}

/**
 * StockpileThresholdService — STK-02 alert emission.
 *
 * Emits `production.stockpile.threshold_crossed` only on *direction-change*
 * crossings (not on every subsequent event while below). Dedupe model:
 *   - old > low AND new <= low      → emit 'low'
 *   - old > critical_low AND new <= critical_low → emit 'critical_low' (severity=critical)
 *   - old < high AND new >= high    → emit 'high'
 *
 * Subsequent events that stay on the same side of the threshold do not re-emit.
 * This is "edge-triggered" semantics, which the projection handler enforces
 * by always passing oldBalance/newBalance from a single SELECT FOR UPDATE step.
 */
@Injectable()
export class StockpileThresholdService {
  private readonly logger = new Logger(StockpileThresholdService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  async checkCrossing(input: CheckCrossingInput): Promise<void> {
    const rows = (await this.ds.query(
      `SELECT critical_low_kg, low_kg, high_kg
         FROM stockpile_threshold
        WHERE tenant_id = $1 AND stockpile_id = $2 AND calibre_code = $3
        LIMIT 1`,
      [input.tenantId, input.stockpileId, input.calibreCode],
    )) as ThresholdRow[];

    if (rows.length === 0) return; // No threshold configured — nothing to do.
    const criticalLow = BigInt(rows[0].critical_low_kg);
    const low = BigInt(rows[0].low_kg);
    const high = BigInt(rows[0].high_kg);

    const old = input.oldBalanceKg;
    const next = input.newBalanceKg;

    // Critical_low crossing (downward only) — emitted before 'low' if applicable
    // so subscribers know the most severe state.
    if (old > criticalLow && next <= criticalLow) {
      this.emit(input, 'critical_low', 'critical', criticalLow, low, high, next);
      return;
    }
    if (old > low && next <= low) {
      this.emit(input, 'low', 'high', criticalLow, low, high, next);
      return;
    }
    if (old < high && next >= high) {
      this.emit(input, 'high', 'low', criticalLow, low, high, next);
      return;
    }
  }

  private emit(
    input: CheckCrossingInput,
    thresholdType: ThresholdType,
    severity: 'low' | 'high' | 'critical',
    criticalLow: bigint,
    low: bigint,
    high: bigint,
    balance: bigint,
  ): void {
    const payload: ThresholdCrossedEvent = {
      tenantId: input.tenantId,
      siteId: input.siteId,
      stockpileId: input.stockpileId,
      calibreCode: input.calibreCode,
      thresholdType,
      balanceKg: balance.toString(),
      criticalLowKg: criticalLow.toString(),
      lowKg: low.toString(),
      highKg: high.toString(),
      severity,
    };
    this.logger.warn(
      `threshold_crossed [${thresholdType}/${severity}] stockpile=${input.stockpileId} balance=${balance}`,
    );
    this.events.emit('production.stockpile.threshold_crossed', payload);
  }
}
