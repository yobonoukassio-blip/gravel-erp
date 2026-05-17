import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ClsService } from 'nestjs-cls';
import { Job, UnrecoverableError } from 'bullmq';
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
 */
@Processor(NOTIFICATION_QUEUE_NAME)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly cls: ClsService,
    private readonly email: EmailBrevoProvider,
    private readonly sms: SmsTwilioProvider,
    private readonly inApp: InAppProvider,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>): Promise<NotificationOutcome> {
    const payload = job.data;
    return this.cls.run(async () => {
      // Build a CLS context for this job so anything the provider does on the
      // DB (e.g. in-app INSERT) sees the right tenant_id for RLS.
      this.cls.set(CLS_KEYS.TENANT_ID, payload.tenantId);
      this.cls.set(CLS_KEYS.USER_ID, payload.recipient.userId);
      const outcome = await this.dispatchToChannel(payload);
      this.logger.log(
        `job=${job.id} channel=${payload.channel} template=${payload.templateKey} outcome=${outcome.status}${
          outcome.status === 'skipped' ? `/${outcome.reason}` : ''
        }`,
      );
      if (outcome.status === 'failed' && outcome.retryable === false) {
        throw new UnrecoverableError(outcome.error);
      }
      return outcome;
    });
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
