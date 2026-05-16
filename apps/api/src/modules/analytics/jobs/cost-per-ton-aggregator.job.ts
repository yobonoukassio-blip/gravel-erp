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
 * PERF-002 (audit 2026-05-16): bounded-concurrency executor.
 * Hand-rolled, zero deps. Replaces the previous fully-sequential
 * `for (...) await ...` triple loop that saturated the event loop at scale
 * (~48s for 10 tenants × 6 sites × 8 calibres = 480 tuples sequentially).
 */
async function runWithLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue: T[] = [...items];
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

interface Tuple {
  tenantId: string;
  siteId: string;
  calibreCode: string;
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
   *
   * PERF-002: Tuple enumeration is sequential (cheap meta-queries on
   * tenants/sites/stockpile per tenant) but tuple aggregation runs with
   * bounded concurrency to keep wall-clock low on multi-tenant runs.
   */
  async runForDate(snapshotDate: string): Promise<void> {
    const start = Date.now();
    this.logger.log(
      `[CostPerTon] starting daily aggregation for ${snapshotDate}`,
    );

    // All active tenants. tenancy schema uses status='active', not is_active.
    const tenants = (await this.ds.query(
      `SELECT id FROM tenants WHERE status = 'active' AND archived_at IS NULL`,
    )) as TenantRow[];

    // Build the full (tenant × site × calibre) tuple set in one pass.
    const tuples: Tuple[] = [];
    for (const tenant of tenants) {
      try {
        const sites = (await this.ds.query(
          `SELECT id FROM sites
           WHERE tenant_id = $1 AND status = 'active' AND archived_at IS NULL`,
          [tenant.id],
        )) as SiteRow[];
        const calibres = (await this.ds.query(
          `SELECT DISTINCT calibre_code
           FROM stockpile
           WHERE tenant_id = $1 AND calibre_code IS NOT NULL`,
          [tenant.id],
        )) as CalibreRow[];
        for (const site of sites) {
          for (const calibre of calibres) {
            tuples.push({
              tenantId: tenant.id,
              siteId: site.id,
              calibreCode: calibre.calibre_code,
            });
          }
        }
      } catch (err) {
        this.logger.error(
          `tenant ${tenant.id} tuple enumeration failed: ${(err as Error).message}`,
        );
      }
    }

    let success = 0;
    let failure = 0;
    const CONCURRENCY = 10;

    await runWithLimit(tuples, CONCURRENCY, async (t) => {
      try {
        await this.aggregator.aggregateForDate({
          tenantId: t.tenantId,
          siteId: t.siteId,
          snapshotDate,
          calibreCode: t.calibreCode,
        });
        success++;
      } catch (err) {
        failure++;
        this.logger.error(
          `aggregate failed tenant=${t.tenantId} site=${t.siteId} calibre=${t.calibreCode}: ${(err as Error).message}`,
        );
      }
    });

    const elapsedMs = Date.now() - start;
    this.logger.log(
      `[CostPerTon] completed: tenants=${tenants.length} tuples=${tuples.length} success=${success} failure=${failure} elapsedMs=${elapsedMs}`,
    );
  }
}
