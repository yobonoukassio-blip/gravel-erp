export const environment = {
  production: false,
  name: 'development',
  version: 'dev',
  apiBaseUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3000',
  keycloakUrl: 'http://localhost:8080',
  keycloakRealm: 'gravel-dev',
  // OTLP/HTTP ingress of the Grafana LGTM OTel Collector.
  // Override at deploy-time via /assets/runtime-config.json.
  otelEndpoint: 'http://localhost:4318',
  // Bypass OIDC/Keycloak in local dev (no Keycloak instance required).
  mockAuth: true,
};
