/**
 * Production environment — deployed on Vercel.
 *
 * mockAuth=false : SECURITY P0-3 (audit 2026-05-16). Previously `true` auto-logged
 * every visitor as DIRECTION_GROUPE without Keycloak. NEVER restore to true on prod.
 *
 * apiBaseUrl='' : URLs relatives — Vercel proxie /api/* vers Railway via vercel.json.
 */
export const environment = {
  production: true,
  name: 'production',
  version: '1.0.0',
  apiBaseUrl: '',
  apiUrl: '',
  keycloakUrl: 'https://keycloak.placeholder.invalid',
  keycloakRealm: 'gravel-prod',
  otelEndpoint: '',
  mockAuth: false,
};
