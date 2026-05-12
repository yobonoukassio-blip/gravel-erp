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
 * Pending plans:
 *   - tenancy / master-data entities live under src/modules/* (W1-P02);
 *     their module wiring is composed by feature plans (W2-P05).
 *   - audit      (W1-P02)  : append-only audit_log + chain-of-hash.
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
  ],
})
export class AppModule {}
