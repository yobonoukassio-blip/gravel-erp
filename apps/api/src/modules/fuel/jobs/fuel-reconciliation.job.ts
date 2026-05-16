import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FuelReconciliationService } from '../services/fuel-reconciliation.service';

interface TankIdRow {
  id: string;
}

interface TenantIdRow {
  id: string;
}

/**
 * FuelReconciliationJob (CAR-01, D2-53).
 *
 * Nightly cron at 03:30 UTC (approximate site-tz — per-site TZ scheduling
 * lands Phase 4 when consolidation engine matures).
 *
 * Iterates active tenants, then per-tenant fuel tanks, and runs
 * FuelReconciliationService.runForTank.
 *
 * PERF-004 / SF-017 (audit 2026-05-16): previously `SELECT id FROM fuel_tank`
 * had NO tenant filter. Under RLS the cron returned 0 rows (no tenant
 * context in CLS); without RLS it returned tanks across all tenants
 * indiscriminately. Now enumerates tenants explicitly and queries each
 * tenant's tanks with `WHERE tenant_id = $1` — works whether or not RLS
 * is active in this code path.
 */
@Injectable()
export class FuelReconciliationJob {
  private readonly logger = new Logger(FuelReconciliationJob.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly reconciliationService: FuelReconciliationService,
  ) {}

  /** Cron: 03:30 UTC daily. */
  @Cron('30 3 * * *')
  async runNightly(): Promise<void> {
    this.logger.log('Starting nightly fuel tank reconciliation');
    const drifts = await this.reconcileAll();
    if (drifts > 0) {
      this.logger.warn(`Fuel reconciliation detected ${drifts} tank(s) with drift`);
    } else {
      this.logger.log('Fuel reconciliation complete — no significant drift');
    }
  }

  /** Returns count of tanks with drift above threshold. */
  async reconcileAll(): Promise<number> {
    const tenants = (await this.ds.query(
      `SELECT id FROM tenants WHERE status = 'active' AND archived_at IS NULL`,
    )) as TenantIdRow[];

    let drifted = 0;
    let processed = 0;

    for (const tenant of tenants) {
      try {
        const tanks = (await this.ds.query(
          `SELECT id FROM fuel_tank WHERE tenant_id = $1`,
          [tenant.id],
        )) as TankIdRow[];

        for (const tank of tanks) {
          try {
            processed++;
            const d = await this.reconciliationService.runForTank(tank.id);
            if (d) drifted++;
          } catch (err) {
            this.logger.error(
              `Reconciliation failed for tank ${tank.id} (tenant ${tenant.id})`,
              err,
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `Tank enumeration failed for tenant ${tenant.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `[FuelReconciliation] tenants=${tenants.length} tanks=${processed} drifted=${drifted}`,
    );
    return drifted;
  }
}
