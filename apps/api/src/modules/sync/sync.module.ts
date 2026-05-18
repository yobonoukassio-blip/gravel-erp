import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyActivityLog } from './daily-activity-log.entity';
import { UserPreference } from './user-preference.entity';
import { SyncController } from './sync.controller';
import { SyncDeadletterController } from './sync-deadletter.controller';
import { SloMetricsModule } from '../../observability/slo-metrics.module';

/**
 * SyncModule — exposes the ConflictRegistry framework and the 2 entities
 * wired in Phase 1 (D-12): `daily_activity_log` and `user_preferences`.
 *
 * The PowerSync server reads directly from the Postgres logical-replication
 * slot defined by the `powersync` publication; the NestJS endpoints in
 * SyncController are the WRITE path (client → server), keeping RLS + audit
 * + validation invariants in a single funnel.
 *
 * HRD-MVP-06 (W1-P04 Task 4): imports SloMetricsModule so SyncController can
 * @InjectMetric the `sync_attempts_total` counter for SLO-B.
 *
 * HRD-MVP-07 (W2-P03): SyncDeadletterController exposes the manual replay
 * endpoint referenced by the deadletter triage SOP. A concrete
 * DeadletterRegistry provider is wired when the PowerSync ingress migration
 * ships; until then the @Optional() injection returns 404 with a clear
 * message instead of crashing.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DailyActivityLog, UserPreference]), SloMetricsModule],
  controllers: [SyncController, SyncDeadletterController],
  exports: [TypeOrmModule],
})
export class SyncModule {}
