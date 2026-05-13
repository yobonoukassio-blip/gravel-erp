import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { BlastPlanService } from './blast-plan.service';

/**
 * BlastClearanceService — TIR-05.
 *
 * Issues HSE zone clearance tokens. Lives in TirModule (NOT in HseModule)
 * per ADR-0012. Cross-module communication is via EventEmitter2 only.
 */
@Injectable()
export class BlastClearanceService {
  private readonly logger = new Logger(BlastClearanceService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly blastPlanService: BlastPlanService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Issue a zone clearance for a blast plan in FIRE_REQUESTED status.
   * Only HSE_OFFICER role can call this.
   *
   * Emits 'tir.blast_plan.zone_cleared' — handled by BlastPlanSagaHandler
   * which calls blastPlanService.transitionToFired.
   */
  async issueZoneClearance(
    planId: string,
    hseOfficerId: string,
    tenantId: string,
  ): Promise<{ clearanceToken: string }> {
    const plan = await this.blastPlanService.findById(planId, tenantId);

    if (plan.status !== 'FIRE_REQUESTED') {
      throw new UnprocessableEntityException({
        code: 'ERR_BLAST_PLAN_NOT_FIRE_REQUESTED',
        message: `Cannot issue clearance: blast plan ${planId} is in status=${plan.status}; expected FIRE_REQUESTED.`,
      });
    }

    const clearanceToken = randomUUID();

    await this.ds.query(
      `UPDATE blast_plan
          SET status = 'CLEARED', clearance_token = $1
        WHERE id = $2 AND tenant_id = $3`,
      [clearanceToken, planId, tenantId],
    );

    this.logger.log(
      `[BlastClearance] Zone clearance issued for plan ${planId} by HSE officer ${hseOfficerId} — token ${clearanceToken}`,
    );

    this.events.emit('tir.blast_plan.zone_cleared', {
      planId,
      clearanceToken,
      tenantId,
    });

    return { clearanceToken };
  }
}
