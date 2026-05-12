import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { CLS_KEYS } from '../cls/tenant-context';

/**
 * Decorate a controller param's source key — e.g. `@SiteParam('siteId')` —
 * to tell SiteScopeGuard which request param/body field holds the site id.
 * Defaults to the route parameter named `siteId`.
 */
export const SITE_PARAM_KEY = 'siteParam';
export const SiteParam = (paramName = 'siteId') => SetMetadata(SITE_PARAM_KEY, paramName);

/**
 * Enforces FND-03: a user can only act on a site listed in their
 * JWT `site_ids[]` claim, unless their `group_scope === 'group'` AND the
 * request is a READ (GET / HEAD). Mutations always require explicit match.
 */
@Injectable()
export class SiteScopeGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const paramName = this.reflector.getAllAndOverride<string>(SITE_PARAM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]) ?? 'siteId';

    const req = ctx.switchToHttp().getRequest<Request>();
    const requested = (req.params?.[paramName] as string) ?? (req.body?.[paramName] as string);
    if (!requested) {
      // No site in this route — guard is a no-op.
      return true;
    }

    const allowed = this.cls.get<string[]>(CLS_KEYS.SITE_IDS) ?? [];
    if (allowed.includes(requested)) return true;

    const groupScope = this.cls.get<string | null>('groupScope');
    const method = req.method.toUpperCase();
    if (groupScope === 'group' && (method === 'GET' || method === 'HEAD')) {
      return true;
    }

    throw new ForbiddenException(
      `Site ${requested} not in caller's site_ids[] (${allowed.join(',') || 'empty'})`,
    );
  }
}
