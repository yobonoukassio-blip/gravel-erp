import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * DashboardApiService — single entry point for dashboard endpoints.
 *
 * Reads tenantId + the active siteId from {@link AuthService.userClaims$}
 * so components no longer hardcode them. Replaces ad-hoc `fetch()` calls
 * scattered across page components.
 */
@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** Resolve the first site the user can access. Components can override. */
  async resolveActiveSiteId(): Promise<string | null> {
    const claims = await firstValueFrom(this.auth.userClaims$);
    return claims?.siteIds?.[0] ?? null;
  }

  async resolveTenantId(): Promise<string | null> {
    const claims = await firstValueFrom(this.auth.userClaims$);
    return claims?.tenantId ?? null;
  }

  siteDirector<T>(siteId: string, operationalDayId?: string | null): Observable<T> {
    let params = new HttpParams().set('site_id', siteId);
    if (operationalDayId) params = params.set('operational_day_id', operationalDayId);
    return this.http.get<T>('/api/dashboards/site-director', {
      params,
      withCredentials: true,
    });
  }

  quarryChief<T>(siteId: string, operationalDayId?: string | null): Observable<T> {
    let params = new HttpParams().set('site_id', siteId);
    if (operationalDayId) params = params.set('operational_day_id', operationalDayId);
    return this.http.get<T>('/api/dashboards/quarry-chief', {
      params,
      withCredentials: true,
    });
  }

  /** Stream URL for SSE — caller wires this through SseClientService. */
  siteDirectorStreamUrl(siteId: string): string {
    return `/api/dashboards/site-director/stream?site_id=${encodeURIComponent(siteId)}`;
  }
}
