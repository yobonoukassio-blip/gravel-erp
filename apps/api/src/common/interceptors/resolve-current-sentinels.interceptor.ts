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

    // Rewrite via full reassignment — NestJS @Query() / pipes sometimes
    // capture req.query / req.params by reference at request init, so an
    // in-place property assignment can be lost. Building a fresh shallow copy
    // and reassigning is the most defensive form.
    const rewriteBag = (
      bag: Record<string, unknown> | undefined,
      source: string,
    ): Record<string, unknown> | undefined => {
      if (!bag) return bag;
      const next: Record<string, unknown> = { ...bag };
      let mutated = false;
      for (const key of ['site_id', 'siteId']) {
        if (next[key] === 'current' && activeSiteId) {
          this.logger.log(`[SENTINEL] ${source}.${key}='current' -> '${activeSiteId}'`);
          next[key] = activeSiteId;
          mutated = true;
        }
      }
      for (const key of ['tenant_id', 'tenantId']) {
        if (next[key] === 'current' && tenantId) {
          this.logger.log(`[SENTINEL] ${source}.${key}='current' -> '${tenantId}'`);
          next[key] = tenantId;
          mutated = true;
        }
      }
      return mutated ? next : bag;
    };

    const newQuery = rewriteBag(req.query, 'query');
    if (newQuery !== req.query) {
      try {
        (req as { query?: Record<string, unknown> }).query = newQuery;
      } catch {
        // req.query may be a non-writable getter in some Express versions;
        // fall back to mutating the existing object plus rewriting req.url.
        if (req.query && newQuery) Object.assign(req.query, newQuery);
        if (req.url && activeSiteId) {
          const u = req.url
            .replace(/([?&])site_id=current(?=&|$)/g, `$1site_id=${activeSiteId}`)
            .replace(/([?&])siteId=current(?=&|$)/g, `$1siteId=${activeSiteId}`);
          if (u !== req.url) (req as { url?: string }).url = u;
        }
      }
    }
    const newParams = rewriteBag(req.params, 'params');
    if (newParams !== req.params) {
      try {
        (req as { params?: Record<string, unknown> }).params = newParams;
      } catch {
        if (req.params && newParams) Object.assign(req.params, newParams);
      }
    }
    const newBody = rewriteBag(req.body, 'body');
    if (newBody !== req.body) {
      try {
        (req as { body?: Record<string, unknown> }).body = newBody;
      } catch {
        if (req.body && newBody) Object.assign(req.body, newBody);
      }
    }

    return next.handle();
  }
}
