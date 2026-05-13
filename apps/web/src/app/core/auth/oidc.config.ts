/**
 * angular-auth-oidc-client configuration for the Gravel web SPA.
 * Source: D-01 (Keycloak), D-04 (claim shape), D-05 (Auth Code + PKCE).
 *
 * `secureRoutes: ['/api']` tells the library's HTTP interceptor to attach
 * the bearer access token to every API call.
 */
import type { OpenIdConfiguration } from 'angular-auth-oidc-client';
import { environment } from '../../../environments/environment';

export const oidcConfig: OpenIdConfiguration = {
  authority: environment.keycloakUrl
    ? `${environment.keycloakUrl}/realms/${environment.keycloakRealm}`
    : 'https://auth.placeholder.invalid/realms/gravel',
  redirectUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/callback`,
  postLogoutRedirectUri:
    typeof window !== 'undefined' ? window.location.origin : '',
  clientId: 'gravel-web',
  scope: 'openid profile email gravel-claims offline_access',
  responseType: 'code',
  useRefreshToken: true,
  renewTimeBeforeTokenExpiresInSeconds: 60,
  ignoreNonceAfterRefresh: true,
  secureRoutes: ['/api'],
  silentRenew: false,
  logLevel: environment.production ? 3 : 1, // 1=debug, 3=warn
};
