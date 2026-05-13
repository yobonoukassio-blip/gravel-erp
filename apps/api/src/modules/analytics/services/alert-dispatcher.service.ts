import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlertChannel, AlertRule, AlertSeverity } from '../entities/alert-rule.entity';

export interface AlertPayload {
  tenantId: string;
  eventType: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  context?: Record<string, unknown>;
}

/**
 * AlertDispatcherService (DSH-06).
 *
 * Listens to a broad set of domain events and routes them to configured channels
 * (email / sms / in_app) per `alert_rule` config. Recipients are resolved from
 * role_codes + user_ids.
 *
 * Provider adapters (email, SMS) are pluggable — Phase 4 ships in_app only;
 * email/SMS providers are wired via DI in Phase 6 (per CLAUDE.md staged delivery).
 */
@Injectable()
export class AlertDispatcherService {
  private readonly logger = new Logger(AlertDispatcherService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // Listen to multiple critical event types and route through alert_rule config
  @OnEvent('production.stockpile.threshold_crossed')
  async onStockpileThreshold(payload: { tenantId: string; stockpileId: string; level: string }) {
    await this.dispatch({
      tenantId: payload.tenantId,
      eventType: 'production.stockpile.threshold_crossed',
      severity: payload.level === 'critical_low' ? 'critical' : 'warning',
      title: `Stock threshold ${payload.level}`,
      body: `Stockpile ${payload.stockpileId} crossed ${payload.level}`,
      context: payload,
    });
  }

  @OnEvent('maintenance.spare_part.threshold_crossed')
  async onSparePartLow(payload: { tenantId: string; sku: string; quantityOnHand: number }) {
    await this.dispatch({
      tenantId: payload.tenantId,
      eventType: 'maintenance.spare_part.threshold_crossed',
      severity: 'warning',
      title: `Spare part low: ${payload.sku}`,
      body: `Quantity on hand: ${payload.quantityOnHand}`,
      context: payload,
    });
  }

  @OnEvent('hse.incident.created')
  async onHseIncident(payload: { tenantId: string; severity: number; incidentId: string }) {
    await this.dispatch({
      tenantId: payload.tenantId,
      eventType: 'hse.incident.created',
      severity: payload.severity >= 4 ? 'critical' : 'warning',
      title: `HSE incident sev=${payload.severity}`,
      body: `Incident ${payload.incidentId} created`,
      context: payload,
    });
  }

  @OnEvent('tir.explosives.reconciliation_gap')
  async onExplosivesGap(payload: { tenantId: string; date: string; gapKg: number }) {
    await this.dispatch({
      tenantId: payload.tenantId,
      eventType: 'tir.explosives.reconciliation_gap',
      severity: 'critical',
      title: 'Explosives reconciliation gap',
      body: `${payload.date}: gap of ${payload.gapKg} kg blocks closure`,
      context: payload,
    });
  }

  /** Core dispatcher — finds matching rules and routes through channel providers. */
  private async dispatch(alert: AlertPayload): Promise<void> {
    const rules = await this.ds.getRepository(AlertRule).find({
      where: { tenantId: alert.tenantId, eventType: alert.eventType, isActive: true },
    });

    for (const rule of rules) {
      if (rule.severityFilter && rule.severityFilter !== alert.severity) continue;
      for (const channel of rule.channels) {
        try {
          await this.deliverThroughChannel(channel, rule, alert);
        } catch (err) {
          this.logger.error(
            `alert delivery failed channel=${channel} event=${alert.eventType}: ${(err as Error).message}`,
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
    switch (channel) {
      case 'in_app':
        // Insert into existing alerts table (Phase 2 W0-P01)
        await this.ds.query(
          `INSERT INTO alert (tenant_id, type, severity, title, body, context, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'open')
           ON CONFLICT DO NOTHING`,
          [
            alert.tenantId,
            alert.eventType,
            alert.severity,
            alert.title,
            alert.body,
            JSON.stringify(alert.context ?? {}),
          ],
        );
        return;
      case 'email':
        this.logger.log(
          `[email-stub] would send to ${rule.userIds.length} users + roles ${rule.roleCodes.join(',')}: ${alert.title}`,
        );
        return;
      case 'sms':
        this.logger.log(`[sms-stub] would SMS: ${alert.title}`);
        return;
    }
  }
}
