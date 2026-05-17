import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * Attaches the local-auth Bearer token to every /api request. Skips /api/auth/*
 * so login itself stays public.
 */
export const localAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/auth/')) return next(req);

  const auth = inject(AuthService);
  const token = auth.getAccessTokenSync();
  if (!token) return next(req);

  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};
