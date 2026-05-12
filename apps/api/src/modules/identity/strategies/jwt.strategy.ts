import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import type { GravelRole, JwtClaims } from '@gravel/shared-types';

/**
 * Validates JWTs issued by Keycloak realm `gravel-dev`.
 * Source: RESEARCH.md lines 608-644 (NestJS JWT Guard with Keycloak JWKS).
 * Pitfall 4 mitigation: audience + issuer MUST match what Keycloak puts on the
 * token. Our realm uses KC_HOSTNAME_STRICT=true so the issuer URL is stable.
 *
 * Expected token shape:
 *   sub:        Keycloak user id (UUID, also `users.id`)
 *   tenant_id:  UUID
 *   site_ids:   string[]
 *   role:       one of the 7 GravelRole values
 *   group_scope:'group' | null
 *   preferred_locale: e.g. 'fr-CI'
 *   aud:        must include 'gravel-api'
 *   iss:        must equal `${KEYCLOAK_URL}/realms/gravel-dev`
 */
interface RawKeycloakClaims {
  sub: string;
  tenant_id?: string;
  site_ids?: string[];
  role?: GravelRole;
  group_scope?: 'group' | null;
  preferred_locale?: string;
  iss?: string;
  aud?: string | string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly config: ConfigService) {
    const keycloakUrl = config.getOrThrow<string>('KEYCLOAK_URL');
    const realm = config.get<string>('KEYCLOAK_REALM', 'gravel-dev');
    const issuer = `${keycloakUrl}/realms/${realm}`;
    const audience = config.get<string>('KEYCLOAK_AUDIENCE', 'gravel-api');
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience,
      issuer,
      algorithms: ['RS256'],
    });
  }

  validate(payload: RawKeycloakClaims): JwtClaims {
    if (!payload.tenant_id) {
      throw new UnauthorizedException('JWT missing required tenant_id claim');
    }
    if (!payload.role) {
      throw new UnauthorizedException('JWT missing required role claim');
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenant_id,
      siteIds: Array.isArray(payload.site_ids) ? payload.site_ids : [],
      role: payload.role,
      groupScope: payload.group_scope ?? null,
      preferredLocale: payload.preferred_locale ?? 'fr-CI',
    };
  }
}
