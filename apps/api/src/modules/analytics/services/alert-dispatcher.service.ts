import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlertChannel, AlertRule, AlertSeverity } from '../entities/alert-rule.entity';
import { Recipient } from './notification-providers';
import { NotificationService } from '../../notification/notification.service';
import { NotificationJobPayload } from '../../notification/notification.types';

export interface AlertPayload {
  tenantId: string;
  /** Optional: scopes rule matching to a specific site. NULL matches tenant-wide rules only. */
  siteId?: string | null;
  eventType: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  context?: Record<string, unknown>;
}

/** Map analytics AlertSeverity ('info'|'warning'|'critical') to NotificationJobPayload metadata.severity */
function toNotifSeverity(
  s: AlertSeverity,
): 'info' | 'warning' | 'high' | 'critical' {
  switch (s) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * AlertDispatcherService (DSH-06).
 *
 * Listens to a broad set of domain events and routes them to configured channels
 * (email / sms / in_app) per `alert_rule` config. Recipients are resolved from
 * `rule.user_ids` + `rule.role_codes` against the `user` table.
 *
 * Channel providers are wired through the BullMQ `NotificationService`:
 *   - in_app : enqueues in_app job -> InAppProvider persists notification row
 *   - email  : enqueues email job  -> EmailBrevoProvider (or dry_run fallback)
 *   - sms    : enqueues sms job    -> SmsTwilioProvider  (or dry_run fallback)
 *
 * Async dispatch via BullMQ: delivery is decoupled from the event handler so
 * a Brevo/Twilio outage does not block the event loop. Retries and DLQ are
 * handled by the NotificationProcessor.
 */
@Injectable()
export class AlertDispatcherService {
  private readonly logger = new Logger(AlertDispatcherService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  @OnEvent('production.stockpile.threshold_crossed')
  async onStockpileThreshold(payload: {
    tenantId: string;
    siteId?: string;
    stockpileId: string;
    level: string;
  }): Promise<void> {
    await this.dispatch({
      tenantId: payload.tenantId,
      siteId: payload.siteId,
      eventType: 'production.stockpile.threshold_crossed',
      severity: payload.level === 'critical_low' ? 'critical' : 'warning',
      title: `Seuil stockpile ${payload.level}`,
      body: `Le stockpile ${payload.stockpileId} a franchi le seuil ${payload.level}`,
      context: payload,
    });
  }

  @OnEvent('maintenance.spare_part.threshold_crossed')
  async onSparePartLow(payload: {
    tenantId: string;
    siteId?: string;
    sku: string;
    quantityOnHand: number;
  }): Promise<void> {
    await this.dispatch({
      tenantId: payload.tenantId,
      siteId: payload.siteId,
      eventType: 'maintenance.spare_part.threshold_crossed',
      severity: 'warning',
      title: `Pièce de rechange basse : ${payload.sku}`,
      body: `Quantité en stock : ${payload.quantityOnHand}`,
      context: payload,
    });
  }

  // SF-013 (audit 2026-05-16): payload uses snake_case (canonical event
  // contract) — was reading camelCase `tenantId`/`siteId`/`severity`/`incidentId`
  // which were all undefined. Severity dispatch was always 'warning' because
  // `undefined >= 4` is false; HSE notifications never went out by email/SMS.
  @OnEvent('hse.incident.created')
  async onHseIncident(payload: {
    tenant_id: string;
    site_id?: string;
    severity_numeric: number;
    incident_id: string;
  }): Promise<void> {
    await this.dispatch({
      tenantId: payload.tenant_id,
      siteId: payload.site_id,
      eventType: 'hse.incident.created',
      severity: payload.severity_numeric >= 4 ? 'critical' : 'warning',
      title: `Incident HSE sévérité ${payload.severity_numeric}`,
      body: `Incident ${payload.incident_id} créé — investigation requise`,
      context: payload,
    });
  }

  // SF-014 (audit 2026-05-16): event name was `tir.explosives.reconciliation_gap`
  // but the emitter (`ExplosivesReconciliationJob`) emits
  // `tir.reconciliation.gap_detected` with payload { tenantId, siteId, gapG,
  // operationalDayId }. Email/SMS dispatch for explosives reconciliation gaps
  // therefore NEVER fired — only the in-app alert in AlertsEventHandlers did.
  // Aligned to the canonical event name and field shape.
  @OnEvent('tir.reconciliation.gap_detected')
  async onExplosivesGap(payload: {
    tenantId: string;
    siteId?: string;
    gapG: number;
    operationalDayId: string;
  }): Promise<void> {
    const gapKg = (payload.gapG / 1000).toFixed(3);
    await this.dispatch({
      tenantId: payload.tenantId,
      siteId: payload.siteId,
      eventType: 'tir.reconciliation.gap_detected',
      severity: 'critical',
      title: 'Écart de réconciliation explosifs',
      body: `Jour ${payload.operationalDayId} : écart de ${gapKg} kg — clôture bloquée`,
      context: payload,
    });
  }

  /** FIN-R06: route fuel-anomaly detector events through alert_rule. */
  @OnEvent('production.fuel.anomaly_detected')
  async onFuelAnomaly(payload: {
    tenantId: string;
    siteId?: string;
    tankId?: string;
    equipmentId?: string;
    anomalyType?: string;
  }): Promise<void> {
    const subject = payload.tankId ?? payload.equipmentId ?? 'inconnu';
    const reason = payload.anomalyType ?? 'écart détecté';
    await this.dispatch({
      tenantId: payload.tenantId,
      eventType: 'production.fuel.anomaly_detected',
      severity: 'warning',
      title: `Anomalie carburant : ${reason}`,
      body: `Source ${subject} — anomalie carburant détectée`,
      context: payload,
    });
  }

  /** Core dispatcher — finds matching rules and routes through channel providers. */
  private async dispatch(alert: AlertPayload): Promise<void> {
    const allRules = await this.ds.getRepository(AlertRule).find({
      where: { tenantId: alert.tenantId, eventType: alert.eventType, isActive: true },
    });

    // Site-scoped filtering: keep rules that are tenant-wide (siteId = null)
    // OR specifically scoped to the event's site.
    const rules = allRules.filter(
      (r) => r.siteId === null || r.siteId === (alert.siteId ?? null),
    );

    if (rules.length === 0) return;

    for (const rule of rules) {
      if (rule.severityFilter && rule.severityFilter !== alert.severity) continue;
      for (const channel of rule.channels) {
        try {
          await this.deliverThroughChannel(channel, rule, alert);
        } catch (err) {
          this.logger.error(
            `alert delivery failed channel=${channel} event=${alert.eventType} site=${alert.siteId ?? 'all'}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  private async deliverThroughChannel(
    channel: AlertChannel,
    rule: AlertRule,
    alert: AlertPayload,
  ): Promise<void> {
    const recipients = await this.resolveRecipients(rule);
    if (recipients.length === 0) {
      this.logger.warn(
        `no recipients resolved for rule ${rule.id} (event=${alert.eventType} channel=${channel})`,
      );
      return;
    }

    const notifSeverity = toNotifSeverity(alert.severity);

    // Enqueue one BullMQ job per recipient — each job carries its own
    // retry budget and is individually observable in Bull Board.
    for (const recipient of recipients) {
      const payload: NotificationJobPayload = {
        tenantId: alert.tenantId,
        channel: channel === 'in_app' ? 'in_app' : channel === 'email' ? 'email' : 'sms',
        recipient: {
          userId: recipient.userId,
          email: recipient.email,
          phone: recipient.phone,
          displayName: recipient.displayName,
          locale: recipient.locale,
        },
        templateKey: alert.eventType,
        payload: {
          title: alert.title,
          body: alert.body,
          ...(alert.context ?? {}),
        },
        metadata: {
          eventType: alert.eventType,
          ruleId: rule.id,
          severity: notifSeverity,
        },
      };
      await this.notifications.dispatch(payload);
    }
  }

  /**
   * Resolve recipients from rule.user_ids + rule.role_codes against the
   * `user` table. Deduplicates by user_id.
   */
  private async resolveRecipients(rule: AlertRule): Promise<Recipient[]> {
    const userIds = rule.userIds ?? [];
    const roleCodes = rule.roleCodes ?? [];
    if (userIds.length === 0 && roleCodes.length === 0) return [];

    const conditions: string[] = [];
    const params: unknown[] = [rule.tenantId];

    if (userIds.length > 0) {
      params.push(userIds);
      conditions.push(`u.id = ANY($${params.length}::uuid[])`);
    }
    if (roleCodes.length > 0) {
      params.push(roleCodes);
      conditions.push(`u.role_code = ANY($${params.length}::text[])`);
    }

    try {
      const rows = await this.ds.query<
        Array<{
          id: string;
          email: string | null;
          phone: string | null;
          display_name: string | null;
          preferred_locale: string | null;
        }>
      >(
        `SELECT DISTINCT u.id, u.email, u.phone, u.display_name, u.preferred_locale
         FROM "user" u
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND (${conditions.join(' OR ')})`,
        params,
      );
      return rows.map((r) => ({
        userId: r.id,
        email: r.email,
        phone: r.phone,
        displayName: r.display_name ?? r.email ?? r.id.slice(0, 8),
        locale: r.preferred_locale ?? 'fr-CI',
      }));
    } catch (err) {
      // SF-007 (audit 2026-05-16): rethrow so the dispatch call surfaces
      // 'recipient lookup failed' as a retryable error. Previously returned
      // `[]` which the caller interpreted as "no recipients" — alert was
      // marked dispatched but no one ever received an email/SMS/in-app push.
      this.logger.error(
        `recipient lookup failed for rule ${rule.id}: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
