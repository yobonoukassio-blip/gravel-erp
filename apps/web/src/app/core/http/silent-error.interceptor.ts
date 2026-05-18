import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, of, catchError } from 'rxjs';
import { ApiDiagnosticsService } from './api-diagnostics.service';

/**
 * Suppresses 404 / 500 errors on GET requests so the UI shows an empty list
 * instead of a snackbar / error popup. Demo-mode behaviour: backend gaps and
 * inconsistent endpoints stay silent until real implementations land.
 *
 * The diagnostic banner (ApiDiagnosticsService) keeps a deduped list of
 * silenced failures so the user can see *what* is broken instead of staring
 * at empty grids with no feedback.
 *
 * Mutating verbs (POST/PATCH/DELETE) propagate errors normally — users must
 * know when an action failed.
 */
export function silentErrorInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  if (req.method !== 'GET') return next(req);

  const diagnostics = inject(ApiDiagnosticsService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 404 || err.status === 500 || err.status === 0) {
        console.error(`[silent-error] ${err.status} ${req.method} ${req.url} — returning empty body`);
        diagnostics.record(req.method, req.url, err.status);
        return of(new HttpResponse({ status: 200, body: [] as unknown }));
      }
      throw err;
    }),
  );
}
