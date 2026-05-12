import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { UsersService } from './users.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CLS_KEYS } from '../../common/cls/tenant-context';

/**
 * Canonical endpoints for the calling user.
 *
 * - GET /api/users/me — returns the row identified by the JWT `sub`.
 * - PUT /api/users/me/preferences — writes `users.preferred_locale`
 *   via TypeORM (RLS-scoped, audit-trigger covered). NO `user_id` path
 *   param: caller identity comes from JWT only, so cross-user mutation
 *   is impossible at the routing layer (FND-09).
 *
 * Plan 03's `/api/sync/preferences` is a sync-replica path (LWW row in
 * `user_preferences`) — NOT this endpoint. CDC reconciles the two.
 */
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('api/users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly cls: ClsService,
  ) {}

  private requireUserId(): string {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID);
    if (!userId) {
      throw new Error('USER_ID missing from CLS context — JwtAuthGuard must run first.');
    }
    return userId;
  }

  @Get('me')
  getMe() {
    return this.users.findById(this.requireUserId());
  }

  @Put('me/preferences')
  updateMyPreferences(@Body() dto: UpdatePreferencesDto) {
    return this.users.updatePreferences(this.requireUserId(), dto);
  }
}
