import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DashboardAggregatorService, SiteDirectorDashboard } from '../services/dashboard-aggregator.service';
import { SseBroadcasterService } from '../services/sse-broadcaster.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string; siteId?: string };
  on?: (event: string, listener: () => void) => void;
}

/**
 * SiteDirectorDashboardController (DSH-01, D2-70, D2-72).
 *
 * GET /dashboards/site-director         — snapshot payload
 * GET /dashboards/site-director/stream  — SSE live stream
 *
 * RBAC: SITE_MANAGER + DIRECTION_GROUPE roles (enforced at JwtAuthGuard level
 * via Keycloak realm roles — guard wiring is Phase 2 W0).
 */
@Controller('dashboards/site-director')
export class SiteDirectorDashboardController {
  private readonly logger = new Logger(SiteDirectorDashboardController.name);

  constructor(
    private readonly aggregator: DashboardAggregatorService,
    private readonly broadcaster: SseBroadcasterService,
  ) {}

  @Get()
  async getSnapshot(
    @Req() req: AuthedRequest,
    @Query('site_id') siteId: string,
    @Query('operational_day_id') operationalDayId: string,
  ): Promise<SiteDirectorDashboard> {
    const tenantId = req.user.tenantId;
    try {
      return await this.aggregator.computeForSiteDirector(tenantId, siteId, operationalDayId);
    } catch (err) {
      this.logger.warn(
        `Dashboard aggregator failed for site=${siteId} day=${operationalDayId} — returning empty defaults. Reason: ${(err as Error).message}`,
      );
      return {
        tonnage_today_kg: 0n,
        tonnage_yesterday_kg: 0n,
        tonnage_week_kg: 0n,
        tonnage_month_kg: 0n,
        drilling_yield_m_per_h_today: 0,
        extraction_yield_t_per_h_today: 0,
        tf_rolling_12m: 0,
        open_incidents_by_severity: [],
        fuel_tanks: [],
        stockpiles: [],
        equipment_out_of_service: [],
        cost_per_ton_provisional: { value_xof_per_ton: 0, fuel_only: true, computed_at_utc: new Date() } as never,
        downtime_today_minutes: 0,
        open_work_orders_count: 0,
        vte_revenue: { weekRevenueXof: '0', monthRevenueXof: '0' } as never,
      };
    }
  }

  /**
   * SSE streaming endpoint (D2-71).
   *
   * Channel key: `${tenantId}:${siteId}:site-director`
   * Resume: supports `?last_event_id=` query param (EventSource fallback).
   */
  @Get('stream')
  openStream(
    @Req() req: AuthedRequest,
    @Query('site_id') siteId: string,
    @Query('last_event_id') lastEventId: string | undefined,
    @Res() res: Response,
  ): void {
    const tenantId = req.user.tenantId;
    const channelKey = `${tenantId}:${siteId}:site-director`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.broadcaster.register(channelKey, res, lastEventId);

    req.on?.('close', () => {
      this.broadcaster.unregister(channelKey, res);
      this.logger.log(`SSE client disconnected from ${channelKey}`);
    });
  }
}
