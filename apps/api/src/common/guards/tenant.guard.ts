import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CLS_KEYS } from '../cls/tenant-context';

/**
 * Confirms tenant-context.middleware actually populated CLS.TENANT_ID.
 * Belt-and-suspenders: every controller in a multi-tenant route must reject
 * a request that somehow slipped past JwtAuthGuard with no CLS context.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    const tenantId = this.cls.get<string>(CLS_KEYS.TENANT_ID);
    if (!tenantId) {
      throw new UnauthorizedException('No tenant context — JWT or middleware misconfigured');
    }
    return true;
  }
}
