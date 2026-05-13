import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Configurable anomaly multipliers (per-site overrides planned Phase 4). */
export const ANOMALY_HIGH_MULTIPLIER = 1.5;
export const ANOMALY_LOW_MULTIPLIER = 0.4;

export interface AnomalyDetectedPayload {
  tenantId: string;
  siteId: string;
  equipmentId: string;
  ratio7d: number;
  median30d: number;
  severity: 'high' | 'low';
  detectedAtUtc: string;
}

interface ConsumptionRow {
  liters: string;
  hours_since_previous: string | null;
}

interface MedianRow {
  median_ratio: string | null;
}

/**
 * FuelAnomalyService (CAR-03) — L/h rolling-window anomaly detection.
 *
 * Algorithm:
 *   ratio_7d = sum(liters) / sum(hours_since_previous) over last 7 days
 *   median_30d = percentile_cont(0.5) over individual (liters/hours) ratios
 *                in the 30 days preceding the 7-day window
 *
 *   If ratio_7d > 1.5 × median_30d → anomaly high (excess consumption)
 *   If ratio_7d < 0.4 × median_30d → anomaly low (suspiciously low, e.g. siphoning)
 *
 * Emits `production.fuel.anomaly_detected` consumed by AlertsEventHandlers (W0).
 */
@Injectable()
export class FuelAnomalyService {
  private readonly logger = new Logger(FuelAnomalyService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Compute rolling 7d L/h ratio for the equipment and compare to 30d median.
   * Returns true if anomaly was detected and event emitted.
   */
  async computeAndDetect(tenantId: string, siteId: string, equipmentId: string): Promise<boolean> {
    const now = new Date();
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoff37d = new Date(now.getTime() - 37 * 24 * 60 * 60 * 1000);

    // Rolling 7d sum of liters and hours
    const rows7d = (await this.ds.query(
      `SELECT liters, hours_since_previous
         FROM equipment_fuel_consumption
        WHERE tenant_id = $1
          AND equipment_id = $2
          AND hours_since_previous IS NOT NULL
          AND hours_since_previous > 0
          AND created_at_utc >= $3`,
      [tenantId, equipmentId, cutoff7d.toISOString()],
    )) as ConsumptionRow[];

    if (rows7d.length === 0) return false;

    const totalLiters7d = rows7d.reduce((s, r) => s + parseFloat(r.liters), 0);
    const totalHours7d = rows7d.reduce(
      (s, r) => s + parseFloat(r.hours_since_previous!),
      0,
    );

    if (totalHours7d === 0) return false;

    const ratio7d = totalLiters7d / totalHours7d;

    // 30d median (days -37 to -7 relative to now, i.e. preceding the 7-day window)
    const medianRows = (await this.ds.query(
      `SELECT percentile_cont(0.5) WITHIN GROUP (
                ORDER BY liters / NULLIF(hours_since_previous, 0)
              )::text AS median_ratio
         FROM equipment_fuel_consumption
        WHERE tenant_id = $1
          AND equipment_id = $2
          AND hours_since_previous IS NOT NULL
          AND hours_since_previous > 0
          AND created_at_utc >= $3
          AND created_at_utc < $4`,
      [tenantId, equipmentId, cutoff37d.toISOString(), cutoff7d.toISOString()],
    )) as MedianRow[];

    const medianStr = medianRows[0]?.median_ratio;
    if (!medianStr) return false;

    const median30d = parseFloat(medianStr);
    if (median30d === 0) return false;

    const isHigh = ratio7d > ANOMALY_HIGH_MULTIPLIER * median30d;
    const isLow = ratio7d < ANOMALY_LOW_MULTIPLIER * median30d;

    if (!isHigh && !isLow) return false;

    const payload: AnomalyDetectedPayload = {
      tenantId,
      siteId,
      equipmentId,
      ratio7d: Math.round(ratio7d * 100) / 100,
      median30d: Math.round(median30d * 100) / 100,
      severity: isHigh ? 'high' : 'low',
      detectedAtUtc: now.toISOString(),
    };

    this.events.emit('production.fuel.anomaly_detected', payload);
    this.logger.warn(
      `Fuel anomaly detected: equipment=${equipmentId} ratio7d=${ratio7d.toFixed(2)} ` +
      `median30d=${median30d.toFixed(2)} severity=${payload.severity}`,
    );

    return true;
  }
}
