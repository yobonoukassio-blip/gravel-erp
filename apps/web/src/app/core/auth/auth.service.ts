import { Injectable, inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { Observable, map } from 'rxjs';
import type { JwtClaims } from '@gravel/shared-types';

/**
 * Thin wrapper over OidcSecurityService exposing typed JwtClaims and a
 * narrow API consumed by guards + components.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly oidc = inject(OidcSecurityService);

  login(): void {
    this.oidc.authorize();
  }

  logout(): Observable<unknown> {
    return this.oidc.logoff();
  }

  readonly isAuthenticated$: Observable<boolean> = this.oidc.isAuthenticated$.pipe(
    map((r) => r.isAuthenticated),
  );

  readonly userClaims$: Observable<JwtClaims | null> = this.oidc.userData$.pipe(
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

  readonly accessToken$ = this.oidc.getAccessToken();
}
