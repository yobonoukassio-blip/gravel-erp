/**
 * Runtime generator for cross-tenant RLS leak tests (D-08).
 *
 * Reads `information_schema.columns` for every table that has a `tenant_id`
 * column, returns one async leak-check per table. The Jest spec iterates this
 * list at runtime so adding a new tenant-scoped table in any future phase
 * automatically extends coverage — no per-table maintenance.
 *
 * Source: RESEARCH.md §"Auto-Generated Cross-Tenant Leak Test", PITFALLS.md #5 #8.
 */
import type { DataSource } from 'typeorm';

export interface TenantScopedTable {
  tableName: string;
  schema: string;
}

export async function listTenantScopedTables(ds: DataSource): Promise<TenantScopedTable[]> {
  const rows: Array<{ table_schema: string; table_name: string }> = await ds.query(`
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'tenant_id'
      AND table_schema = 'public'
      AND table_name NOT IN ('audit_log', 'audit_chain_state')
    GROUP BY table_schema, table_name
    ORDER BY table_name
  `);
  return rows.map((r) => ({ schema: r.table_schema, tableName: r.table_name }));
}

export interface GeneratedLeakTest {
  tableName: string;
  run: (deps: {
    appDs: DataSource;
    ownerDs: DataSource;
    tenantA: string;
    tenantB: string;
  }) => Promise<void>;
}

/**
 * Returns one test per tenant-scoped table.
 * Each test:
 *   (1) connects as `gravel_app` (NOT owner),
 *   (2) SETs `app.tenant_id = tenantA` via set_config(true),
 *   (3) SELECTs rows where tenant_id = tenantB,
 *   (4) asserts 0 rows.
 */
export async function generateRlsLeakTests(ownerDs: DataSource): Promise<GeneratedLeakTest[]> {
  const tables = await listTenantScopedTables(ownerDs);
  if (tables.length === 0) {
    throw new Error(
      'RLS generator found 0 tenant-scoped tables. ' +
        'Test infrastructure is broken — verify migrations ran and tenant_id columns exist.',
    );
  }
  return tables.map((t) => ({
    tableName: t.tableName,
    run: async ({ appDs, tenantA, tenantB }) => {
      await appDs.transaction(async (mgr) => {
        await mgr.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantA]);
        const rows = await mgr.query(
          `SELECT id FROM ${JSON.stringify(t.tableName).replace(/"/g, '"')} WHERE tenant_id = $1 LIMIT 1`,
          [tenantB],
        );
        if (rows.length !== 0) {
          throw new Error(
            `RLS LEAK on ${t.tableName}: gravel_app with tenant=${tenantA} saw rows of tenant=${tenantB}`,
          );
        }
      });
    },
  }));
}

/**
 * Preflight check (Pitfall #8): before trusting any leak test, prove that the
 * test infrastructure is wired correctly. Insert a sentinel row for tenantB as
 * owner, then verify gravel_app with tenant=tenantA CANNOT see it. If the
 * sentinel IS visible, the test is "lying green" — abort the suite.
 */
export async function preflightSentinelCheck(deps: {
  appDs: DataSource;
  ownerDs: DataSource;
  tenantA: string;
  tenantB: string;
}): Promise<void> {
  // Insert sentinel country for tenantB as owner (bypasses RLS via FORCE-RLS gap?
  // No — owner is forced too. We use gravel_service with bypass GUC.)
  const sentinelIso = 'ZZ';
  await deps.ownerDs.transaction(async (mgr) => {
    await mgr.query("SELECT set_config('app.bypass_rls', 'on', true)");
    await mgr.query(
      `INSERT INTO countries (tenant_id, iso_alpha2, name, default_currency, default_timezone)
       VALUES ($1, $2, 'SENTINEL', 'XOF', 'UTC')
       ON CONFLICT DO NOTHING`,
      [deps.tenantB, sentinelIso],
    );
  });

  await deps.appDs.transaction(async (mgr) => {
    await mgr.query('SELECT set_config($1, $2, true)', ['app.tenant_id', deps.tenantA]);
    const rows = await mgr.query(
      `SELECT id FROM countries WHERE tenant_id = $1 AND iso_alpha2 = $2`,
      [deps.tenantB, sentinelIso],
    );
    if (rows.length > 0) {
      throw new Error(
        'PREFLIGHT FAILED — gravel_app saw the tenantB sentinel while bound to tenantA. ' +
          'Test infrastructure is broken (RLS bypass leak — see PITFALLS.md #8). ' +
          'Aborting leak suite to avoid lying-green results.',
      );
    }
  });
}
