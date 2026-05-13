import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Functional auth guard. Redirects to `/login` when the OIDC session is
 * not authenticated. Short-circuits immediately when mockAuth=true.
 */
export const authGuard: CanActivateFn = () => {
  if (environment.mockAuth) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated$.pipe(
    take(1),
    map((ok) => (ok ? true : router.createUrlTree(['/login']))),
  );
};
