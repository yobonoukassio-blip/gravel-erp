import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DashboardAggregatorService, SiteDirectorDashboard } from '../services/dashboard-aggregator.service';
import { SseBroadcasterService } from '../services/sse-broadcaster.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string; siteId?: string };
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
    return this.aggregator.computeForSiteDirector(tenantId, siteId, operationalDayId);
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
