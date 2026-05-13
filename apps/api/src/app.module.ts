import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './modules/health/health.module';
import { SyncModule } from './modules/sync/sync.module';
import { IdentityModule } from './modules/identity/identity.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { ForationModule } from './modules/foration/foration.module';
import { TransportModule } from './modules/transport/transport.module';
import { StockpileModule } from './modules/stockpile/stockpile.module';
import { FuelModule } from './modules/fuel/fuel.module';
import { HseModule } from './modules/hse/hse.module';
import { ProductionDashboardModule } from './modules/production-dashboard/production-dashboard.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { RhModule } from './modules/rh/rh.module';
import { TirModule } from './modules/tir/tir.module';
import { ConcassageModule } from './modules/concassage/concassage.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { VentesModule } from './modules/ventes/ventes.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { IotModule } from './modules/iot/iot.module';

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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        url: cfg.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // TYPEORM_SYNCHRONIZE=true override for initial production setup
        synchronize:
          cfg.get('TYPEORM_SYNCHRONIZE') === 'true' ||
          cfg.get('NODE_ENV') !== 'production',
        logging: cfg.get('TYPEORM_LOGGING') === 'true',
        ssl: { rejectUnauthorized: false },
        extra: { application_name: 'gravel-api' },
      }),
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 50 }),
    ScheduleModule.forRoot(),
    HealthModule,
    SyncModule,
    IdentityModule,
    I18nModule,
    MasterDataModule,
    ExtractionModule,
    ForationModule,
    TransportModule,
    StockpileModule,
    FuelModule,
    HseModule,
    ProductionDashboardModule,
    OutboxModule,
    AlertsModule,
    RhModule,
    TirModule,
    ConcassageModule,
    MaintenanceModule,
    VentesModule,
    AnalyticsModule,
    IotModule,
  ],
})
export class AppModule {}
