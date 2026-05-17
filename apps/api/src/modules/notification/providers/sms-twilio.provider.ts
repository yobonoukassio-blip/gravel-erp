import { Injectable, Logger } from '@nestjs/common';
import twilio from 'twilio';
import type { Twilio } from 'twilio';
import { NotificationJobPayload, NotificationOutcome } from '../notification.types';
import { SmsRateLimiter } from './sms-rate-limiter';

export { SmsRateLimiter, type IRedisClient } from './sms-rate-limiter';

/**
 * SmsTwilioProvider (NTF-03).
 *
 * Wraps the official `twilio` SDK for transactional SMS. Same graceful-
 * degradation rules as the email provider, plus:
 *   - Per-recipient rate limit: max 3 SMS / hour / phone via Redis sorted-set
 *     sliding window (rate limiter injected as a constructor dep).
 *   - Invalid number (Twilio code 21211 / 21610 / 21614) -> non-retryable,
 *     job moves to DLQ with WARN log.
 *
 * The SMS body is capped at 480 chars (Twilio splits at 160; 480 = 3 segments
 * which is the operational cost ceiling we accept for an alert).
 */
@Injectable()
export class SmsTwilioProvider {
  readonly channel = 'sms' as const;
  private readonly logger = new Logger(SmsTwilioProvider.name);
  private readonly client: Twilio | null;
  private readonly fromNumber: string;
  private readonly dryRun: boolean;

  constructor(private readonly rateLimiter: SmsRateLimiter) {
    const sid = process.env['TWILIO_ACCOUNT_SID'];
    const token = process.env['TWILIO_AUTH_TOKEN'];
    this.fromNumber = process.env['TWILIO_FROM_NUMBER'] ?? '';
    this.dryRun = process.env['NTF_DRY_RUN'] !== 'false';

    if (!sid || !token || !this.fromNumber) {
      this.logger.warn(
        'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER missing — SMS delivery will return skipped/provider_not_configured.',
      );
      this.client = null;
      return;
    }
    this.client = twilio(sid, token);
    this.logger.log(`Twilio SMS provider initialised (from=${this.fromNumber}, dryRun=${this.dryRun})`);
  }

  async send(job: NotificationJobPayload): Promise<NotificationOutcome> {
    if (!job.recipient.phone) {
      return { status: 'skipped', reason: 'recipient_missing_address' };
    }
    if (!this.client) {
      return { status: 'skipped', reason: 'provider_not_configured' };
    }

    const allowed = await this.rateLimiter.tryAcquire(job.tenantId, job.recipient.phone);
    if (!allowed) {
      this.logger.warn(
        `SMS rate-limited tenant=${job.tenantId} to=${job.recipient.phone} (max 3/h/recipient)`,
      );
      return { status: 'skipped', reason: 'rate_limited' };
    }

    if (this.dryRun) {
      this.logger.log(
        `dry-run sms to=${job.recipient.phone} template=${job.templateKey} tenant=${job.tenantId}`,
      );
      return { status: 'skipped', reason: 'dry_run' };
    }

    const body = renderSmsBody(job);
    try {
      const msg = await this.client.messages.create({
        from: this.fromNumber,
        to: job.recipient.phone,
        body,
      });
      return { status: 'delivered', providerMessageId: msg.sid };
    } catch (err) {
      const code = (err as { code?: number }).code;
      const message = (err as Error).message ?? 'unknown twilio error';
      // 21xxx codes = client-side errors (bad number, unsupported region…).
      // Retrying won't help — push to DLQ.
      if (code !== undefined && code >= 21000 && code < 22000) {
        this.logger.warn(`Twilio non-retryable error code=${code}: ${message}`);
        return { status: 'failed', error: `Twilio ${code}: ${message}`, retryable: false };
      }
      this.logger.warn(`Twilio retryable error: ${message}`);
      throw err;
    }
  }
}

function renderSmsBody(job: NotificationJobPayload): string {
  const severity = (job.metadata?.severity ?? 'info').toUpperCase();
  const title = String(job.payload['title'] ?? job.templateKey);
  const body = String(job.payload['body'] ?? '');
  const raw = `[${severity}] ${title} — ${body}`;
  const cap = 480;
  return raw.length > cap ? `${raw.slice(0, cap - 1)}…` : raw;
}

// `SmsRateLimiter` + `IRedisClient` extracted to ./sms-rate-limiter.ts to
// break a temporal-dead-zone at module load (the @Injectable metadata on
// SmsTwilioProvider above references SmsRateLimiter — if both lived in this
// file the decorator ran before the class was initialised under Node 24).
// Re-exported above for back-compat with existing imports.
