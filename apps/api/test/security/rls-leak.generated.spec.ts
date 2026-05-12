/**
 * REQ: FND-02 — RLS isolation cross-tenant sur chaque table.
 * Source: D-06, D-07, D-08, PITFALLS.md #5 and #8.
 * Implementing plan: W1-P02 (data-platform).
 *
 * Wave 0 RED — preflight sentinel and generated suite both fail until the
 * data-platform plan exposes a real DataSource + RLS policies.
 */
import { generateRlsLeakTests } from './rls-leak.generator';

describe('FND-02: RLS cross-tenant isolation (auto-generated)', () => {
  it('generator function is exported and callable', () => {
    expect(typeof generateRlsLeakTests).toBe('function');
  });

  it('preflight sentinel: gravel_app cannot see tenantB rows when SET LOCAL app.tenant_id=tenantA', () => {
    throw new Error(
      'NOT IMPLEMENTED — plan W1-P02 wires data-platform. ' +
        'Preflight must (1) connect as role gravel_app (NOT owner), ' +
        '(2) insert sentinel for tenantB, ' +
        '(3) switch to tenantA context, ' +
        '(4) assert SELECT from any tenant_id table returns 0 sentinel rows. ' +
        'See research §"Pitfall 8".',
    );
  });

  it.todo('once W1-P02 lands, this suite expands to one it() per tenant_id column in public schema');
});
