import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface HoleDrilledEvent {
  tenantId: string;
  payload: {
    tenant_id: string;
    hole_id: string;
    operational_day_id: string;
    machine_id: string;
    operator_id: string;
  };
}

/** 30s debounce — protects DB from refresh storms on bulk sync. */
const REFRESH_DEBOUNCE_MS = 30_000;

/**
 * ForationEventHandlers — listens to `production.foration.hole_drilled`
 * and refreshes the `drilling_yield_per_machine_day` materialized view
 * CONCURRENTLY, debounced per tenant.
 *
 * One Map<tenantId, NodeJS.Timeout> coalesces bursts: only the LAST
 * event in a 30s window triggers a single REFRESH.
 */
@Injectable()
export class ForationEventHandlers implements OnModuleDestroy {
  private readonly logger = new Logger(ForationEventHandlers.name);
  private readonly pendingRefresh = new Map<string, NodeJS.Timeout>();
  private readonly refreshInFlight = new Set<string>();

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @OnEvent('production.foration.hole_drilled')
  onHoleDrilled(evt: HoleDrilledEvent): void {
    const tenantId = evt.tenantId ?? evt.payload?.tenant_id;
    if (!tenantId) {
      this.logger.warn('hole_drilled event missing tenantId — refresh skipped');
      return;
    }

    const existing = this.pendingRefresh.get(tenantId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pendingRefresh.delete(tenantId);
      void this.refreshYieldMv(tenantId);
    }, REFRESH_DEBOUNCE_MS);
    // Don't keep the Node event loop alive solely for this timer.
    if (typeof timer.unref === 'function') timer.unref();
    this.pendingRefresh.set(tenantId, timer);
  }

  private async refreshYieldMv(tenantId: string): Promise<void> {
    if (this.refreshInFlight.has(tenantId)) {
      this.logger.debug(
        `Refresh already in flight for tenant ${tenantId}, skipping coalesced event`,
      );
      return;
    }
    this.refreshInFlight.add(tenantId);
    try {
      await this.ds.query(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY drilling_yield_per_machine_day',
      );
      this.logger.log(`drilling_yield_per_machine_day refreshed for tenant ${tenantId}`);
    } catch (err) {
      this.logger.error(
        `Failed to refresh drilling_yield_per_machine_day: ${(err as Error).message}`,
      );
    } finally {
      this.refreshInFlight.delete(tenantId);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.pendingRefresh.values()) {
      clearTimeout(timer);
    }
    this.pendingRefresh.clear();
  }
}
