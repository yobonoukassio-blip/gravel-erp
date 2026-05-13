import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FuelReconciliationService } from '../services/fuel-reconciliation.service';

interface TankIdRow {
  id: string;
}

/**
 * FuelReconciliationJob (CAR-01, D2-53).
 *
 * Nightly cron at 03:30 UTC (approximate site-tz — per-site TZ scheduling
 * lands Phase 4 when consolidation engine matures).
 *
 * Iterates all fuel tanks and runs FuelReconciliationService.runForTank.
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
    const tanks = (await this.ds.query(
      `SELECT id FROM fuel_tank`,
    )) as TankIdRow[];

    let count = 0;
    for (const tank of tanks) {
      try {
        const drifted = await this.reconciliationService.runForTank(tank.id);
        if (drifted) count++;
      } catch (err) {
        this.logger.error(`Reconciliation failed for tank ${tank.id}`, err);
      }
    }
    return count;
  }
}
