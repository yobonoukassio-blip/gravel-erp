import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * TF (Taux de Fréquence) formula constant.
 * TF = (accidents_with_lost_time × 1_000_000) / hours_worked
 * Per OHADA / ILO standard: normalized per million hours worked.
 */
export const TF_NORMALIZATION_FACTOR = 1_000_000;

/** Hours per worker per day (standard 8-hour shift). */
export const HOURS_PER_WORKER_PER_DAY = 8;

/** Rolling window length in days. */
export const ROLLING_WINDOW_DAYS = 365;

export type TfMode = 'rolling_12m' | 'since_launch';

export interface TfResult {
  /** Taux de fréquence — NaN if hours_worked = 0. */
  tf: number;
  tf_rolling_12_months?: number;
  tf_since_launch?: number;
  hours_worked: number;
  accidents_with_lost_time: number;
  period_start: Date;
  period_end: Date;
  /** Mode indicates whether a full 12-month window was available. */
  mode: TfMode;
  note?: string;
}

/**
 * TfCalculatorService (HSE-06, D2-65).
 *
 * TF = (incidents_with_lost_time × 1_000_000) / hours_worked
 *
 * Phase 2 proxy for hours_worked:
 *   hours_worked = SUM(operational_day.workforce_headcount * 8h)
 *   over the rolling 12-month window (or since-launch if < 365 days available).
 *
 * "incident_with_lost_time" = HseIncident WHERE
 *   EXISTS (SELECT 1 FROM jsonb_array_elements(people_impacted) p
 *            WHERE (p->>'lost_time_h')::numeric > 0)
 *
 * Returns mode='since_launch' with a note when fewer than 365 days of data exist.
 */
@Injectable()
export class TfCalculatorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async compute(siteId: string, tenantId: string, asOf?: Date): Promise<TfResult> {
    const periodEnd = asOf ?? new Date();
    const rollingStart = new Date(periodEnd);
    rollingStart.setDate(rollingStart.getDate() - ROLLING_WINDOW_DAYS);

    // Determine the earliest available operational_day for this site.
    const launchRows = (await this.ds.query(
      `SELECT MIN(day_date) AS launch_date
         FROM operational_day
        WHERE site_id = $1 AND tenant_id = $2 AND workforce_headcount IS NOT NULL`,
      [siteId, tenantId],
    )) as Array<{ launch_date: string | null }>;

    const launchDate = launchRows[0]?.launch_date
      ? new Date(launchRows[0].launch_date)
      : rollingStart;

    const availableDays = Math.floor(
      (periodEnd.getTime() - launchDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const mode: TfMode = availableDays >= ROLLING_WINDOW_DAYS ? 'rolling_12m' : 'since_launch';
    const periodStart = mode === 'rolling_12m' ? rollingStart : launchDate;

    // Sum hours worked over the window.
    const hoursRows = (await this.ds.query(
      `SELECT COALESCE(SUM(workforce_headcount * $3), 0) AS total_hours
         FROM operational_day
        WHERE site_id = $1
          AND tenant_id = $2
          AND workforce_headcount IS NOT NULL
          AND day_date >= $4
          AND day_date < $5`,
      [siteId, tenantId, HOURS_PER_WORKER_PER_DAY, periodStart, periodEnd],
    )) as Array<{ total_hours: string }>;

    const hoursWorked = Number(hoursRows[0].total_hours);

    // Count incidents with at least one person with lost_time_h > 0.
    const lostTimeRows = (await this.ds.query(
      `SELECT COUNT(*) AS cnt
         FROM hse_incident
        WHERE site_id = $1
          AND tenant_id = $2
          AND occurred_at_utc >= $3
          AND occurred_at_utc < $4
          AND EXISTS (
            SELECT 1
              FROM jsonb_array_elements(people_impacted) AS p
             WHERE (p->>'lost_time_h')::numeric > 0
          )`,
      [siteId, tenantId, periodStart, periodEnd],
    )) as Array<{ cnt: string }>;

    const accidentsWithLostTime = Number(lostTimeRows[0].cnt);

    const tf =
      hoursWorked > 0
        ? (accidentsWithLostTime * TF_NORMALIZATION_FACTOR) / hoursWorked
        : 0;

    const result: TfResult = {
      tf,
      hours_worked: hoursWorked,
      accidents_with_lost_time: accidentsWithLostTime,
      period_start: periodStart,
      period_end: periodEnd,
      mode,
    };

    if (mode === 'rolling_12m') {
      result.tf_rolling_12_months = tf;
    } else {
      result.tf_since_launch = tf;
      result.note = `Données disponibles depuis ${availableDays} jours (fenêtre 12 mois non encore atteinte).`;
    }

    return result;
  }
}
