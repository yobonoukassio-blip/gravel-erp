import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, of } from 'rxjs';
import type { JwtClaims } from '@gravel/shared-types';
import { environment } from '../../../environments/environment';

const STORAGE_KEY = 'gravel.auth.session';

interface StoredSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: JwtClaims['role'];
    tenantId: string;
    siteIds: string[];
    groupScope: 'group' | null;
    preferredLocale: string;
  };
}

interface LoginResponse extends StoredSession {}

const DEV_CLAIMS: JwtClaims = {
  userId: '00000000-0000-0000-0000-000000000001',
  tenantId: '24cd97f8-0170-453e-89da-e9213dd710d7',
  siteIds: ['5213953c-3820-4da4-97ed-89bfbd605c07'],
  role: 'DIRECTION_GROUPE',
  groupScope: null,
  preferredLocale: 'fr-CI',
};

/**
 * Local email/password auth client.
 *
 * Flow: loginWithPassword(email, pwd) → POST /auth/login → store HS256 JWT +
 * user claims in localStorage. HTTP interceptor reads accessToken on every
 * outgoing request. logout() clears the session.
 *
 * `environment.mockAuth=true` retains the old auto-login DEV_CLAIMS path for
 * local dev convenience; in any deployment with real users, set mockAuth=false.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session$ = new BehaviorSubject<StoredSession | null>(this.readStored());

  async loginWithPassword(email: string, password: string): Promise<void> {
    const resp = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', { email, password }),
    );
    this.persist(resp);
  }

  logout(): Observable<unknown> {
    this.persist(null);
    return of(null);
  }

  /** Legacy OIDC entry — kept for callers that haven't migrated. No-op now. */
  login(): void {
    // Local auth uses loginWithPassword(). OIDC redirect path removed.
  }

  get isAuthenticated$(): Observable<boolean> {
    if (environment.mockAuth) return of(true);
    return new Observable((sub) => {
      const s = this.session$.subscribe((v) => sub.next(v !== null));
      return () => s.unsubscribe();
    });
  }

  get userClaims$(): Observable<JwtClaims | null> {
    if (environment.mockAuth) return of(DEV_CLAIMS);
    return new Observable((sub) => {
      const s = this.session$.subscribe((v) => sub.next(v ? this.toClaims(v) : null));
      return () => s.unsubscribe();
    });
  }

  get accessToken$(): Observable<string | null> {
    if (environment.mockAuth) return of('dev-mock-token');
    return new Observable((sub) => {
      const s = this.session$.subscribe((v) => sub.next(v?.accessToken ?? null));
      return () => s.unsubscribe();
    });
  }

  /** Synchronous accessor for the HTTP interceptor. */
  getAccessTokenSync(): string | null {
    if (environment.mockAuth) return null;
    return this.session$.value?.accessToken ?? null;
  }

  isAuthenticatedSync(): boolean {
    if (environment.mockAuth) return true;
    return this.session$.value !== null;
  }

  private toClaims(s: StoredSession): JwtClaims {
    return {
      userId: s.user.id,
      tenantId: s.user.tenantId,
      siteIds: s.user.siteIds,
      role: s.user.role,
      groupScope: s.user.groupScope,
      preferredLocale: s.user.preferredLocale,
    };
  }

  private readStored(): StoredSession | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  private persist(s: StoredSession | null): void {
    if (typeof window !== 'undefined') {
      if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    this.session$.next(s);
  }
}
