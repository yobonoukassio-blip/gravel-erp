import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SseBroadcasterService } from '../services/sse-broadcaster.service';

// ---------------------------------------------------------------------------
// Shared event shapes (minimal — only fields we need for channel routing)
// ---------------------------------------------------------------------------

interface TenantSiteEvent {
  tenantId?: string;
  siteId?: string;
  payload?: {
    tenant_id?: string;
    site_id?: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * DashboardProjectionHandler (DSH-01, D2-71).
 *
 * Listens to 6 domain events and broadcasts KPI deltas to impacted SSE
 * channels. Both `site-director` and `quarry-chief` channels receive
 * a `{ kind: 'kpi.delta', updated_keys: [...], values: {...} }` payload.
 *
 * Channel key scheme: `${tenantId}:${siteId}:${dashboardKey}`
 */
@Injectable()
export class DashboardProjectionHandler {
  private readonly logger = new Logger(DashboardProjectionHandler.name);

  constructor(private readonly broadcaster: SseBroadcasterService) {}

  // -----------------------------------------------------------------------
  // 1. Foration — hole drilled
  // -----------------------------------------------------------------------

  @OnEvent('production.foration.hole_drilled')
  onHoleDrilled(evt: TenantSiteEvent): void {
    const { tenantId, siteId } = this.extractIds(evt);
    if (!tenantId || !siteId) return;
    const delta = {
      kind: 'kpi.delta',
      source: 'production.foration.hole_drilled',
      updated_keys: ['drilling_yield_m_per_h_today', 'active_drilling_plans'],
      values: { payload: evt.payload ?? evt },
    };
    this.emitToBothDashboards(tenantId, siteId, delta);
  }

  // -----------------------------------------------------------------------
  // 2. Extraction — cycle appended
  // -----------------------------------------------------------------------

  @OnEvent('production.extraction.cycle_appended')
  onExtractionCycleAppended(evt: TenantSiteEvent): void {
    const { tenantId, siteId } = this.extractIds(evt);
    if (!tenantId || !siteId) return;
    const delta = {
      kind: 'kpi.delta',
      source: 'production.extraction.cycle_appended',
      updated_keys: ['extraction_yield_t_per_h_today'],
      values: { payload: evt.payload ?? evt },
    };
    this.emitToBothDashboards(tenantId, siteId, delta);
  }

  // -----------------------------------------------------------------------
  // 3. Transport — rotation completed
  // -----------------------------------------------------------------------

  @OnEvent('production.transport.rotation_completed')
  onRotationCompleted(evt: TenantSiteEvent): void {
    const { tenantId, siteId } = this.extractIds(evt);
    if (!tenantId || !siteId) return;
    const delta = {
      kind: 'kpi.delta',
      source: 'production.transport.rotation_completed',
      updated_keys: [
        'tonnage_today_kg',
        'truck_rotations_today',
        'weighing_queue_size',
      ],
      values: { payload: evt.payload ?? evt },
    };
    this.emitToBothDashboards(tenantId, siteId, delta);
  }

  // -----------------------------------------------------------------------
  // 4. Stockpile — event appended
  // -----------------------------------------------------------------------

  @OnEvent('production.stockpile.event_appended')
  onStockpileEventAppended(evt: TenantSiteEvent): void {
    const { tenantId, siteId } = this.extractIds(evt);
    if (!tenantId || !siteId) return;
    const delta = {
      kind: 'kpi.delta',
      source: 'production.stockpile.event_appended',
      updated_keys: ['stockpiles', 'tonnage_today_kg', 'cost_per_ton_provisional'],
      values: { payload: evt.payload ?? evt },
    };
    this.emitToBothDashboards(tenantId, siteId, delta);
  }

  // -----------------------------------------------------------------------
  // 5. Fuel — refuel appended
  // -----------------------------------------------------------------------

  @OnEvent('production.fuel.refuel_appended')
  onFuelRefuelAppended(evt: TenantSiteEvent): void {
    const { tenantId, siteId } = this.extractIds(evt);
    if (!tenantId || !siteId) return;
    const delta = {
      kind: 'kpi.delta',
      source: 'production.fuel.refuel_appended',
      updated_keys: ['fuel_tanks', 'cost_per_ton_provisional'],
      values: { payload: evt.payload ?? evt },
    };
    this.emitToBothDashboards(tenantId, siteId, delta);
  }

  // -----------------------------------------------------------------------
  // 6. HSE — incident created
  // -----------------------------------------------------------------------

  @OnEvent('hse.incident.created')
  onIncidentCreated(evt: TenantSiteEvent): void {
    const { tenantId, siteId } = this.extractIds(evt);
    if (!tenantId || !siteId) return;
    const delta = {
      kind: 'kpi.delta',
      source: 'hse.incident.created',
      updated_keys: ['open_incidents_by_severity', 'tf_rolling_12m'],
      values: { payload: evt.payload ?? evt },
    };
    this.emitToBothDashboards(tenantId, siteId, delta);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private extractIds(evt: TenantSiteEvent): {
    tenantId: string | undefined;
    siteId: string | undefined;
  } {
    const tenantId = evt.tenantId ?? evt.payload?.tenant_id;
    const siteId = evt.siteId ?? evt.payload?.site_id;
    if (!tenantId || !siteId) {
      this.logger.warn('Dashboard projection event missing tenantId or siteId — skipped');
    }
    return { tenantId, siteId };
  }

  private emitToBothDashboards(
    tenantId: string,
    siteId: string,
    delta: unknown,
  ): void {
    const keys = [
      `${tenantId}:${siteId}:site-director`,
      `${tenantId}:${siteId}:quarry-chief`,
    ];
    for (const channelKey of keys) {
      this.broadcaster.emit(channelKey, delta);
    }
  }
}
