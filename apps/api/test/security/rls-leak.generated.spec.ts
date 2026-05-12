/**
 * REQ: FND-02 — RLS isolation cross-tenant sur chaque table.
 * Source: D-06, D-07, D-08, PITFALLS.md #5 & #8.
 *
 * Wave 1 GREEN: runtime-discovers every tenant-scoped table from
 * information_schema and emits one isolation assertion per table.
 *
 * Pitfall #8 preflight: the spec inserts a sentinel for tenantB and verifies
 * gravel_app (with tenant=tenantA) cannot see it. If the sentinel IS visible,
 * the suite aborts loudly — refusing to lie-green.
 */
import { startPostgres, stopPostgres, PgTestStack } from '../setup/testcontainers';
import { seedTwoTenants, SeedFixtures } from '../setup/seed-two-tenants';
import {
  generateRlsLeakTests,
  preflightSentinelCheck,
  listTenantScopedTables,
} from '../../scripts/generate-rls-tests';

describe('FND-02: RLS cross-tenant isolation (auto-generated)', () => {
  let stack: PgTestStack;
  let seed: SeedFixtures;

  beforeAll(async () => {
    stack = await startPostgres();
    seed = await seedTwoTenants(stack.serviceDs);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopPostgres(stack);
  });

  it('generator function is exported and callable', () => {
    expect(typeof generateRlsLeakTests).toBe('function');
  });

  it('fail-loud check: information_schema returns AT LEAST 9 tenant-scoped tables', async () => {
    const tables = await listTenantScopedTables(stack.ownerDs);
    if (tables.length === 0) {
      throw new Error('RLS generator found 0 tables; test infrastructure broken');
    }
    expect(tables.length).toBeGreaterThanOrEqual(9);
  });

  it('preflight sentinel: gravel_app cannot see tenantB rows when SET LOCAL app.tenant_id=tenantA', async () => {
    await preflightSentinelCheck({
      appDs: stack.appDs,
      ownerDs: stack.serviceDs,
      tenantA: seed.tenantA,
      tenantB: seed.tenantB,
    });
  });

  it('PgBouncer transaction-mode smoke: GUC does not leak across two sequential transactions', async () => {
    // Tx1: tenant=A — see only A rows.
    await stack.appDs.transaction(async (mgr) => {
      await mgr.query('SELECT set_config($1, $2, true)', ['app.tenant_id', seed.tenantA]);
      const rows = await mgr.query('SELECT tenant_id FROM sites');
      expect(rows.every((r: { tenant_id: string }) => r.tenant_id === seed.tenantA)).toBe(true);
    });

    // Tx2: tenant=B on the SAME connection pool. Without set_config(...,true),
    // the previous GUC would have leaked. We verify only B rows return.
    await stack.appDs.transaction(async (mgr) => {
      await mgr.query('SELECT set_config($1, $2, true)', ['app.tenant_id', seed.tenantB]);
      const rows = await mgr.query('SELECT tenant_id FROM sites');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: { tenant_id: string }) => r.tenant_id === seed.tenantB)).toBe(true);
    });
  });

  it('one isolation assertion per tenant-scoped table (auto-generated)', async () => {
    const tests = await generateRlsLeakTests(stack.ownerDs);
    expect(tests.length).toBeGreaterThanOrEqual(9);
    for (const t of tests) {
      await t.run({
        appDs: stack.appDs,
        ownerDs: stack.ownerDs,
        tenantA: seed.tenantA,
        tenantB: seed.tenantB,
      });
    }
  });
});
