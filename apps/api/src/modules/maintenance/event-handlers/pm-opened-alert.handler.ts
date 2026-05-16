import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/alert.entity';

interface PmOpenedPayload {
  tenant_id: string;
  site_id: string;
  equipment_id: string;
  pm_plan_id: string;
  work_order_id: string;
  severity: 'warning' | 'critical';
  due_reason: 'hours' | 'km' | 'days' | null;
  overdue_by: number | null;
}

/**
 * PmOpenedAlertHandler (Phase 8 T03, D-15, D-17).
 *
 * Bridges `maintenance.work_order.preventive_opened` directly into an Alert
 * row via AlertsService.createFromEvent. The Alert is deduped on
 * `pm:<pm_plan_id>:overdue` so a second preventive_opened for the same plan
 * while the previous alert is still OPEN reuses the existing row.
 *
 * Severity mapping at the boundary (canonical Phase-8 convention):
 *   event 'warning'  -> Alert.severity 'high'
 *   event 'critical' -> Alert.severity 'critical'
 *
 * Recipients are resolved downstream by AlertDispatcherService through
 * `alert_rule.role_codes` matching event_type +/- severity_filter — those
 * rules are seeded by migration 1719100200000__phase08_seed_pm_alert_rules.sql.
 */
@Injectable()
export class PmOpenedAlertHandler {
  private readonly logger = new Logger(PmOpenedAlertHandler.name);

  constructor(private readonly alerts: AlertsService) {}

  @OnEvent('maintenance.work_order.preventive_opened')
  async onPreventiveOpened(evt: PmOpenedPayload): Promise<void> {
    const alertSeverity: AlertSeverity = evt.severity === 'critical' ? 'critical' : 'high';

    await this.alerts.createFromEvent({
      tenantId: evt.tenant_id,
      siteId: evt.site_id,
      sourceEventType: 'maintenance.work_order.preventive_opened',
      sourceEventId: evt.work_order_id,
      dedupeKey: `pm:${evt.pm_plan_id}:overdue`,
      severity: alertSeverity,
      payload: {
        equipment_id: evt.equipment_id,
        pm_plan_id: evt.pm_plan_id,
        work_order_id: evt.work_order_id,
        due_reason: evt.due_reason,
        overdue_by: evt.overdue_by,
        source_severity: evt.severity,
      },
    });

    this.logger.log(
      `[PmOpenedAlert] tenant=${evt.tenant_id} pm_plan=${evt.pm_plan_id} severity=${alertSeverity} (event=${evt.severity}) reason=${evt.due_reason} overdueBy=${evt.overdue_by}`,
    );
  }
}
