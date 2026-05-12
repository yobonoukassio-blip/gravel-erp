import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => {
  return (target, _key, _descriptor) => {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
  };
};

/**
 * Global JWT guard. Runs JwtStrategy from this module unless the route is
 * marked @Public() (e.g. /health/*). On success, populates req.user with
 * JwtClaims; tenant-context.middleware then mirrors those claims into CLS.
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
    return super.canActivate(ctx);
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException('Invalid or missing JWT');
    }
    return user;
  }
}
