import { Injectable, inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { Observable, map, of } from 'rxjs';
import type { JwtClaims } from '@gravel/shared-types';
import { environment } from '../../../environments/environment';

const DEV_CLAIMS: JwtClaims = {
  userId: '00000000-0000-0000-0000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000099',
  siteIds: ['00000000-0000-0000-0000-000000000010'],
  role: 'DIRECTION_GROUPE',
  groupScope: null,
  preferredLocale: 'fr-CI',
};

/**
 * Thin wrapper over OidcSecurityService exposing typed JwtClaims and a
 * narrow API consumed by guards + components.
 *
 * When environment.mockAuth=true (local dev without Keycloak), all observables
 * return the hardcoded DEV_CLAIMS and isAuthenticated emits true immediately.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly oidc = inject(OidcSecurityService);

  login(): void {
    if (environment.mockAuth) return;
    this.oidc.authorize();
  }

  logout(): Observable<unknown> {
    if (environment.mockAuth) return of(null);
    return this.oidc.logoff();
  }

  readonly isAuthenticated$: Observable<boolean> = environment.mockAuth
    ? of(true)
    : this.oidc.isAuthenticated$.pipe(map((r) => r.isAuthenticated));

  readonly userClaims$: Observable<JwtClaims | null> = environment.mockAuth
    ? of(DEV_CLAIMS)
    : this.oidc.userData$.pipe(
        map((r) => {
          const u = (r?.userData ?? null) as Record<string, unknown> | null;
          if (!u) return null;
          return {
            userId: String(u['sub'] ?? ''),
            tenantId: String(u['tenant_id'] ?? ''),
            siteIds: Array.isArray(u['site_ids']) ? (u['site_ids'] as string[]) : [],
            role: u['role'] as JwtClaims['role'],
            groupScope: (u['group_scope'] as JwtClaims['groupScope']) ?? null,
            preferredLocale: String(u['preferred_locale'] ?? 'fr-CI'),
          } satisfies JwtClaims;
        }),
      );

  readonly accessToken$ = environment.mockAuth ? of('dev-mock-token') : this.oidc.getAccessToken();
}
