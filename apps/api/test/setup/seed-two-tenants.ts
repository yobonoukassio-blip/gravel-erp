/**
 * Phase 1 directive: seed 2 tenants × 2 sites × 5 users each (CONTEXT.md "Specifics").
 * Users themselves land in plan W1-P04 (identity). Here we seed only the
 * data-platform fixtures needed for FND-02/05/06 tests.
 */
import { DataSource } from 'typeorm';

export interface SeedFixtures {
  tenantA: string;
  tenantB: string;
  countryA: string;
  countryB: string;
  siteA1: string;
  siteA2: string;
  siteB1: string;
  siteB2: string;
}

export async function seedTwoTenants(serviceDs: DataSource): Promise<SeedFixtures> {
  // Use the service role with bypass GUC so we can seed across tenants.
  return serviceDs.transaction(async (mgr) => {
    await mgr.query("SELECT set_config('app.bypass_rls', 'on', true)");

    const [tA] = await mgr.query(
      `INSERT INTO tenants (code, name) VALUES ('TA','Tenant Alpha') RETURNING id`,
    );
    const [tB] = await mgr.query(
      `INSERT INTO tenants (code, name) VALUES ('TB','Tenant Beta')  RETURNING id`,
    );

    const [cA] = await mgr.query(
      `INSERT INTO countries (tenant_id, iso_alpha2, name, default_currency, default_timezone)
       VALUES ($1, 'CI', 'Côte d''Ivoire', 'XOF', 'Africa/Abidjan') RETURNING id`,
      [tA.id],
    );
    const [cB] = await mgr.query(
      `INSERT INTO countries (tenant_id, iso_alpha2, name, default_currency, default_timezone)
       VALUES ($1, 'CI', 'Côte d''Ivoire', 'XOF', 'Africa/Abidjan') RETURNING id`,
      [tB.id],
    );

    const mkSite = async (tenantId: string, countryId: string, code: string) =>
      (
        await mgr.query(
          `INSERT INTO sites (tenant_id, country_id, code, name, gps_point, iana_timezone, functional_currency)
           VALUES ($1, $2, $3, $3, ST_GeomFromText('POINT(-4.024 5.345)', 4326), 'Africa/Abidjan', 'XOF')
           RETURNING id`,
          [tenantId, countryId, code],
        )
      )[0].id as string;

    const sA1 = await mkSite(tA.id, cA.id, 'A1');
    const sA2 = await mkSite(tA.id, cA.id, 'A2');
    const sB1 = await mkSite(tB.id, cB.id, 'B1');
    const sB2 = await mkSite(tB.id, cB.id, 'B2');

    return {
      tenantA: tA.id,
      tenantB: tB.id,
      countryA: cA.id,
      countryB: cB.id,
      siteA1: sA1,
      siteA2: sA2,
      siteB1: sB1,
      siteB2: sB2,
    };
  });
}
