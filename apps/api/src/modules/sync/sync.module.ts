import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyActivityLog } from './daily-activity-log.entity';
import { UserPreference } from './user-preference.entity';
import { SyncController } from './sync.controller';

/**
 * SyncModule — exposes the ConflictRegistry framework and the 2 entities
 * wired in Phase 1 (D-12): `daily_activity_log` and `user_preferences`.
 *
 * The PowerSync server reads directly from the Postgres logical-replication
 * slot defined by the `powersync` publication; the NestJS endpoints in
 * SyncController are the WRITE path (client → server), keeping RLS + audit
 * + validation invariants in a single funnel.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DailyActivityLog, UserPreference])],
  controllers: [SyncController],
  exports: [TypeOrmModule],
})
export class SyncModule {}
