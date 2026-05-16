import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert, AlertSeverity, AlertStatus } from './alert.entity';

export interface CreateAlertFromEventInput {
  tenantId: string;
  siteId: string;
  sourceEventType: string;
  sourceEventId?: string | null;
  /** When set, an existing OPEN alert with the same dedupe_key is reused. */
  dedupeKey?: string | null;
  severity: AlertSeverity;
  recipients?: string[];
  payload: Record<string, unknown>;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly repo: Repository<Alert>,
  ) {}

  /**
   * Create or dedupe an alert.
   *
   * If `dedupeKey` is provided and an OPEN alert with the same key exists
   * for this tenant, we return the existing row instead of inserting a new
   * one (prevents threshold-crossing spam — see D2-74 "1 alerte par
   * franchissement").
   */
  async createFromEvent(input: CreateAlertFromEventInput): Promise<Alert> {
    if (input.dedupeKey) {
      const existing = await this.repo.findOne({
        where: {
          tenantId: input.tenantId,
          dedupeKey: input.dedupeKey,
          status: 'open',
        },
      });
      if (existing) {
        return existing;
      }
    }

    const row = this.repo.create({
      tenantId: input.tenantId,
      siteId: input.siteId,
      sourceEventType: input.sourceEventType,
      sourceEventId: input.sourceEventId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      severity: input.severity,
      status: 'open',
      recipients: input.recipients ?? [],
      payload: input.payload,
    });
    return this.repo.save(row);
  }

  async list(opts: {
    tenantId: string;
    siteId?: string;
    status?: AlertStatus;
  }): Promise<Alert[]> {
    const where: Record<string, unknown> = { tenantId: opts.tenantId };
    if (opts.siteId) where.siteId = opts.siteId;
    if (opts.status) where.status = opts.status;
    return this.repo.find({ where, order: { createdAtUtc: 'DESC' } });
  }

  async ack(id: string, userId: string, tenantId: string): Promise<Alert> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`Alert ${id} not found`);
    if (row.status !== 'open') {
      throw new BadRequestException(`Alert ${id} is not in 'open' state`);
    }
    row.status = 'acked';
    row.ackedAtUtc = new Date();
    row.ackedBy = userId;
    return this.repo.save(row);
  }

  async resolve(id: string, userId: string, tenantId: string): Promise<Alert> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`Alert ${id} not found`);
    if (row.status === 'resolved') {
      throw new BadRequestException(`Alert ${id} already resolved`);
    }
    row.status = 'resolved';
    row.resolvedAtUtc = new Date();
    row.resolvedBy = userId;
    return this.repo.save(row);
  }

  /**
   * Silent resolve for recovery events (D-10). No-op when no matching OPEN
   * alert exists. Scoped strictly by tenantId so cross-tenant payloads
   * cannot resolve foreign alerts.
   */
  async resolveByDedupeKey(
    tenantId: string,
    dedupeKey: string,
  ): Promise<Alert | null> {
    const row = await this.repo.findOne({
      where: { tenantId, dedupeKey, status: 'open' },
    });
    if (!row) return null;
    row.status = 'resolved';
    row.resolvedAtUtc = new Date();
    // resolvedBy left null — system-triggered recovery, not a user action.
    return this.repo.save(row);
  }
}
