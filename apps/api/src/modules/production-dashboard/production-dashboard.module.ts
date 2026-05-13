import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from '../alerts/alerts.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { ForationModule } from '../foration/foration.module';
import { StockpileModule } from '../stockpile/stockpile.module';
import { TransportModule } from '../transport/transport.module';
import { SiteDirectorDashboardController } from './controllers/site-director-dashboard.controller';
import { QuarryChiefDashboardController } from './controllers/quarry-chief-dashboard.controller';
import { DashboardProjectionHandler } from './event-handlers/dashboard-projection.handler';
import { DashboardAggregatorService } from './services/dashboard-aggregator.service';
import { CostPerTonProvisionalService } from './services/cost-per-ton-provisional.service';
import { SseBroadcasterService } from './services/sse-broadcaster.service';

/**
 * ProductionDashboardModule (Phase 2 W3 P08).
 *
 * Wires:
 *   - DashboardAggregatorService   — orchestrates KPI aggregation (DSH-01)
 *   - CostPerTonProvisionalService — fuel-only cost per ton (D2-100)
 *   - SseBroadcasterService        — SSE channel registry + ring buffer (D2-71)
 *   - DashboardProjectionHandler   — 6 domain event → SSE push (DSH-02)
 *   - SiteDirectorDashboardController
 *   - QuarryChiefDashboardController
 *
 * Imports ForationModule, ExtractionModule, TransportModule, StockpileModule,
 * and AlertsModule so aggregation queries can use their entities via shared
 * DataSource (TypeORM multi-entity). Does NOT depend on full module service
 * trees — aggregator issues raw SQL queries against the shared DB.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([]),
    EventEmitterModule,
    AlertsModule,
    ForationModule,
    ExtractionModule,
    TransportModule,
    StockpileModule,
  ],
  controllers: [SiteDirectorDashboardController, QuarryChiefDashboardController],
  providers: [
    DashboardAggregatorService,
    CostPerTonProvisionalService,
    SseBroadcasterService,
    DashboardProjectionHandler,
  ],
  exports: [SseBroadcasterService, DashboardAggregatorService],
})
export class ProductionDashboardModule {}
