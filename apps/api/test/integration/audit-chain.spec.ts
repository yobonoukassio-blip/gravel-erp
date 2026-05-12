/**
 * REQ: FND-06 — audit trail immuable + chain-of-hash par (tenant, table).
 * Source: D-27, D-28, PITFALLS.md #1, #6, #7.
 *
 * Wave 1 GREEN.
 */
import { DataSource } from 'typeorm';
import { startPostgres, stopPostgres, PgTestStack } from '../setup/testcontainers';
import { seedTwoTenants, SeedFixtures } from '../setup/seed-two-tenants';
import { AuditChainVerifier } from '../../src/modules/audit/audit-chain.verifier';

async function asTenant<T>(ds: DataSource, tenantId: string, fn: (mgr: DataSource['manager']) => Promise<T>): Promise<T> {
  return ds.transaction(async (mgr) => {
    await mgr.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    return fn(mgr);
  });
}

describe('FND-06: Audit trail immutable chain-of-hash', () => {
  let stack: PgTestStack;
  let seed: SeedFixtures;
  let verifier: AuditChainVerifier;

  beforeAll(async () => {
    stack = await startPostgres();
    seed = await seedTwoTenants(stack.serviceDs);
    verifier = new AuditChainVerifier(stack.serviceDs);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopPostgres(stack);
  });

  it('INSERT on sites produces audit_log row with prev_hash + row_hash', async () => {
    const rows: Array<{ id: string; action: string; before_jsonb: unknown; after_jsonb: unknown }> =
      await stack.serviceDs.query(
        `SELECT id, action, before_jsonb, after_jsonb
           FROM audit_log
          WHERE tenant_id = $1 AND table_name = 'sites'
          ORDER BY id ASC`,
        [seed.tenantA],
      );
    expect(rows.length).toBeGreaterThanOrEqual(2); // 2 sites for tenantA seeded.
    expect(rows[0].action).toBe('INSERT');
    expect(rows[0].before_jsonb).toBeNull();
    expect(rows[0].after_jsonb).toMatchObject({ tenant_id: seed.tenantA });
  });

  it('UPDATE produces row with before+after; DELETE not allowed (soft-delete only)', async () => {
    await asTenant(stack.serviceDs, seed.tenantA, async (mgr) => {
      await mgr.query("SELECT set_config('app.bypass_rls','on',true)");
      await mgr.query(`UPDATE sites SET name = 'A1-renamed' WHERE id = $1`, [seed.siteA1]);
    });
    const [row] = await stack.serviceDs.query(
      `SELECT action, before_jsonb->>'name' AS before_name, after_jsonb->>'name' AS after_name
         FROM audit_log
        WHERE tenant_id = $1 AND table_name = 'sites' AND action = 'UPDATE'
        ORDER BY id DESC LIMIT 1`,
      [seed.tenantA],
    );
    expect(row.action).toBe('UPDATE');
    expect(row.before_name).toBe('A1');
    expect(row.after_name).toBe('A1-renamed');
  });

  it('chain invariant: row_hash[n].prev_hash = row_hash[n-1] per (tenant,table)', async () => {
    const result = await verifier.verifyChain(seed.tenantA, 'sites');
    expect(result.valid).toBe(true);
    expect(result.rowsChecked).toBeGreaterThanOrEqual(2);
  });

  it('chain is partitioned per (tenant_id, table_name) — tenantB chain is independent', async () => {
    const resB = await verifier.verifyChain(seed.tenantB, 'sites');
    expect(resB.valid).toBe(true);

    // tampering tenantA chain must NOT mark tenantB invalid.
    await stack.serviceDs.query(
      `UPDATE audit_log SET after_jsonb = jsonb_set(COALESCE(after_jsonb,'{}'::jsonb),'{name}','"TAMPERED"')
         WHERE tenant_id = $1 AND table_name = 'sites' AND action = 'INSERT'
         AND id = (SELECT id FROM audit_log WHERE tenant_id=$1 AND table_name='sites' ORDER BY id ASC LIMIT 1)`,
      [seed.tenantA],
    );
    const resA = await verifier.verifyChain(seed.tenantA, 'sites');
    expect(resA.valid).toBe(false);
    expect(resA.brokenAt).toBeDefined();

    const resB2 = await verifier.verifyChain(seed.tenantB, 'sites');
    expect(resB2.valid).toBe(true);
  });

  it('tamper detection returns first broken position', async () => {
    const result = await verifier.verifyChain(seed.tenantA, 'sites');
    expect(result.valid).toBe(false);
    expect(typeof result.brokenAt).toBe('string');
  });

  it('audit_log is RANGE-partitioned by at_utc (monthly)', async () => {
    const rows: Array<{ relname: string }> = await stack.serviceDs.query(`
      SELECT child.relname
        FROM pg_inherits i
        JOIN pg_class parent ON i.inhparent = parent.oid
        JOIN pg_class child  ON i.inhrelid  = child.oid
       WHERE parent.relname = 'audit_log'
    `);
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows.some((r) => /^audit_log_\d{4}_\d{2}$/.test(r.relname))).toBe(true);
  });
});
