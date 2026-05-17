import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

interface AuthedRequest {
  user: { userId: string; tenantId: string };
}

interface ListResult {
  readonly unreadCount: number;
  readonly items: ReadonlyArray<Pick<Notification, 'id' | 'title' | 'body' | 'severity' | 'eventType' | 'readAtUtc' | 'createdAtUtc' | 'alertId'>>;
}

/**
 * NotificationController (NTF-04).
 *
 * Minimal surface for the Angular header badge:
 *   GET   /api/notifications?unread=true    -> { unreadCount, items[10] }
 *   PATCH /api/notifications/:id/read       -> marks one as read
 *   PATCH /api/notifications/read-all       -> bulk mark-read
 */
@Controller('notifications')
export class NotificationController {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
  ) {}

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('unread') unread?: string,
  ): Promise<ListResult> {
    const onlyUnread = unread === 'true';
    const baseWhere = { tenantId: req.user.tenantId, userId: req.user.userId };
    const items = await this.repo.find({
      where: onlyUnread ? { ...baseWhere, readAtUtc: IsNull() } : baseWhere,
      order: { createdAtUtc: 'DESC' },
      take: 10,
    });
    const unreadCount = await this.repo.count({
      where: { ...baseWhere, readAtUtc: IsNull() },
    });
    return {
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        severity: n.severity,
        eventType: n.eventType ?? null,
        readAtUtc: n.readAtUtc ?? null,
        createdAtUtc: n.createdAtUtc,
        alertId: n.alertId ?? null,
      })),
    };
  }

  @Patch(':id/read')
  async markRead(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    await this.repo.update(
      { id, tenantId: req.user.tenantId, userId: req.user.userId, readAtUtc: IsNull() },
      { readAtUtc: new Date() },
    );
    return { ok: true };
  }

  @Patch('read-all')
  async markAllRead(@Req() req: AuthedRequest): Promise<{ ok: true; updated: number }> {
    const result = await this.repo.update(
      { tenantId: req.user.tenantId, userId: req.user.userId, readAtUtc: IsNull() },
      { readAtUtc: new Date() },
    );
    // result.affected may be undefined depending on driver — fall back to 0.
    return { ok: true, updated: result.affected ?? 0 };
  }
}
