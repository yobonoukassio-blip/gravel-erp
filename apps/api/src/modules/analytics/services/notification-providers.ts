import { Injectable, Logger } from '@nestjs/common';

export interface Recipient {
  readonly userId: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly displayName: string;
  readonly locale: string;
}

export interface NotificationMessage {
  readonly tenantId: string;
  readonly eventType: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly title: string;
  readonly body: string;
  readonly recipients: readonly Recipient[];
}

/**
 * NotificationProvider — channel-agnostic delivery interface.
 * Implementations: EmailProvider, SmsProvider.
 */
export interface NotificationProvider {
  readonly channel: 'email' | 'sms';
  send(message: NotificationMessage): Promise<NotificationResult>;
}

export interface NotificationResult {
  readonly delivered: number;
  readonly failed: number;
  readonly skipped: number;
  readonly errors: readonly string[];
}

/**
 * EmailProvider — SMTP-based email delivery.
 *
 * Wiring strategy: this adapter is provider-agnostic — it builds the message
 * envelope and delegates to a vendor SDK call site. The actual SMTP/SendGrid/
 * Mailgun client is not bundled (no runtime dependency). Configure via:
 *   - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  (for nodemailer-style)
 *   - SENDGRID_API_KEY                            (for SendGrid REST)
 *
 * Without env vars, this logs structured notification events that an external
 * sidecar (e.g. n8n, a Lambda, or a cron) can consume from logs. This
 * preserves the audit trail while leaving provider choice to ops.
 */
@Injectable()
export class EmailProvider implements NotificationProvider {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailProvider.name);

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const candidates = message.recipients.filter((r) => r.email);
    if (candidates.length === 0) {
      return { delivered: 0, failed: 0, skipped: message.recipients.length, errors: [] };
    }

    const apiKey = process.env['SENDGRID_API_KEY'];
    if (apiKey) {
      return this.sendViaSendgrid(message, candidates, apiKey);
    }

    // Default: log a structured `notification.email.queued` line for sidecar pickup.
    for (const r of candidates) {
      this.logger.log(
        JSON.stringify({
          kind: 'notification.email.queued',
          tenantId: message.tenantId,
          eventType: message.eventType,
          severity: message.severity,
          to: r.email,
          subject: `[${message.severity.toUpperCase()}] ${message.title}`,
          body: message.body,
          locale: r.locale,
        }),
      );
    }
    return {
      delivered: 0,
      failed: 0,
      skipped: candidates.length,
      errors: [],
    };
  }

  private async sendViaSendgrid(
    message: NotificationMessage,
    candidates: readonly Recipient[],
    apiKey: string,
  ): Promise<NotificationResult> {
    const fromEmail = process.env['SENDGRID_FROM_EMAIL'] ?? 'alerts@gravel-ivoire.app';
    const fromName = process.env['SENDGRID_FROM_NAME'] ?? 'Gravel Ivoire';
    let delivered = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const r of candidates) {
      try {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: r.email!, name: r.displayName }] }],
            from: { email: fromEmail, name: fromName },
            subject: `[${message.severity.toUpperCase()}] ${message.title}`,
            content: [{ type: 'text/plain', value: message.body }],
          }),
        });
        if (res.ok) {
          delivered++;
        } else {
          failed++;
          errors.push(`HTTP ${res.status} for ${r.email}`);
        }
      } catch (err) {
        failed++;
        errors.push(`${r.email}: ${(err as Error).message}`);
      }
    }
    return { delivered, failed, skipped: 0, errors };
  }
}

/**
 * SmsProvider — Twilio-based SMS delivery.
 *
 * Configure via:
 *   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * Without env vars, falls back to structured logging (same pattern as Email).
 */
@Injectable()
export class SmsProvider implements NotificationProvider {
  readonly channel = 'sms' as const;
  private readonly logger = new Logger(SmsProvider.name);

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const candidates = message.recipients.filter((r) => r.phone);
    if (candidates.length === 0) {
      return { delivered: 0, failed: 0, skipped: message.recipients.length, errors: [] };
    }

    const sid = process.env['TWILIO_ACCOUNT_SID'];
    const token = process.env['TWILIO_AUTH_TOKEN'];
    const from = process.env['TWILIO_FROM_NUMBER'];

    if (sid && token && from) {
      return this.sendViaTwilio(message, candidates, sid, token, from);
    }

    // Default: log queued event.
    const text = this.buildSmsText(message);
    for (const r of candidates) {
      this.logger.log(
        JSON.stringify({
          kind: 'notification.sms.queued',
          tenantId: message.tenantId,
          eventType: message.eventType,
          severity: message.severity,
          to: r.phone,
          text,
        }),
      );
    }
    return {
      delivered: 0,
      failed: 0,
      skipped: candidates.length,
      errors: [],
    };
  }

  private async sendViaTwilio(
    message: NotificationMessage,
    candidates: readonly Recipient[],
    accountSid: string,
    authToken: string,
    fromNumber: string,
  ): Promise<NotificationResult> {
    const text = this.buildSmsText(message);
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    let delivered = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const r of candidates) {
      try {
        const params = new URLSearchParams({
          To: r.phone!,
          From: fromNumber,
          Body: text,
        });
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          },
        );
        if (res.ok) {
          delivered++;
        } else {
          failed++;
          errors.push(`HTTP ${res.status} for ${r.phone}`);
        }
      } catch (err) {
        failed++;
        errors.push(`${r.phone}: ${(err as Error).message}`);
      }
    }
    return { delivered, failed, skipped: 0, errors };
  }

  private buildSmsText(message: NotificationMessage): string {
    // SMS body cap: 160 chars. We prefix severity + truncate.
    const prefix = `[${message.severity.toUpperCase()}] `;
    const room = 160 - prefix.length;
    const body = `${message.title} — ${message.body}`;
    return prefix + (body.length > room ? `${body.slice(0, room - 1)}…` : body);
  }
}
