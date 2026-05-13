import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { HealthModule } from './modules/health/health.module';
import { SyncModule } from './modules/sync/sync.module';
import { IdentityModule } from './modules/identity/identity.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { ForationModule } from './modules/foration/foration.module';
import { TransportModule } from './modules/transport/transport.module';
import { StockpileModule } from './modules/stockpile/stockpile.module';
import { HseModule } from './modules/hse/hse.module';
import { ProductionDashboardModule } from './modules/production-dashboard/production-dashboard.module';

/**
 * Root application module.
 *
 * Phase 1 modules wired so far:
 *   - health     (W0-P01)  : /health/live, /health/ready (Public)
 *   - sync       (W2-P03)  : PowerSync bridge + conflict registry
 *   - identity   (W2-P04)  : Keycloak JWT validation, RBAC guards,
 *                            /api/users/me + /api/users/me/preferences
 *   - i18n       (W2-P04)  : LocaleResolver from CLS preferredLocale
 *
 * Phase 2 Wave 3 modules:
 *   - production-dashboard (W3-P08): site director + quarry chief dashboards,
 *                                    SSE broadcaster, cost_per_ton_provisional
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    HealthModule,
    SyncModule,
    IdentityModule,
    I18nModule,
    MasterDataModule,
    ExtractionModule,
    ForationModule,
    TransportModule,
    StockpileModule,
    HseModule,
    ProductionDashboardModule,
  ],
})
export class AppModule {}
