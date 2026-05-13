import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BlastPlanService } from '../services/blast-plan.service';

interface ZoneClearedEvent {
  planId: string;
  clearanceToken: string;
  tenantId: string;
}

interface FireClearanceTimeoutEvent {
  planId: string;
  tenantId: string;
  siteId: string;
}

/**
 * BlastPlanSagaHandler — TIR-05.
 *
 * Listens for:
 *   - 'tir.blast_plan.zone_cleared'  → transitions plan to FIRED
 *   - 'tir.blast_plan.fire_clearance_timeout' → alert (plan stays FIRE_REQUESTED)
 *
 * Cross-module event wiring per ADR-0012.
 */
@Injectable()
export class BlastPlanSagaHandler {
  private readonly logger = new Logger(BlastPlanSagaHandler.name);

  constructor(private readonly blastPlanService: BlastPlanService) {}

  @OnEvent('tir.blast_plan.zone_cleared')
  async handleZoneCleared(event: ZoneClearedEvent): Promise<void> {
    this.logger.log(
      `[BlastPlanSaga] zone_cleared received for plan ${event.planId} — transitioning to FIRED`,
    );
    try {
      await this.blastPlanService.transitionToFired(event.planId, event.tenantId);
    } catch (err) {
      // Log and swallow — saga is fire-and-forget. If plan already FIRED,
      // the assertStatus will throw but that is idempotent-safe.
      this.logger.error(
        `[BlastPlanSaga] transitionToFired failed for plan ${event.planId}: ${String(err)}`,
      );
    }
  }

  @OnEvent('tir.blast_plan.fire_clearance_timeout')
  async handleClearanceTimeout(event: FireClearanceTimeoutEvent): Promise<void> {
    this.logger.warn(
      `[BlastPlanSaga] fire_clearance_timeout for plan ${event.planId} at site ${event.siteId} — alert dispatched`,
    );
    // Alert is dispatched by BlastClearanceTimeoutJob emitting
    // 'tir.blast_plan.fire_clearance_timeout' to alerts module.
    // No state transition here — HSE must manually clear or abort.
  }
}
