import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { JwtClaims } from '@gravel/shared-types';

/**
 * ResolveCurrentSentinelsInterceptor.
 *
 * Many frontend widgets pass the literal string 'current' for site_id /
 * tenant_id / operational_day_id when they don't yet know the actual UUID
 * — the intent being "use the authenticated user's context". Controllers
 * expect real UUIDs and crash with `invalid input syntax for type uuid:
 * "current"` when fed the sentinel.
 *
 * This interceptor runs after JwtAuthGuard (so req.user is set) and rewrites
 * the sentinels in query/params/body:
 *   - site_id / siteId         → req.user.siteIds[0]
 *   - tenant_id / tenantId     → req.user.tenantId
 *   - operational_day_id /
 *     operationalDayId         → left as 'current' for now; controllers can
 *                                opt into the today-resolution when they
 *                                actually need it (cross-DB join required).
 *
 * Cheap, in-place mutation. No DB hit. Idempotent.
 */
@Injectable()
export class ResolveCurrentSentinelsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResolveCurrentSentinelsInterceptor.name);
  private hitCount = 0;

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{
      url?: string;
      method?: string;
      user?: JwtClaims;
      query?: Record<string, unknown>;
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
    }>();

    this.hitCount++;
    if (this.hitCount <= 5 || this.hitCount % 50 === 0) {
      this.logger.log(
        `[SENTINEL #${this.hitCount}] ${req.method ?? '?'} ${req.url ?? '?'} ` +
          `user=${req.user ? 'set' : 'absent'} ` +
          `query=${JSON.stringify(req.query ?? {})}`,
      );
    }

    const user = req.user;
    if (!user) return next.handle();

    const activeSiteId = user.siteIds?.[0];
    const tenantId = user.tenantId;

    const rewrite = (bag: Record<string, unknown> | undefined, source: string): void => {
      if (!bag) return;
      for (const key of ['site_id', 'siteId']) {
        if (bag[key] === 'current' && activeSiteId) {
          this.logger.log(`[SENTINEL] ${source}.${key}='current' -> '${activeSiteId}'`);
          bag[key] = activeSiteId;
        }
      }
      for (const key of ['tenant_id', 'tenantId']) {
        if (bag[key] === 'current' && tenantId) {
          this.logger.log(`[SENTINEL] ${source}.${key}='current' -> '${tenantId}'`);
          bag[key] = tenantId;
        }
      }
    };

    rewrite(req.query, 'query');
    rewrite(req.params, 'params');
    rewrite(req.body, 'body');

    return next.handle();
  }
}
