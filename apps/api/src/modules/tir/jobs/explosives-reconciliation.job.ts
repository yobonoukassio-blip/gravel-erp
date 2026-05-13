import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExplosivesReconciliationService } from '../services/explosives-reconciliation.service';

/** Tolerance in grams: gaps within this threshold do not block closure. */
const TOLERANCE_G = 50;

export interface ReconcileInput {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
}

/**
 * ExplosivesReconciliationJob — TIR-07.
 *
 * BullMQ-compatible job (also usable as NestJS Schedule cron for POC).
 * Runs at 22:30 UTC (~23:30 Abidjan GMT+1).
 *
 * When gap > TOLERANCE_G:
 *   1. Calls operationalDayService.blockClosure — NEVER writes directly to closure_blockers
 *   2. Emits 'tir.reconciliation.gap_detected' alert event
 */
@Injectable()
export class ExplosivesReconciliationJob {
  private readonly logger = new Logger(ExplosivesReconciliationJob.name);

  constructor(
    private readonly reconciliationService: ExplosivesReconciliationService,
    private readonly events: EventEmitter2,
    // OperationalDayService injected by TirModule (cross-module dependency)
    private readonly operationalDayService: {
      blockClosure(dayId: string, reason: string): Promise<void>;
      resolveClosure(dayId: string, reason: string): Promise<void>;
    },
  ) {}

  /**
   * Execute reconciliation for a given site+day.
   * Called by BullMQ processor or directly in tests.
   */
  async reconcile(input: ReconcileInput): Promise<{ gapG: number; blocked: boolean }> {
    const { tenantId, siteId, operationalDayId } = input;

    const [ledgerBalance, physicalCount] = await Promise.all([
      this.reconciliationService.computeBalance(siteId, operationalDayId, tenantId),
      this.reconciliationService.getPhysicalCount(operationalDayId, tenantId),
    ]);

    const gapG = this.reconciliationService.computeGap(ledgerBalance, physicalCount);

    this.logger.log(
      `[ExplosivesRecon] site=${siteId} day=${operationalDayId} gap=${gapG}g tolerance=${TOLERANCE_G}g`,
    );

    if (gapG > TOLERANCE_G) {
      await this.operationalDayService.blockClosure(
        operationalDayId,
        'EXPLOSIVES_RECONCILIATION_GAP',
      );
      this.events.emit('tir.reconciliation.gap_detected', {
        tenantId,
        siteId,
        gapG,
        operationalDayId,
      });
      this.logger.warn(
        `[ExplosivesRecon] gap=${gapG}g > tolerance=${TOLERANCE_G}g — closure BLOCKED for day=${operationalDayId}`,
      );
      return { gapG, blocked: true };
    }

    this.logger.log(`[ExplosivesRecon] gap=${gapG}g within tolerance — no closure block`);
    return { gapG, blocked: false };
  }

  /**
   * Called when a physical count submission resolves the gap.
   * Unblocks OperationalDay closure.
   */
  async resolveGap(operationalDayId: string): Promise<void> {
    await this.operationalDayService.resolveClosure(
      operationalDayId,
      'EXPLOSIVES_RECONCILIATION_GAP',
    );
    this.logger.log(
      `[ExplosivesRecon] closure unblocked for day=${operationalDayId}`,
    );
  }
}
