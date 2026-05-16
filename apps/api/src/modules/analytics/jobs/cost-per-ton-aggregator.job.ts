import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CostPerTonAggregatorService } from '../services/cost-per-ton-aggregator.service';

interface TenantRow {
  id: string;
}

interface SiteRow {
  id: string;
}

interface CalibreRow {
  calibre_code: string;
}

/**
 * CostPerTonAggregatorJob (FIN-R02).
 *
 * Runs daily at 04:00 UTC, aggregating yesterday's cost-per-ton snapshot
 * for every (tenant × site × calibre_code) tuple.
 *
 * Idempotent: CostPerTonAggregatorService uses ON CONFLICT...DO UPDATE on the
 * UNIQUE(tenant_id, site_id, snapshot_date, calibre_code) constraint, so a
 * manual re-run for the same date overwrites prior values instead of
 * duplicating rows.
 *
 * Failures for one tenant/site/calibre do not abort the rest of the run.
 */
@Injectable()
export class CostPerTonAggregatorJob {
  private readonly logger = new Logger(CostPerTonAggregatorJob.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly aggregator: CostPerTonAggregatorService,
  ) {}

  /** Cron: 04:00 UTC daily. Aggregates yesterday's data for every tenant. */
  @Cron('0 4 * * *', { name: 'cost-per-ton-daily', timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const snapshotDate = yesterday.toISOString().split('T')[0];

    await this.runForDate(snapshotDate);
  }

  /**
   * Public entry-point usable by ops scripts to re-aggregate a specific date.
   */
  async runForDate(snapshotDate: string): Promise<void> {
    this.logger.log(
      `[CostPerTon] starting daily aggregation for ${snapshotDate}`,
    );

    // All active tenants. tenancy schema uses status='active', not is_active.
    const tenants = (await this.ds.query(
      `SELECT id FROM tenants WHERE status = 'active' AND archived_at IS NULL`,
    )) as TenantRow[];

    let successCount = 0;
    let failureCount = 0;

    for (const tenant of tenants) {
      const result = await this.aggregateForTenant(tenant.id, snapshotDate);
      successCount += result.success;
      failureCount += result.failure;
    }

    this.logger.log(
      `[CostPerTon] completed: tenants=${tenants.length} success=${successCount} failure=${failureCount}`,
    );
  }

  private async aggregateForTenant(
    tenantId: string,
    snapshotDate: string,
  ): Promise<{ success: number; failure: number }> {
    let success = 0;
    let failure = 0;

    try {
      // master-data uses sites.status='active' (no is_active column).
      const sites = (await this.ds.query(
        `SELECT id FROM sites
         WHERE tenant_id = $1 AND status = 'active' AND archived_at IS NULL`,
        [tenantId],
      )) as SiteRow[];

      // Distinct calibre_codes that have produced stockpile inflows recently.
      // If a tenant has no production yet, this returns 0 rows and the job
      // is a no-op for that tenant.
      const calibres = (await this.ds.query(
        `SELECT DISTINCT calibre_code
         FROM stockpile
         WHERE tenant_id = $1 AND calibre_code IS NOT NULL`,
        [tenantId],
      )) as CalibreRow[];

      for (const site of sites) {
        for (const calibre of calibres) {
          try {
            await this.aggregator.aggregateForDate({
              tenantId,
              siteId: site.id,
              snapshotDate,
              calibreCode: calibre.calibre_code,
            });
            success++;
          } catch (err) {
            failure++;
            this.logger.error(
              `aggregate failed tenant=${tenantId} site=${site.id} calibre=${calibre.calibre_code}: ${(err as Error).message}`,
            );
          }
        }
      }
    } catch (err) {
      failure++;
      this.logger.error(
        `tenant ${tenantId} aggregation failed: ${(err as Error).message}`,
      );
    }

    return { success, failure };
  }
}
