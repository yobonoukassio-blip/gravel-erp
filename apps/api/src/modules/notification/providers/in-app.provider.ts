import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationJobPayload, NotificationOutcome } from '../notification.types';

/**
 * InAppProvider (NTF-04).
 *
 * Persists an unread notification row for the recipient so the Angular header
 * badge picks it up on the next poll. Idempotent on (tenant_id, user_id,
 * alert_id) via a defensive find-then-insert (alert_id may be null for
 * non-alert notifications, in which case duplicates are allowed).
 */
@Injectable()
export class InAppProvider {
  readonly channel = 'in_app' as const;
  private readonly logger = new Logger(InAppProvider.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
  ) {}

  async send(job: NotificationJobPayload): Promise<NotificationOutcome> {
    const alertId = job.metadata?.alertId ?? null;
    if (alertId) {
      const existing = await this.repo.findOne({
        where: { tenantId: job.tenantId, userId: job.recipient.userId, alertId },
        select: ['id'],
      });
      if (existing) {
        return { status: 'delivered', providerMessageId: existing.id };
      }
    }
    const row = this.repo.create({
      tenantId: job.tenantId,
      userId: job.recipient.userId,
      alertId,
      title: String(job.payload['title'] ?? job.templateKey),
      body: String(job.payload['body'] ?? ''),
      severity: normalizeSeverity(job.metadata?.severity),
      eventType: job.metadata?.eventType ?? null,
    });
    const saved = await this.repo.save(row);
    return { status: 'delivered', providerMessageId: saved.id };
  }
}

function normalizeSeverity(s: string | undefined): 'info' | 'warning' | 'high' | 'critical' {
  if (s === 'critical' || s === 'high' || s === 'warning' || s === 'info') return s;
  return 'info';
}
