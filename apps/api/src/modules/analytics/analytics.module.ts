import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostPerTonSnapshot } from './entities/cost-per-ton-snapshot.entity';
import { Budget } from './entities/budget.entity';
import { AnalyticalEntry } from './entities/analytical-entry.entity';
import { AlertRule } from './entities/alert-rule.entity';
import { CostPerTonAggregatorService } from './services/cost-per-ton-aggregator.service';
import { BudgetComparisonService } from './services/budget-comparison.service';
import { MarginService } from './services/margin.service';
import { OhadaExportService } from './services/ohada-export.service';
import { AlertDispatcherService } from './services/alert-dispatcher.service';
import { ConsolidationService } from './services/consolidation.service';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticalEntryWriterHandler } from './event-handlers/analytical-entry-writer.handler';
import { EmailProvider, SmsProvider } from './services/notification-providers';

/**
 * AnalyticsModule (Phase 4).
 * Provides:
 *   - CostPerTonAggregator (FIN-01) — daily materialized cost snapshot
 *   - BudgetComparison (FIN-03) — budget vs actual YTD
 *   - Margin (FIN-02) — per contract / customer / site
 *   - OhadaExport (FIN-05) — Sage / Ciel / Odoo CSV
 *   - Consolidation (FIN-06) — multi-site P&L in pivot currency
 *   - AlertDispatcher (DSH-06) — multi-channel alert routing
 *   - AnalyticalEntryWriter (FIN-04) — writes ledger entries from domain events
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CostPerTonSnapshot, Budget, AnalyticalEntry, AlertRule]),
    EventEmitterModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    CostPerTonAggregatorService,
    BudgetComparisonService,
    MarginService,
    OhadaExportService,
    AlertDispatcherService,
    ConsolidationService,
    AnalyticalEntryWriterHandler,
    EmailProvider,
    SmsProvider,
  ],
  exports: [
    CostPerTonAggregatorService,
    BudgetComparisonService,
    MarginService,
    OhadaExportService,
    AlertDispatcherService,
    ConsolidationService,
  ],
})
export class AnalyticsModule {}
