import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * BalanceRecomputeJob — nightly drift detector (STK-01 / STK-02).
 *
 * Runs at 03:00 site-tz (UTC scheduler for v1 — per-site TZ added Phase 4
 * when consolidation engine lands). For every (tenant, stockpile, calibre)
 * row in stockpile_balance:
 *   1. Recompute by summing tonnage_delta_kg from stockpile_event
 *   2. Compare to projected balance_kg
 *   3. If |diff| > 1_000 (1 kg in grams... here BIGINT kg, so threshold = 1)
 *      emit `production.stockpile.balance_drift_detected`
 *
 * Drift > 1 kg signals projection corruption (lost event, double-apply,
 * chain-of-hash gap) → ops attention.
 *
 * Threshold is configurable; default 1 kg matches plan acceptance.
 */
export interface BalanceDriftDetectedEvent {
  tenantId: string;
  stockpileId: string;
  calibreCode: string;
  projectedBalanceKg: string;
  computedBalanceKg: string;
  diffKg: string;
  detectedAtUtc: string;
}

interface BalanceProjectionRow {
  tenant_id: string;
  stockpile_id: string;
  calibre_code: string;
  balance_kg: string;
}

interface SumRow {
  total: string;
}

@Injectable()
export class BalanceRecomputeJob {
  private readonly logger = new Logger(BalanceRecomputeJob.name);
  private static readonly DRIFT_THRESHOLD_KG = 1n;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /** Cron: 03:00 UTC daily — phase 2 single-TZ scheduler. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDaily(): Promise<void> {
    this.logger.log('Starting nightly stockpile balance drift detection');
    const drifts = await this.detectDrifts();
    if (drifts > 0) {
      this.logger.warn(`Detected ${drifts} stockpile balance drift(s)`);
    } else {
      this.logger.log('No stockpile balance drift detected');
    }
  }

  /**
   * Detect drifts across every projection row.
   * Returns the number of drift events emitted.
   */
  async detectDrifts(): Promise<number> {
    const projections = (await this.ds.query(
      `SELECT tenant_id, stockpile_id, calibre_code, balance_kg
         FROM stockpile_balance`,
    )) as BalanceProjectionRow[];

    let count = 0;
    for (const row of projections) {
      const sums = (await this.ds.query(
        `SELECT COALESCE(SUM(tonnage_delta_kg), 0)::text AS total
           FROM stockpile_event
          WHERE tenant_id = $1 AND stockpile_id = $2 AND calibre_code = $3`,
        [row.tenant_id, row.stockpile_id, row.calibre_code],
      )) as SumRow[];

      const computed = BigInt(sums[0]?.total ?? '0');
      const projected = BigInt(row.balance_kg);
      const diff = computed - projected;
      const absDiff = diff < 0n ? -diff : diff;

      if (absDiff > BalanceRecomputeJob.DRIFT_THRESHOLD_KG) {
        const payload: BalanceDriftDetectedEvent = {
          tenantId: row.tenant_id,
          stockpileId: row.stockpile_id,
          calibreCode: row.calibre_code,
          projectedBalanceKg: projected.toString(),
          computedBalanceKg: computed.toString(),
          diffKg: diff.toString(),
          detectedAtUtc: new Date().toISOString(),
        };
        this.events.emit('production.stockpile.balance_drift_detected', payload);
        this.logger.warn(
          `balance_drift_detected stockpile=${row.stockpile_id} calibre=${row.calibre_code} diff=${diff}`,
        );
        count++;
      }
    }
    return count;
  }
}
