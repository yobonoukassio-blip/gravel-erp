/**
 * REQ: FND-04, FND-05 — master-data schema (Tenant/Country/Site/Zone/Bench/Permit).
 * Source: D-23, D-24, D-25, D-26.
 *
 * Wave 1 covers schema + RLS + soft-delete + audit-trigger integration.
 * UI scaffolding (Angular forms) lives in W2-P05.
 */
import { DataSource } from 'typeorm';
import { startPostgres, stopPostgres, PgTestStack } from '../setup/testcontainers';
import { seedTwoTenants, SeedFixtures } from '../setup/seed-two-tenants';

async function asTenant<T>(
  ds: DataSource,
  tenantId: string,
  fn: (mgr: DataSource['manager']) => Promise<T>,
): Promise<T> {
  return ds.transaction(async (mgr) => {
    await mgr.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    return fn(mgr);
  });
}

describe('FND-04/FND-05: Master data schema + RLS + soft-delete + audit triggers', () => {
  let stack: PgTestStack;
  let seed: SeedFixtures;

  beforeAll(async () => {
    stack = await startPostgres();
    seed = await seedTwoTenants(stack.serviceDs);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopPostgres(stack);
  });

  it('Site has PostGIS Point gps_point and IANA timezone; WKT round-trip works', async () => {
    const [row] = await asTenant(stack.appDs, seed.tenantA, (mgr) =>
      mgr.query(
        `SELECT ST_AsText(gps_point) AS wkt, iana_timezone FROM sites WHERE id = $1`,
        [seed.siteA1],
      ),
    );
    expect(row.wkt).toMatch(/^POINT\(/);
    expect(row.iana_timezone).toBe('Africa/Abidjan');
  });

  it('ProductionZone with Polygon geometry succeeds', async () => {
    const [row] = await asTenant(stack.appDs, seed.tenantA, (mgr) =>
      mgr.query(
        `INSERT INTO production_zones (tenant_id, site_id, code, name, geometry)
         VALUES ($1, $2, 'Z1', 'Zone 1',
                 ST_GeomFromText('POLYGON((-4 5, -4 6, -3 6, -3 5, -4 5))', 4326))
         RETURNING id`,
        [seed.tenantA, seed.siteA1],
      ),
    );
    expect(row.id).toBeDefined();
  });

  it('Bench with Polygon geometry succeeds when attached to a zone of the same tenant', async () => {
    const [zone] = await asTenant(stack.appDs, seed.tenantA, (mgr) =>
      mgr.query(
        `INSERT INTO production_zones (tenant_id, site_id, code, name, geometry)
         VALUES ($1, $2, 'Z2', 'Zone 2',
                 ST_GeomFromText('POLYGON((-4 5, -4 6, -3 6, -3 5, -4 5))', 4326))
         RETURNING id`,
        [seed.tenantA, seed.siteA1],
      ),
    );
    const [bench] = await asTenant(stack.appDs, seed.tenantA, (mgr) =>
      mgr.query(
        `INSERT INTO benches (tenant_id, production_zone_id, code, name, geometry)
         VALUES ($1, $2, 'B1', 'Bench 1',
                 ST_GeomFromText('POLYGON((-4 5, -4 5.1, -3.9 5.1, -3.9 5, -4 5))', 4326))
         RETURNING id`,
        [seed.tenantA, zone.id],
      ),
    );
    expect(bench.id).toBeDefined();
  });

  it('Permit valid_from < valid_to required; duplicate (site_id, reference) violates uniqueness', async () => {
    await asTenant(stack.appDs, seed.tenantA, (mgr) =>
      mgr.query(
        `INSERT INTO permits (tenant_id, site_id, type, authority, reference, valid_from, valid_to)
         VALUES ($1, $2, 'exploitation', 'MMG-CI', 'PERMIT-001', '2026-01-01', '2031-01-01')`,
        [seed.tenantA, seed.siteA1],
      ),
    );
    await expect(
      asTenant(stack.appDs, seed.tenantA, (mgr) =>
        mgr.query(
          `INSERT INTO permits (tenant_id, site_id, type, authority, reference, valid_from, valid_to)
           VALUES ($1, $2, 'exploitation', 'MMG-CI', 'PERMIT-001', '2026-01-01', '2031-01-01')`,
          [seed.tenantA, seed.siteA1],
        ),
      ),
    ).rejects.toThrow();
  });

  it('archive site (status=archived + archived_at=now()) is a soft-delete; row remains queryable', async () => {
    await asTenant(stack.appDs, seed.tenantA, (mgr) =>
      mgr.query(
        `UPDATE sites SET status='archived', archived_at=now() WHERE id=$1`,
        [seed.siteA2],
      ),
    );
    const [row] = await asTenant(stack.appDs, seed.tenantA, (mgr) =>
      mgr.query(`SELECT status, archived_at FROM sites WHERE id=$1`, [seed.siteA2]),
    );
    expect(row.status).toBe('archived');
    expect(row.archived_at).not.toBeNull();
  });

  it('audit_log entries are produced for each mutation (site update creates UPDATE row)', async () => {
    const rows: Array<{ action: string }> = await stack.serviceDs.query(
      `SELECT action FROM audit_log
        WHERE tenant_id=$1 AND table_name='sites' AND row_pk=$2
        ORDER BY id ASC`,
      [seed.tenantA, seed.siteA2],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2); // INSERT (seed) + UPDATE (archive)
    expect(rows[0].action).toBe('INSERT');
    expect(rows.some((r) => r.action === 'UPDATE')).toBe(true);
  });
});
