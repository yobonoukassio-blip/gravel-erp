import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';
import type { JwtClaims, GravelRole } from '@gravel/shared-types';

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
  tenantId: '24cd97f8-0170-453e-89da-e9213dd710d7',   // Gravel Ivoire (Supabase)
  siteIds: ['5213953c-3820-4da4-97ed-89bfbd605c07'],  // Carrière Mobaye
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

    // Local HS256 token issued by AuthController.login — verified against
    // AUTH_JWT_SECRET, in addition to the Keycloak RS256 path below. The
    // existing Keycloak JwtStrategy will reject HS256 tokens, so we try local
    // first and fall through on failure.
    const localClaims = this.tryLocalToken(ctx);
    if (localClaims) {
      const req = ctx.switchToHttp().getRequest<{ user: JwtClaims }>();
      req.user = localClaims;
      return true;
    }

    // SECURITY P0-4 (audit 2026-05-16): DEV_BYPASS_JWT MUST be ignored in production.
    // Even with the env var set, NODE_ENV=production aborts the bypass — defense
    // against env-var leakage from a misconfigured Railway deploy.
    if (
      process.env['DEV_BYPASS_JWT'] === 'true' &&
      process.env['NODE_ENV'] !== 'production'
    ) {
      const req = ctx.switchToHttp().getRequest<{ user: JwtClaims }>();
      req.user = DEV_USER;
      return true;
    }

    return super.canActivate(ctx);
  }

  private tryLocalToken(ctx: ExecutionContext): JwtClaims | null {
    const secret = process.env['AUTH_JWT_SECRET'];
    if (!secret) return null;

    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const auth = req.headers['authorization'];
    const header = Array.isArray(auth) ? auth[0] : auth;
    if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;

    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'gravel-local-auth',
      }) as jwt.JwtPayload;
      if (!payload['tenant_id'] || !payload['role']) return null;
      return {
        userId: String(payload.sub ?? ''),
        tenantId: String(payload['tenant_id']),
        siteIds: Array.isArray(payload['site_ids']) ? (payload['site_ids'] as string[]) : [],
        role: payload['role'] as GravelRole,
        groupScope: (payload['group_scope'] as 'group' | null) ?? null,
        preferredLocale: String(payload['preferred_locale'] ?? 'fr-CI'),
      };
    } catch {
      return null;
    }
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException('Invalid or missing JWT');
    }
    return user;
  }
}
