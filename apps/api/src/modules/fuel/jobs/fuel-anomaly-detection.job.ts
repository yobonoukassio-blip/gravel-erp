import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FuelAnomalyService } from '../services/fuel-anomaly.service';

interface ActiveEquipmentRow {
  id: string;
  tenant_id: string;
  site_id: string;
}

/**
 * FuelAnomalyDetectionJob (CAR-03).
 *
 * BullMQ cron: runs daily at 04:00 UTC.
 * Iterates all active production equipment and calls FuelAnomalyService.computeAndDetect.
 */
@Injectable()
export class FuelAnomalyDetectionJob {
  private readonly logger = new Logger(FuelAnomalyDetectionJob.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly anomalyService: FuelAnomalyService,
  ) {}

  /** Cron: 04:00 UTC daily. */
  @Cron('0 4 * * *')
  async runDaily(): Promise<void> {
    this.logger.log('Starting fuel anomaly detection scan');
    const count = await this.detectAll();
    if (count > 0) {
      this.logger.warn(`Fuel anomaly detected on ${count} equipment(s)`);
    } else {
      this.logger.log('No fuel anomalies detected');
    }
  }

  /** Returns count of anomalies detected. */
  async detectAll(): Promise<number> {
    const equipment = (await this.ds.query(
      `SELECT id, tenant_id, site_id
         FROM production_equipment
        WHERE is_active = true`,
    )) as ActiveEquipmentRow[];

    let count = 0;
    for (const eq of equipment) {
      try {
        const detected = await this.anomalyService.computeAndDetect(
          eq.tenant_id,
          eq.site_id,
          eq.id,
        );
        if (detected) count++;
      } catch (err) {
        this.logger.error(`Anomaly check failed for equipment ${eq.id}`, err);
      }
    }
    return count;
  }
}
