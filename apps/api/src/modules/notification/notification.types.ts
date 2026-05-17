/**
 * Notification module types (Phase 9 — NTF-01).
 *
 * Channel-agnostic job payload pushed onto the BullMQ 'notifications' queue
 * by `NotificationService.dispatch(...)` and consumed by `NotificationProcessor`.
 */

export type NotificationChannel = 'email' | 'sms' | 'in_app';

export type NotificationLocale = 'fr-CI' | 'fr-BF' | 'fr-ML' | 'fr-SN' | 'fr' | 'en';

export interface NotificationRecipient {
  readonly userId: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly displayName: string;
  readonly locale: NotificationLocale | string;
}

/**
 * Strongly-typed job payload on the BullMQ queue.
 * `tenantId` is mandatory — workers MUST set CLS tenant context before DB writes.
 */
export interface NotificationJobPayload {
  readonly tenantId: string;
  readonly channel: NotificationChannel;
  readonly recipient: NotificationRecipient;
  /** Stable key (e.g. 'alert.stockpile.critical_low') for template lookup. */
  readonly templateKey: string;
  /** Template variables — must be JSON-serialisable. */
  readonly payload: Record<string, unknown>;
  /** Optional context for audit / dedupe. */
  readonly metadata?: {
    readonly alertId?: string;
    readonly ruleId?: string;
    readonly eventType?: string;
    readonly severity?: 'info' | 'warning' | 'high' | 'critical';
  };
}

/**
 * Result reported by a channel worker for observability.
 * `skipped: 'provider_not_configured'` is the canonical production posture
 * when API keys are absent at boot — the job MUST NOT crash.
 */
export type NotificationOutcome =
  | { readonly status: 'delivered'; readonly providerMessageId?: string }
  | { readonly status: 'skipped'; readonly reason: 'provider_not_configured' | 'recipient_missing_address' | 'dry_run' | 'rate_limited' }
  | { readonly status: 'failed'; readonly error: string; readonly retryable: boolean };

/** Queue name used by both producer (`NotificationService`) and consumer (`NotificationProcessor`). */
export const NOTIFICATION_QUEUE_NAME = 'notifications';

/** Job name within the queue — single job type for now (keep simple). */
export const NOTIFICATION_JOB_NAME = 'dispatch';
