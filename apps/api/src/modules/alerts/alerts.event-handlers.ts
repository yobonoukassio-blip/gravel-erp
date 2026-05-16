import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertsService } from './alerts.service';
import { AlertSeverity } from './alert.entity';

interface EventEnvelope<P = Record<string, unknown>> {
  tenantId: string;
  aggregateType?: string;
  aggregateId?: string;
  outboxId?: string;
  payload: P & { site_id: string; severity?: AlertSeverity };
}

/**
 * Translates domain events into Alert rows.
 *
 * Wired via @OnEvent — registered when AlertsModule is imported. Per
 * D2-74:
 *   - production.stockpile.threshold_crossed → 1 alerte per crossing
 *     (deduped on stockpile_id + calibre_code + threshold_type)
 *   - production.fuel.anomaly_detected → 1 alerte per equipment_id +
 *     rolling-window key, severity from ratio magnitude
 *   - hse.incident.created → 1 alerte per incident_id, severity from
 *     HseIncident.severity (1-2 = low/medium, 3 = high, 4-5 = critical)
 */
@Injectable()
export class AlertsEventHandlers {
  private readonly logger = new Logger(AlertsEventHandlers.name);

  constructor(private readonly alerts: AlertsService) {}

  @OnEvent('production.stockpile.threshold_crossed')
  async onStockpileThreshold(evt: EventEnvelope): Promise<void> {
    const p = evt.payload as {
      site_id: string;
      stockpile_id: string;
      calibre_code: string;
      threshold_type: 'low' | 'critical_low' | 'high';
      severity?: AlertSeverity;
    };
    const severity: AlertSeverity =
      p.threshold_type === 'critical_low' ? 'critical' : 'high';

    await this.alerts.createFromEvent({
      tenantId: evt.tenantId,
      siteId: p.site_id,
      sourceEventType: 'production.stockpile.threshold_crossed',
      sourceEventId: evt.outboxId ?? null,
      // Dedupe key: same stockpile + calibre + threshold = 1 OPEN alert.
      dedupeKey: `stockpile:${p.stockpile_id}:${p.calibre_code}:${p.threshold_type}`,
      severity,
      payload: evt.payload,
    });
  }

  @OnEvent('production.fuel.anomaly_detected')
  async onFuelAnomaly(evt: EventEnvelope): Promise<void> {
    const p = evt.payload as {
      site_id: string;
      equipment_id: string;
      direction: 'high' | 'low';
      ratio_observed: number;
      ratio_median_30d: number;
    };
    await this.alerts.createFromEvent({
      tenantId: evt.tenantId,
      siteId: p.site_id,
      sourceEventType: 'production.fuel.anomaly_detected',
      sourceEventId: evt.outboxId ?? null,
      dedupeKey: `fuel-anomaly:${p.equipment_id}:${p.direction}`,
      severity: 'high',
      payload: evt.payload,
    });
  }

  @OnEvent('rh.certification.expiring_soon')
  async onCertificationExpiringSoon(evt: EventEnvelope): Promise<void> {
    const p = evt.payload as {
      site_id: string;
      count: number;
      as_of_date: string;
      within_days: number;
    };
    await this.alerts.createFromEvent({
      tenantId: evt.tenantId,
      siteId: p.site_id,
      sourceEventType: 'rh.certification.expiring_soon',
      sourceEventId: null,
      dedupeKey: `rh-cert-expiring:${p.site_id}:${p.as_of_date}`,
      severity: 'medium',
      payload: evt.payload,
    });
  }

  /**
   * tir.reconciliation.gap_detected → 1 alert per site+day gap.
   * Deduped: same site+day produces one OPEN alert until resolved.
   */
  @OnEvent('tir.reconciliation.gap_detected')
  async onTirReconciliationGap(evt: {
    tenantId: string;
    siteId: string;
    gapG: number;
    operationalDayId: string;
  }): Promise<void> {
    await this.alerts.createFromEvent({
      tenantId: evt.tenantId,
      siteId: evt.siteId,
      sourceEventType: 'tir.reconciliation.gap_detected',
      sourceEventId: null,
      dedupeKey: `tir:${evt.siteId}:${evt.operationalDayId}:recon_gap`,
      severity: 'high',
      payload: {
        site_id: evt.siteId,
        gap_g: evt.gapG,
        operational_day_id: evt.operationalDayId,
      },
    });
  }

  /**
   * tir.blast_plan.fire_clearance_timeout → alert for TIR_SUPERVISOR.
   * Not deduped — each timeout is a distinct alert.
   */
  @OnEvent('tir.blast_plan.fire_clearance_timeout')
  async onBlastPlanClearanceTimeout(evt: {
    planId: string;
    tenantId: string;
    siteId: string;
  }): Promise<void> {
    await this.alerts.createFromEvent({
      tenantId: evt.tenantId,
      siteId: evt.siteId,
      sourceEventType: 'tir.blast_plan.fire_clearance_timeout',
      sourceEventId: evt.planId,
      dedupeKey: null,
      severity: 'critical',
      payload: {
        site_id: evt.siteId,
        plan_id: evt.planId,
      },
    });
  }

  @OnEvent('hse.incident.created')
  async onHseIncident(evt: EventEnvelope): Promise<void> {
    const p = evt.payload as {
      site_id: string;
      incident_id: string;
      severity_numeric: 1 | 2 | 3 | 4 | 5;
    };
    const severity: AlertSeverity =
      p.severity_numeric >= 4 ? 'critical' :
      p.severity_numeric === 3 ? 'high' :
      p.severity_numeric === 2 ? 'medium' : 'low';

    await this.alerts.createFromEvent({
      tenantId: evt.tenantId,
      siteId: p.site_id,
      sourceEventType: 'hse.incident.created',
      // Incidents are never deduped: each incident gets its own alert.
      sourceEventId: p.incident_id,
      dedupeKey: null,
      severity,
      payload: evt.payload,
    });
  }

  /**
   * Spare-part stock dropped at or below threshold (D-08, D-10, D-13).
   * Deduped: same spare_part + 'below_threshold' = 1 OPEN alert.
   */
  @OnEvent('maintenance.spare_part.threshold_crossed')
  async onSparePartThresholdCrossed(evt: {
    tenantId: string;
    siteId: string;
    sparePartId: string;
    sku?: string;
    quantityOnHand: number;
    thresholdMin: number | null;
    severity: 'high' | 'critical';
  }): Promise<void> {
    await this.alerts.createFromEvent({
      tenantId: evt.tenantId,
      siteId: evt.siteId,
      sourceEventType: 'maintenance.spare_part.threshold_crossed',
      sourceEventId: null,
      dedupeKey: `spare_part:${evt.sparePartId}:below_threshold`,
      severity: evt.severity,
      payload: {
        site_id: evt.siteId,
        spare_part_id: evt.sparePartId,
        sku: evt.sku ?? null,
        quantity_on_hand: evt.quantityOnHand,
        threshold_min: evt.thresholdMin,
      },
    });
  }

  /**
   * Spare-part stock recovered above threshold (D-08, D-10). Resolves the
   * existing OPEN alert silently; no-op if no matching alert.
   */
  @OnEvent('maintenance.spare_part.threshold_recovered')
  async onSparePartThresholdRecovered(evt: {
    tenantId: string;
    sparePartId: string;
  }): Promise<void> {
    await this.alerts.resolveByDedupeKey(
      evt.tenantId,
      `spare_part:${evt.sparePartId}:below_threshold`,
    );
  }
}
