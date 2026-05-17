import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import { Job, UnrecoverableError } from 'bullmq';
import type { Histogram } from 'prom-client';
import { CLS_KEYS } from '../../common/cls/tenant-context';
import { EmailBrevoProvider } from './providers/email-brevo.provider';
import { SmsTwilioProvider } from './providers/sms-twilio.provider';
import { InAppProvider } from './providers/in-app.provider';
import {
  NOTIFICATION_QUEUE_NAME,
  NotificationJobPayload,
  NotificationOutcome,
} from './notification.types';

/**
 * NotificationProcessor (NTF-01).
 *
 * BullMQ worker that drains the 'notifications' queue and routes each job to
 * the correct channel provider. Critical responsibilities:
 *
 *   1. **Tenant context** — wraps every `provider.send(...)` call in a CLS
 *      frame with `tenantId` set so any DB query the provider issues stays
 *      RLS-scoped (in-app provider writes to `notification` table).
 *
 *   2. **Retry semantics** — when a provider returns `failed/retryable=false`
 *      we throw an `UnrecoverableError` so BullMQ skips remaining attempts
 *      and moves the job to the failed set immediately (the dead-letter).
 *      Retryable failures are surfaced as a normal throw so BullMQ applies
 *      the exponential backoff configured on the job.
 *
 *   3. **Skipped outcomes** — `skipped/provider_not_configured` and
 *      `skipped/dry_run` complete the job successfully (no retry); they're
 *      observable via worker logs and BullMQ's completed-job history.
 *
 *   4. **SLO instrumentation (HRD-MVP-06 Task 4)** —
 *      - `bullmq_job_duration_seconds` observed in `finally` for EVERY attempt
 *        (success, failure, unrecoverable). Backs SLO-C (queue drain).
 *      - `alert_dispatch_latency_seconds` observed ONLY on successful dispatch,
 *        measured from `job.timestamp` (enqueue moment) to send-complete.
 *        Backs SLO-D (alert dispatch p95 < 60s).
 */
@Processor(NOTIFICATION_QUEUE_NAME)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly cls: ClsService,
    private readonly email: EmailBrevoProvider,
    private readonly sms: SmsTwilioProvider,
    private readonly inApp: InAppProvider,
    @InjectMetric('bullmq_job_duration_seconds')
    private readonly bullmqDuration: Histogram<string>,
    @InjectMetric('alert_dispatch_latency_seconds')
    private readonly dispatchLatency: Histogram<string>,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>): Promise<NotificationOutcome> {
    const payload = job.data;
    const jobStartedAt = Date.now();
    // BullMQ stamps `timestamp` (ms) at enqueue. Falls back to now() if missing
    // so we never produce a negative duration on edge-case jobs.
    const enqueuedAt = job.timestamp ?? jobStartedAt;

    try {
      const outcome = await this.cls.run(async () => {
        // Build a CLS context for this job so anything the provider does on the
        // DB (e.g. in-app INSERT) sees the right tenant_id for RLS.
        this.cls.set(CLS_KEYS.TENANT_ID, payload.tenantId);
        this.cls.set(CLS_KEYS.USER_ID, payload.recipient.userId);
        const result = await this.dispatchToChannel(payload);
        this.logger.log(
          `job=${job.id} channel=${payload.channel} template=${payload.templateKey} outcome=${result.status}${
            result.status === 'skipped' ? `/${result.reason}` : ''
          }`,
        );
        if (result.status === 'failed' && result.retryable === false) {
          // SLO-D: don't record latency for unrecoverable failures, but the
          // throw will still hit the finally below for SLO-C.
          throw new UnrecoverableError(result.error);
        }
        return result;
      });

      // SLO-D: only successful dispatches count toward the dispatch-latency SLO.
      // 'skipped' outcomes are intentional no-ops (dry-run, provider not configured)
      // and should not pollute the p95.
      if (outcome.status === 'delivered') {
        const latencySeconds = (Date.now() - enqueuedAt) / 1000;
        this.dispatchLatency.observe(
          {
            severity: payload.metadata?.severity ?? 'unknown',
            channel: payload.channel,
          },
          latencySeconds,
        );
      }

      return outcome;
    } finally {
      // SLO-C: queue drain budget covers every job we touched, including failed
      // ones — burning the CPU is what slows the queue.
      const durationSeconds = (Date.now() - jobStartedAt) / 1000;
      this.bullmqDuration.observe(
        { queue: NOTIFICATION_QUEUE_NAME, job_name: job.name },
        durationSeconds,
      );
    }
  }

  private dispatchToChannel(payload: NotificationJobPayload): Promise<NotificationOutcome> {
    switch (payload.channel) {
      case 'email':
        return this.email.send(payload);
      case 'sms':
        return this.sms.send(payload);
      case 'in_app':
        return this.inApp.send(payload);
      default: {
        const _exhaustive: never = payload.channel;
        return Promise.resolve({
          status: 'failed',
          error: `unknown channel ${String(_exhaustive)}`,
          retryable: false,
        });
      }
    }
  }
}
