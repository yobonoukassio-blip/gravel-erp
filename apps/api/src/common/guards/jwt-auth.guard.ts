import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { JwtClaims } from '@gravel/shared-types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public =
  (): MethodDecorator & ClassDecorator =>
  ((
    target: object,
    _key?: string | symbol,
    _descriptor?: TypedPropertyDescriptor<unknown>,
  ) => {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
  }) as MethodDecorator & ClassDecorator;

/** Dev-mode hardcoded user injected when DEV_BYPASS_JWT=true. */
const DEV_USER: JwtClaims = {
  userId: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000099',
  siteIds: ['00000000-0000-0000-0000-000000000010'],
  role: 'DIRECTION_GROUPE',
  groupScope: null,
  preferredLocale: 'fr-CI',
};

/**
 * Global JWT guard. Runs JwtStrategy from this module unless the route is
 * marked @Public() (e.g. /health/*). On success, populates req.user with
 * JwtClaims; tenant-context.middleware then mirrors those claims into CLS.
 *
 * When DEV_BYPASS_JWT=true (local dev without Keycloak), skips token
 * validation and injects DEV_USER directly.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    if (process.env['DEV_BYPASS_JWT'] === 'true') {
      const req = ctx.switchToHttp().getRequest<{ user: JwtClaims }>();
      req.user = DEV_USER;
      return true;
    }

    return super.canActivate(ctx);
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException('Invalid or missing JWT');
    }
    return user;
  }
}
