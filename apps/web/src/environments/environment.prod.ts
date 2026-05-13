/**
 * Production environment — deployed on Vercel.
 *
 * mockAuth=true : utilise DEV_USER (DIRECTION_GROUPE, tenant fixe) sans Keycloak.
 * Remplacer par false + vraie config Keycloak quand l'instance est disponible.
 *
 * apiBaseUrl='' : URLs relatives — Vercel proxie /api/* vers Railway via vercel.json.
 */
export const environment = {
  production: true,
  name: 'production',
  version: '1.0.0',
  apiBaseUrl: '',
  apiUrl: '',
  keycloakUrl: '',
  keycloakRealm: 'gravel-prod',
  otelEndpoint: '',
  mockAuth: true,
};
