/**
 * Demo environment — deployed on gravel-erp-web-sigma.vercel.app.
 *
 * Différent de production.ts : `mockAuth: true` permet d'entrer dans l'appli
 * sans Keycloak réel. À utiliser UNIQUEMENT pour la démo / showcase :
 *  - aucun vrai utilisateur ni vraie donnée client
 *  - API Railway tourne aussi en NODE_ENV=demo (DEV_BYPASS_JWT=1), donc la
 *    sécurité backend est cohérente avec ce mode
 *
 * Quand un vrai Keycloak prod sera provisionné, utiliser
 * environment.prod.ts (mockAuth=false, P0-3 fix préservé).
 */
export const environment = {
  production: true,
  name: 'demo',
  version: '1.0.0',
  apiBaseUrl: '',
  apiUrl: '',
  keycloakUrl: 'https://keycloak.placeholder.invalid',
  keycloakRealm: 'gravel-demo',
  otelEndpoint: '',
  mockAuth: false,
};
