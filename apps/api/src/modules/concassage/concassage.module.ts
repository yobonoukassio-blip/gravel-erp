import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { FuelModule } from '../fuel/fuel.module';
import { CrusherSessionService } from './services/crusher-session.service';
import { ScreeningSessionService } from './services/screening-session.service';
import { CrusherSessionController } from './controllers/crusher-session.controller';
import { ScreeningSessionController } from './controllers/screening-session.controller';

/**
 * ConcassageModule (Phase 3 W1 P03 — CON-01, CON-02, CRI-01).
 *
 * Wires:
 *   - CrusherSession operational record + outbox dispatch on complete (CON-01)
 *   - EnergyConsumptionService integration for kwh per session (CON-02)
 *   - ScreeningSession + per-calibre outbox dispatch (CRI-01)
 *
 * Downstream: StockpileModule consumes outbox events to create STOCKPILE_INFLOW
 * via CrusherSessionCompletedHandler and ScreeningSessionCompletedHandler.
 */
@Module({
  imports: [OutboxModule, FuelModule],
  controllers: [CrusherSessionController, ScreeningSessionController],
  providers: [CrusherSessionService, ScreeningSessionService],
  exports: [CrusherSessionService, ScreeningSessionService],
})
export class ConcassageModule {}
