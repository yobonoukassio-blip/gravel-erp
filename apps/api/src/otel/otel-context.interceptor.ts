/**
 * NestJS interceptor that decorates the current OTel span with the
 * tenant.id / site.id / user.id / request.id attributes read from CLS.
 *
 * Why this is critical: every Phase-1 invariant (RLS leak, audit chain
 * break, sync conflict) is correlated across services by `tenant.id` +
 * `request.id`. Without this interceptor, Tempo traces are useless for
 * incident response.
 *
 * Registered as a global interceptor in `AppModule`.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';

import { CLS_KEYS } from '../common/cls/tenant-context';
import { SpanAttr } from './otel';

@Injectable()
export class OtelContextInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const span = trace.getActiveSpan();
    if (span) {
      const tenantId = this.cls.get<string>(CLS_KEYS.TENANT_ID);
      const userId = this.cls.get<string>(CLS_KEYS.USER_ID);
      const requestId = this.cls.get<string>(CLS_KEYS.REQUEST_ID);
      const siteIds = this.cls.get<string[]>(CLS_KEYS.SITE_IDS);

      if (tenantId) span.setAttribute(SpanAttr.TENANT_ID, tenantId);
      if (userId) span.setAttribute(SpanAttr.USER_ID, userId);
      if (requestId) span.setAttribute(SpanAttr.REQUEST_ID, requestId);
      // site.id is the *first* site for narrow requests; multi-site dashboards
      // get a separate `site.ids.count` attribute.
      if (siteIds && siteIds.length > 0) {
        span.setAttribute(SpanAttr.SITE_ID, siteIds[0]);
        span.setAttribute('site.ids.count', siteIds.length);
      }
    }
    return next.handle();
  }
}
