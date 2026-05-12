import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';

/**
 * Functional route guard: allows the route only when the caller's JWT
 * `role` claim is in the allow-list. Server-side enforcement is the
 * source of truth (RoleGuard + @Role(...) on every controller method);
 * this guard is purely a UX layer to hide unreachable pages.
 */
export function roleGuard(allowed: readonly string[]): CanActivateFn {
  return async () => {
    const oidc = inject(OidcSecurityService);
    const router = inject(Router);
    const payload = await firstValueFrom(oidc.getPayloadFromAccessToken());
    const role = (payload as { role?: string } | null)?.role;
    if (role && allowed.includes(role)) return true;
    return router.parseUrl('/');
  };
}
