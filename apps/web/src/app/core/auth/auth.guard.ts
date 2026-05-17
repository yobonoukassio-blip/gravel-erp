import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Functional auth guard. Redirects to `/login` when no local session is
 * present. Short-circuits immediately when mockAuth=true.
 */
export const authGuard: CanActivateFn = () => {
  if (environment.mockAuth) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticatedSync() ? true : router.createUrlTree(['/login']);
};
