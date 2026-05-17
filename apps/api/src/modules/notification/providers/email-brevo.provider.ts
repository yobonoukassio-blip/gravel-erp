import { Injectable, Logger } from '@nestjs/common';
import { BrevoClient } from '@getbrevo/brevo';
import {
  NotificationJobPayload,
  NotificationOutcome,
  NotificationRecipient,
} from '../notification.types';

/**
 * EmailBrevoProvider (NTF-02).
 *
 * Wraps the `@getbrevo/brevo` SDK (v5 BrevoClient API) to send a single
 * transactional email. Graceful-degradation rules:
 *   - Missing `BREVO_API_KEY`        -> outcome: skipped/provider_not_configured (WARN once at boot)
 *   - Missing recipient email        -> outcome: skipped/recipient_missing_address
 *   - `NTF_DRY_RUN=true`             -> outcome: skipped/dry_run (no HTTP call)
 *   - Brevo 4xx (bad request/auth)   -> outcome: failed/retryable=false (sent to DLQ immediately)
 *   - Brevo 5xx / network            -> throw -> BullMQ retries with exponential backoff
 *
 * Locale handling: per-locale render in `renderEmail` with French fallback.
 */
@Injectable()
export class EmailBrevoProvider {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailBrevoProvider.name);
  private readonly client: BrevoClient | null;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly dryRun: boolean;

  constructor() {
    const apiKey = process.env['BREVO_API_KEY'];
    this.senderEmail = process.env['BREVO_SENDER_EMAIL'] ?? 'alerts@gravel-ivoire.app';
    this.senderName = process.env['BREVO_SENDER_NAME'] ?? 'Gravel Ivoire';
    this.dryRun = process.env['NTF_DRY_RUN'] !== 'false';

    if (!apiKey) {
      this.logger.warn(
        'BREVO_API_KEY not set — email delivery will return skipped/provider_not_configured. Set BREVO_API_KEY to enable real sends.',
      );
      this.client = null;
      return;
    }

    this.client = new BrevoClient({ apiKey });
    this.logger.log(
      `Brevo email provider initialised (sender=${this.senderEmail}, dryRun=${this.dryRun})`,
    );
  }

  async send(job: NotificationJobPayload): Promise<NotificationOutcome> {
    if (job.recipient.email === null || job.recipient.email === '') {
      return { status: 'skipped', reason: 'recipient_missing_address' };
    }
    if (!this.client) {
      return { status: 'skipped', reason: 'provider_not_configured' };
    }
    if (this.dryRun) {
      this.logger.log(
        `dry-run email to=${job.recipient.email} template=${job.templateKey} tenant=${job.tenantId}`,
      );
      return { status: 'skipped', reason: 'dry_run' };
    }

    const rendered = renderEmail(job);

    try {
      const res = await this.client.transactionalEmails.sendTransacEmail({
        sender: { email: this.senderEmail, name: this.senderName },
        to: [{ email: job.recipient.email, name: job.recipient.displayName }],
        subject: rendered.subject,
        htmlContent: rendered.html,
        textContent: rendered.text,
        tags: [job.templateKey, `tenant:${job.tenantId}`],
      });
      const providerMessageId =
        (res as { messageId?: string; data?: { messageId?: string } }).messageId ??
        (res as { data?: { messageId?: string } }).data?.messageId;
      return { status: 'delivered', providerMessageId };
    } catch (err) {
      const status = extractHttpStatus(err);
      const message = (err as Error).message ?? 'unknown brevo error';
      if (status !== null && status >= 400 && status < 500) {
        this.logger.error(`Brevo ${status} (non-retryable): ${message}`);
        return { status: 'failed', error: `Brevo ${status}: ${message}`, retryable: false };
      }
      this.logger.warn(`Brevo retryable error: ${message}`);
      throw err;
    }
  }
}

interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Minimal locale-aware template renderer. Real templating (Handlebars/MJML)
 * is deliberately out of scope for v1.1 — payload fields are interpolated into
 * a per-locale string table. Add new templates here as alerts grow.
 */
function renderEmail(job: NotificationJobPayload): RenderedEmail {
  const locale = pickLocale(job.recipient.locale);
  const severity = job.metadata?.severity ?? 'info';
  const title = String(job.payload['title'] ?? job.templateKey);
  const body = String(job.payload['body'] ?? '');
  const subjectPrefix = locale === 'en' ? '[Gravel Alert]' : '[Alerte Gravel]';
  const subject = `${subjectPrefix} ${title}`;

  const greeting = locale === 'en' ? 'Hello' : 'Bonjour';
  const footer =
    locale === 'en'
      ? 'You receive this email because you are configured as a recipient in alert_rule.'
      : 'Vous recevez cet email car vous êtes configuré comme destinataire dans alert_rule.';

  const text = `${greeting} ${job.recipient.displayName},\n\n${title}\n${body}\n\n— ${footer}`;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;">
<p>${escapeHtml(greeting)} ${escapeHtml(job.recipient.displayName)},</p>
<h2 style="color:${severityColor(severity)};">${escapeHtml(title)}</h2>
<p>${escapeHtml(body)}</p>
<hr/>
<p style="font-size:12px;color:#888;">${escapeHtml(footer)}</p>
</body></html>`;
  return { subject, text, html };
}

function pickLocale(locale: NotificationRecipient['locale']): 'fr' | 'en' {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#b91c1c';
    case 'high':
      return '#c2410c';
    case 'warning':
      return '#a16207';
    default:
      return '#1e40af';
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractHttpStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { statusCode?: number; status?: number; response?: { status?: number; statusCode?: number } };
  return (
    e.statusCode ??
    e.status ??
    e.response?.status ??
    e.response?.statusCode ??
    null
  );
}
