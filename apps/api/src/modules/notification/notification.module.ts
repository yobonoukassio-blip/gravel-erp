import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import IORedis, { Redis as IORedisClient } from 'ioredis';
import { Notification } from './entities/notification.entity';
import { NotificationController } from './notification.controller';
import { NotificationProcessor } from './notification.processor';
import { NotificationService } from './notification.service';
import { EmailBrevoProvider } from './providers/email-brevo.provider';
import { InAppProvider } from './providers/in-app.provider';
import { IRedisClient, SmsRateLimiter, SmsTwilioProvider } from './providers/sms-twilio.provider';
import { NOTIFICATION_QUEUE_NAME } from './notification.types';
import { SloMetricsModule } from '../../observability/slo-metrics.module';

export const REDIS_CLIENT_TOKEN = 'NOTIFICATION_REDIS_CLIENT';

const redisProvider: Provider = {
  provide: REDIS_CLIENT_TOKEN,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): IORedisClient | null => {
    const url = cfg.get<string>('REDIS_URL');
    const log = new Logger('NotificationModule');
    if (!url) {
      log.warn(
        'REDIS_URL not set — SMS rate limiter degrades to open (max-per-window check skipped). Set REDIS_URL to enable.',
      );
      return null;
    }
    return new IORedis(url, {
      maxRetriesPerRequest: null, // required by BullMQ workers
      enableReadyCheck: false,
    });
  },
};

const rateLimiterProvider: Provider = {
  provide: SmsRateLimiter,
  inject: [REDIS_CLIENT_TOKEN],
  useFactory: (client: IORedisClient | null) =>
    new SmsRateLimiter(client as unknown as IRedisClient | null),
};

/**
 * NotificationModule (Phase 9).
 *
 * Wires BullMQ queue 'notifications' to its processor + per-channel providers.
 * Exports `NotificationService` so other modules (Alerts/Analytics) can enqueue
 * jobs without depending on BullMQ directly.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Notification]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        if (!url) {
          return { connection: { host: '127.0.0.1', port: 6379 } };
        }
        // Pass a pre-constructed IORedis instance so BullMQ workers get the
        // correct maxRetriesPerRequest:null required by the BullMQ worker contract.
        return {
          connection: new IORedis(url, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          }),
        };
      },
    }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE_NAME }),
    // HRD-MVP-06 Task 4: NotificationProcessor injects bullmq_job_duration_seconds
    // and alert_dispatch_latency_seconds histograms for SLO-C / SLO-D.
    SloMetricsModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationProcessor,
    EmailBrevoProvider,
    SmsTwilioProvider,
    InAppProvider,
    redisProvider,
    rateLimiterProvider,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
