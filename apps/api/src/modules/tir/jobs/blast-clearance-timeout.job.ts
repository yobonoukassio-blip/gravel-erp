import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * BlastClearanceTimeoutJob — TIR-05.
 *
 * Scheduled via BullMQ with a 4-hour delay when requestFire is called.
 * If the plan is still in FIRE_REQUESTED after 4 hours, emits
 * 'tir.blast_plan.fire_clearance_timeout' for alerts.
 *
 * Idempotent: if plan is already FIRED/CLEARED/REPORTED, the job is a no-op.
 */
@Injectable()
export class BlastClearanceTimeoutJob {
  private readonly logger = new Logger(BlastClearanceTimeoutJob.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Execute the timeout check. Called by the BullMQ processor after 4 hours.
   */
  async execute(payload: {
    planId: string;
    tenantId: string;
    siteId: string;
  }): Promise<void> {
    const rows = (await this.ds.query(
      `SELECT status FROM blast_plan WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [payload.planId, payload.tenantId],
    )) as Array<{ status: string }>;

    if (rows.length === 0) {
      this.logger.warn(`[ClearanceTimeout] Plan ${payload.planId} not found — skipping`);
      return;
    }

    const { status } = rows[0];
    if (status !== 'FIRE_REQUESTED') {
      this.logger.log(
        `[ClearanceTimeout] Plan ${payload.planId} is now in status=${status} — no timeout needed`,
      );
      return;
    }

    this.logger.warn(
      `[ClearanceTimeout] Plan ${payload.planId} still in FIRE_REQUESTED after 4h — emitting timeout alert`,
    );

    this.events.emit('tir.blast_plan.fire_clearance_timeout', {
      planId: payload.planId,
      tenantId: payload.tenantId,
      siteId: payload.siteId,
    });
  }
}
