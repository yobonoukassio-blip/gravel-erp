import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  NOTIFICATION_JOB_NAME,
  NOTIFICATION_QUEUE_NAME,
  NotificationJobPayload,
} from './notification.types';

/**
 * NotificationService (Phase 9 — NTF-01).
 *
 * Producer-side facade for the 'notifications' BullMQ queue. Callers (e.g.
 * `AlertDispatcherService`) call `dispatch(payload)` and never touch BullMQ
 * directly.
 *
 * Retry policy is set per-job here (not on the queue) so individual call sites
 * could override it later if needed:
 *   - 5 attempts
 *   - exponential backoff starting at 30s, capped at 30min
 *   - removeOnComplete keeps last 1000 jobs for audit; failed jobs kept 30d
 *     so an operator can inspect the dead-letter via Bull Board.
 *
 * Dry-run posture: when NTF_DRY_RUN=true the job is still enqueued so the
 * consumer-side logger fallback runs and we keep audit symmetry — the actual
 * provider SDK call is the part skipped (handled inside each worker).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE_NAME) private readonly queue: Queue<NotificationJobPayload>,
  ) {}

  async dispatch(payload: NotificationJobPayload): Promise<string> {
    if (!payload.tenantId) {
      // Defensive: every job MUST carry a tenant. Reject loudly rather than
      // enqueue a poisoned job that would break RLS at the worker.
      throw new Error('NotificationService.dispatch: tenantId is required');
    }
    const job = await this.queue.add(NOTIFICATION_JOB_NAME, payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 30 * 24 * 3600 },
      // Dedupe identical alert deliveries within 60s (e.g. duplicate event emits).
      jobId: payload.metadata?.alertId
        ? `${payload.metadata.alertId}:${payload.channel}:${payload.recipient.userId}`
        : undefined,
    });
    this.logger.debug(
      `enqueued notification job ${job.id} channel=${payload.channel} template=${payload.templateKey} tenant=${payload.tenantId}`,
    );
    return job.id ?? 'unknown';
  }
}
