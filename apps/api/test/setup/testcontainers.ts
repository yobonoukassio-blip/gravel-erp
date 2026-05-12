/**
 * Shared Testcontainers fixtures for integration / security / chaos tests.
 *
 * Stack:
 *  - Postgres 18 + PostGIS (image: postgis/postgis:18-3.5 — official PostGIS multi-tag)
 *  - Keycloak 26 (image: quay.io/keycloak/keycloak:26.0)
 *
 * Wave 0 status: STUBS ONLY. Real fixture wiring happens in:
 *   - plan W1-P02 (data-platform: DB schema, RLS, audit triggers)
 *   - plan W1-P04 (identity: Keycloak realm import)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let pgContainer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let kcContainer: any = null;

export async function startContainers(): Promise<void> {
  throw new Error(
    'Wave 0 stub — testcontainers not configured. ' +
      'Plans W1-P02 (Postgres+RLS) and W1-P04 (Keycloak) will wire real fixtures.',
  );
}

export async function stopContainers(): Promise<void> {
  // No-op in Wave 0 — nothing was started.
}
