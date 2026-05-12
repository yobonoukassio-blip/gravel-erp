import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { SyncModule } from './modules/sync/sync.module';

/**
 * Root application module.
 *
 * Phase 1 modules (added progressively by W1-P01..W2-P05):
 *   - identity     : Keycloak JWT validation, role/site claims (W1-P04)
 *   - tenancy      : Tenant/Country entities + admin (W1-P02)
 *   - master-data  : Site, ProductionZone, Bench, Permit, OperationalDay, FxRate (W1-P02, W2-P05)
 *   - sync         : PowerSync bridge + conflict registry (W1-P03)
 *   - audit        : append-only audit_log + chain-of-hash verifier (W1-P02)
 *   - i18n         : locale resolver, label store (W1-P04)
 *
 * Only `health` is wired in Wave 0 so the skeleton boots.
 */
@Module({
  imports: [HealthModule, SyncModule],
})
export class AppModule {}
