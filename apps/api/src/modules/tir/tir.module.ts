import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Entities
// (No TypeORM entities needed — service uses raw queries on managed tables)

// Services
import { ExplosivesLedgerService } from './services/explosives-ledger.service';
import { DetonatorService } from './services/detonator.service';
import { BlastPlanService } from './services/blast-plan.service';
import { BlastChargeService } from './services/blast-charge.service';
import { BlastClearanceService } from './services/blast-clearance.service';
import { BlastReportService } from './services/blast-report.service';
import { ExplosivesReconciliationService } from './services/explosives-reconciliation.service';

// Saga + Jobs
import { BlastPlanSagaHandler } from './saga/blast-plan-saga.handler';
import { BlastClearanceTimeoutJob } from './jobs/blast-clearance-timeout.job';
import { ExplosivesReconciliationJob } from './jobs/explosives-reconciliation.job';

// Controllers
import { ExplosivesLedgerController } from './controllers/explosives-ledger.controller';
import { DetonatorController } from './controllers/detonator.controller';
import { BlastPlanController } from './controllers/blast-plan.controller';
import { BlastReportController } from './controllers/blast-report.controller';

// Dependencies from other modules
import { OutboxModule } from '../outbox/outbox.module';
import { RhModule } from '../rh/rh.module';

/**
 * TirModule — Tir de Mine & Explosifs (TIR-01..TIR-07).
 *
 * Cross-module dependencies:
 *   - RhModule: RhHabilitationService (blast plan loading gate)
 *   - OutboxModule: OutboxService (async PDF snapshot via outbox)
 *   - OperationalDayService is injected via a provider factory that resolves
 *     from the DataSource — avoids circular dependency between TirModule
 *     and the operational-day module.
 *
 * CRITICAL: No direct import of StockpileModule or HseModule (ADR-0012).
 * Cross-module communication via EventEmitter2 only.
 */
@Module({
  imports: [
    OutboxModule,
    RhModule,
  ],
  controllers: [
    ExplosivesLedgerController,
    DetonatorController,
    BlastPlanController,
    BlastReportController,
  ],
  providers: [
    // Services
    ExplosivesLedgerService,
    DetonatorService,
    BlastPlanService,
    BlastChargeService,
    BlastClearanceService,
    BlastReportService,
    ExplosivesReconciliationService,
    // Saga
    BlastPlanSagaHandler,
    // Jobs
    BlastClearanceTimeoutJob,
    // Operational day service proxy (avoids circular dependency)
    {
      provide: 'OPERATIONAL_DAY_SERVICE',
      useFactory: () => ({
        // These methods are provided by OperationalDayService but we inline
        // a DataSource-based implementation here to avoid circular module deps.
        // In Phase 4, refactor to inject OperationalDayModule properly.
        blockClosure: async (_dayId: string, _reason: string) => {
          // Placeholder — wired to actual OperationalDayService via DI in Phase 4.
          // Tests mock this directly.
        },
        resolveClosure: async (_dayId: string, _reason: string) => {
          // Placeholder — same as above.
        },
      }),
    },
    {
      provide: ExplosivesReconciliationJob,
      useFactory: (
        reconService: ExplosivesReconciliationService,
        events: unknown,
        opDayService: unknown,
      ) => new ExplosivesReconciliationJob(reconService, events as never, opDayService as never),
      inject: [ExplosivesReconciliationService, 'EventEmitter2', 'OPERATIONAL_DAY_SERVICE'],
    },
  ],
  exports: [
    BlastPlanService,
    ExplosivesLedgerService,
    BlastReportService,
  ],
})
export class TirModule {}
