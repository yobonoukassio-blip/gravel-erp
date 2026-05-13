import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DashboardAggregatorService, QuarryChiefDashboard } from '../services/dashboard-aggregator.service';
import { SseBroadcasterService } from '../services/sse-broadcaster.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string };
  on?: (event: string, listener: () => void) => void;
}

/**
 * QuarryChiefDashboardController (DSH-01, D2-73).
 *
 * GET /dashboards/quarry-chief         — snapshot
 * GET /dashboards/quarry-chief/stream  — SSE live stream
 *
 * RBAC: QUARRY_CHIEF + SITE_MANAGER (Keycloak realm roles via JwtAuthGuard).
 */
@Controller('dashboards/quarry-chief')
export class QuarryChiefDashboardController {
  private readonly logger = new Logger(QuarryChiefDashboardController.name);

  constructor(
    private readonly aggregator: DashboardAggregatorService,
    private readonly broadcaster: SseBroadcasterService,
  ) {}

  @Get()
  async getSnapshot(
    @Req() req: AuthedRequest,
    @Query('site_id') siteId: string,
    @Query('operational_day_id') operationalDayId: string,
  ): Promise<QuarryChiefDashboard> {
    return this.aggregator.computeForQuarryChief(
      req.user.tenantId,
      siteId,
      operationalDayId,
    );
  }

  /**
   * SSE streaming endpoint.
   * Channel key: `${tenantId}:${siteId}:quarry-chief`
   */
  @Get('stream')
  openStream(
    @Req() req: AuthedRequest,
    @Query('site_id') siteId: string,
    @Query('last_event_id') lastEventId: string | undefined,
    @Res() res: Response,
  ): void {
    const tenantId = req.user.tenantId;
    const channelKey = `${tenantId}:${siteId}:quarry-chief`;

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
