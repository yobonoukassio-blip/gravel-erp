import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import type { GravelRole } from '@gravel/shared-types';
import { CLS_KEYS } from '../../common/cls/tenant-context';

export const ROLES_KEY = 'roles';
export const Role = (...roles: GravelRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * RoleGuard — rejects the request unless the caller's role
 * (from JWT, mirrored into CLS by tenant-context.middleware) is in the
 * allow-list declared by `@Role(...)`.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<GravelRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const role = this.cls.get<GravelRole>(CLS_KEYS.ROLE);
    if (role && required.includes(role)) return true;
    throw new ForbiddenException(
      `Role ${role ?? '(none)'} not in required set [${required.join(', ')}]`,
    );
  }
}
