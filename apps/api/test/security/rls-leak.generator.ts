/**
 * Auto-generates one cross-tenant leak test per tenant-scoped table.
 *
 * REQ: FND-02 (D-08 CI-blocking requirement).
 * Source: 01-RESEARCH.md §"Auto-Generated Cross-Tenant Leak Test", PITFALLS.md #5.
 * Implementing plan: W1-P02 (data-platform — RLS policies + seed).
 *
 * Pattern:
 *   1. Discover tables via `information_schema.columns WHERE column_name='tenant_id'`.
 *   2. For each table, emit a Jest test that:
 *      a. Acquires a connection as Postgres role `gravel_app` (NOT the table owner —
 *         RLS bypass for owners is a frequent footgun; see Pitfall 8).
 *      b. SET LOCAL app.tenant_id = <tenantA-uuid> (via set_config(..., true)).
 *      c. SELECT id FROM <table> WHERE tenant_id = <tenantB-uuid>.
 *      d. Assert returned rows = 0.
 *
 * Wave 0 status: stub generator. Implementation in W1-P02 supplies a real
 * `DataSource` and `asAppUser` helper.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GeneratedLeakTest = { tableName: string; run: () => Promise<void> };

/**
 * Wave 0 stub — returns an empty array; preflight test asserts the function exists.
 * Real implementation: query information_schema, return one test per table.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateRlsLeakTests(_dataSource: any): Promise<GeneratedLeakTest[]> {
  // Wave 0: no DataSource available. Plan W1-P02 wires the real query.
  return [];
}

export function preflightSentinelCheck(): never {
  throw new Error(
    'NOT IMPLEMENTED — plan W1-P02 wires data-platform (RLS + sentinel sanity check). ' +
      'See research §"Pitfall 8: RLS bypass for table owner".',
  );
}
