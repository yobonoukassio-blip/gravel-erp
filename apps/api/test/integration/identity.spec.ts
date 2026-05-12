/**
 * REQ: FND-01 — SSO Keycloak OIDC + MFA optionnelle.
 * Source decisions: D-01, D-03, D-04.
 * Implementing plan: W1-P04 (identity).
 *
 * Wave 0 RED — these tests intentionally fail with NOT IMPLEMENTED until
 * the identity module exists.
 */

describe('FND-01: SSO Keycloak OIDC + JWT validation', () => {
  it('SSO Keycloak OIDC validates JWT issued by realm gravel-dev', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P04 (Identity)');
  });

  it.todo('MFA TOTP optional flow can be enabled per user');

  it.todo('MFA TOTP is enforced for DIRECTION_GROUPE and FINANCE roles via Keycloak policy');

  it('rejects access tokens with missing tenant_id or role claims', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P04 (Identity)');
  });
});
