import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

interface PmOpenedPayload {
  tenant_id: string;
  site_id: string;
  equipment_id: string;
  pm_plan_id: string | null;
  work_order_id: string;
  severity: 'info' | 'warning' | 'critical';
  due_reason: string | null;
  overdue_by: string | null;
}

/**
 * PmOpenedAlertHandler (Phase 8 D-17) — bridges
 * `maintenance.work_order.preventive_opened` into the generic alert bus so
 * AlertsModule can dispatch notifications without coupling MaintenanceModule
 * to AlertsModule's emission shape.
 */
@Injectable()
export class PmOpenedAlertHandler {
  private readonly logger = new Logger(PmOpenedAlertHandler.name);

  constructor(private readonly events: EventEmitter2) {}

  @OnEvent('maintenance.work_order.preventive_opened')
  onPreventiveOpened(payload: PmOpenedPayload): void {
    this.events.emit('maintenance.preventive_maintenance.opened', {
      tenantId: payload.tenant_id,
      siteId: payload.site_id,
      equipmentId: payload.equipment_id,
      pmPlanId: payload.pm_plan_id,
      workOrderId: payload.work_order_id,
      severity: payload.severity,
      dueReason: payload.due_reason,
      overdueBy: payload.overdue_by,
    });
    this.logger.log(
      `PM opened → alert bridge for WO ${payload.work_order_id} (sev ${payload.severity})`,
    );
  }
}
