import { Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';

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
import { EmployeeService } from '../rh/services/employee.service';

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
    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 50 }),
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
    // Real EmployeeService (from RhModule) provides blockClosure/resolveClosure
    // against operational_days.closure_blockers. Token alias keeps the
    // injection contract stable; tests can still override the token.
    {
      provide: 'OPERATIONAL_DAY_SERVICE',
      useExisting: EmployeeService,
    },
    {
      provide: ExplosivesReconciliationJob,
      useFactory: (
        reconService: ExplosivesReconciliationService,
        events: unknown,
        opDayService: unknown,
      ) => new ExplosivesReconciliationJob(reconService, events as never, opDayService as never),
      inject: [ExplosivesReconciliationService, EventEmitter2, 'OPERATIONAL_DAY_SERVICE'],
    },
  ],
  exports: [
    BlastPlanService,
    ExplosivesLedgerService,
    BlastReportService,
  ],
})
export class TirModule {}
