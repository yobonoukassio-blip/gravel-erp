import { Injectable, NestMiddleware } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { JwtClaims } from '@gravel/shared-types';
import { CLS_KEYS } from '../cls/tenant-context';

/**
 * D-07 layer 3: extract JWT claims (already validated by JwtStrategy + JwtAuthGuard)
 * and inject them into ClsService BEFORE any controller awaits a DB query.
 *
 * Pitfall 2 (RESEARCH.md lines 542-547) — TypeORM connection lifecycle vs CLS:
 *   We rely on `nestjs-cls` running this in the same CLS frame as the rest of the
 *   request lifecycle. `cls.enterWith()` is invoked here so values are visible
 *   immediately. We do NOT call `cls.run()` — the global ClsModule middleware
 *   (ClsModule.forRoot({ middleware: { mount: true } })) has already opened a
 *   frame.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request & { user?: JwtClaims }, _res: Response, next: NextFunction): void {
    const claims = req.user;
    if (!claims) {
      // JwtAuthGuard didn't run (e.g. @Public route). Still set a request id.
      this.cls.set(CLS_KEYS.REQUEST_ID, this.requestId(req));
      return next();
    }
    this.cls.set(CLS_KEYS.TENANT_ID, claims.tenantId);
    this.cls.set(CLS_KEYS.USER_ID, claims.userId);
    this.cls.set(CLS_KEYS.SITE_IDS, claims.siteIds);
    this.cls.set(CLS_KEYS.ROLE, claims.role);
    this.cls.set('groupScope', claims.groupScope);
    this.cls.set('preferredLocale', claims.preferredLocale);
    this.cls.set(CLS_KEYS.REQUEST_ID, this.requestId(req));
    next();
  }

  private requestId(req: Request): string {
    const hdr = req.headers['x-request-id'];
    if (typeof hdr === 'string' && hdr.length > 0) return hdr;
    return randomUUID();
  }
}
