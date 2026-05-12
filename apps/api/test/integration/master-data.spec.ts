/**
 * REQ: FND-04, FND-05 — master data CRUD (Tenant, Country, Site, ProductionZone, Bench, Permit).
 * Source: D-23, D-24, D-25, D-26.
 * Implementing plan: W2-P05 (master-data).
 *
 * Wave 0 RED.
 */

describe('FND-04/FND-05: Master data CRUD', () => {
  it('admin tenant creates Site with iana_timezone, functional_currency, gps_point (PostGIS), permits', () => {
    throw new Error('NOT IMPLEMENTED — plan W2-P05 (master-data)');
  });

  it('admin site creates ProductionZone with polygon geometry (PostGIS)', () => {
    throw new Error('NOT IMPLEMENTED — plan W2-P05');
  });

  it('admin site creates Bench attached to a ProductionZone', () => {
    throw new Error('NOT IMPLEMENTED — plan W2-P05');
  });

  it('Permit has type ∈ {exploration,exploitation,environnemental,explosifs} + valid_from/valid_to', () => {
    throw new Error('NOT IMPLEMENTED — plan W2-P05');
  });

  it('archived site rejects new operational references (no hard-delete per D-26)', () => {
    throw new Error('NOT IMPLEMENTED — plan W2-P05');
  });
});
