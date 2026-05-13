import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stockpile } from './entities/stockpile.entity';
import { StockpileEvent } from './entities/stockpile-event.entity';
import { StockpileBalance } from './entities/stockpile-balance.entity';
import { StockpileThreshold } from './entities/stockpile-threshold.entity';
import { StockpileEventService } from './services/stockpile-event.service';
import { StockpileBalanceService } from './services/stockpile-balance.service';
import { StockpileValuationService } from './services/stockpile-valuation.service';
import { StockpileThresholdService } from './services/stockpile-threshold.service';
import { StockpileController } from './controllers/stockpile.controller';
import { RotationCompletedHandler } from './event-handlers/rotation-completed.handler';
import { BalanceProjectionHandler } from './event-handlers/balance-projection.handler';
import { BalanceRecomputeJob } from './jobs/balance-recompute.job';

/**
 * StockpileModule (Phase 2 W2 P05).
 *
 * Wires:
 *   - Stockpile master + StockpileEvent (STK-01) append-only ledger + chain-of-hash
 *   - StockpileBalance projection (STK-01)
 *   - StockpileThreshold + crossing alerts (STK-02)
 *   - StockpileValuation cost_model_version=1 stub (STK-03)
 *   - rotation_completed outbox consumer (creates STOCKPILE_INFLOW)
 *   - balance-projection handler (projection updater)
 *   - balance-recompute nightly drift detector
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Stockpile, StockpileEvent, StockpileBalance, StockpileThreshold]),
    EventEmitterModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [StockpileController],
  providers: [
    StockpileEventService,
    StockpileBalanceService,
    StockpileValuationService,
    StockpileThresholdService,
    RotationCompletedHandler,
    BalanceProjectionHandler,
    BalanceRecomputeJob,
  ],
  exports: [
    StockpileEventService,
    StockpileBalanceService,
    StockpileValuationService,
    StockpileThresholdService,
  ],
})
export class StockpileModule {}
