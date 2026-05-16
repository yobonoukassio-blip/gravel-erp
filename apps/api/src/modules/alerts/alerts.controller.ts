import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Alert, AlertStatus } from './alert.entity';
import { AlertsService } from './alerts.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string };
}

/**
 * Alerts REST surface (Phase 2 — D2-74).
 * Phase 1 TenantGuard + JWT decoding wires `req.user.tenantId` and
 * `req.user.userId`. The controller stays small — service holds the rules.
 */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('status') status?: AlertStatus,
    @Query('site_id') siteId?: string,
  ): Promise<Alert[]> {
    return this.alerts.list({
      tenantId: req.user.tenantId,
      siteId,
      status,
    });
  }

  @Post(':id/ack')
  async ack(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() _body: Record<string, unknown> = {},
  ): Promise<Alert> {
    return this.alerts.ack(id, req.user.userId, req.user.tenantId);
  }

  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() _body: Record<string, unknown> = {},
  ): Promise<Alert> {
    return this.alerts.resolve(id, req.user.userId, req.user.tenantId);
  }
}
