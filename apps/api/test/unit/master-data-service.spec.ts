/**
 * Unit-level guards for MasterDataService — no DB needed.
 *
 * Verifies the contract that the service rejects invalid IANA timezones and
 * unknown ISO-4217 currency codes BEFORE touching Postgres. Integration
 * coverage (PostGIS round-trip, soft-delete, audit triggers) lives in
 * test/integration/master-data.spec.ts.
 */
import { BadRequestException } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import type { DataSource } from 'typeorm';
import { MasterDataService } from '../../src/modules/master-data/master-data.service';

// Pass null (not undefined) to opt out of tenant context — JS default params
// apply when undefined is passed, so null is the correct "no tenant" sentinel.
function makeService(tenantId: string | null = '00000000-0000-0000-0000-000000000001') {
  const cls = {
    get: (key: string) => (key === 'tenantId' ? tenantId ?? undefined : undefined),
  } as unknown as ClsService;

  const ds = {
    transaction: async () => {
      throw new Error('DB not reachable in unit test — validation must throw first');
    },
  } as unknown as DataSource;

  return new MasterDataService(ds, cls);
}

const basePoint = { type: 'Point' as const, coordinates: [-4.024, 5.345] as [number, number] };

describe('MasterDataService — validation guards', () => {
  it('rejects an unknown IANA timezone with BadRequestException', async () => {
    const svc = makeService();
    await expect(
      svc.createSite({
        countryId: '00000000-0000-0000-0000-000000000010',
        code: 'CI-ABJ-01',
        name: 'Carrière Abidjan',
        ianaTimezone: 'Foobar/Baz',
        functionalCurrency: 'XOF',
        gpsPoint: basePoint,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown currency code with BadRequestException', async () => {
    const svc = makeService();
    await expect(
      svc.createSite({
        countryId: '00000000-0000-0000-0000-000000000010',
        code: 'CI-ABJ-02',
        name: 'Carrière Yamoussoukro',
        ianaTimezone: 'Africa/Abidjan',
        functionalCurrency: 'ZZZ',
        gpsPoint: basePoint,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects calls without a CLS tenant context', async () => {
    const svc = makeService(null);
    await expect(svc.listSites({})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('presigns attachments under a content-addressed sha256-keyed object key', async () => {
    const svc = makeService();
    const out = await svc.presignAttachment({
      sha256: 'a'.repeat(64),
      size: 1024,
      mime: 'application/pdf',
    });
    expect(out.objectKey).toBe(`sha256-${'a'.repeat(64)}`);
    expect(out.contentAddressed).toBe(true);
    expect(out.uploadUrl.startsWith('s3://')).toBe(true);
  });

  it('rejects a permit whose valid_from is not strictly before valid_to', async () => {
    const svc = makeService();
    await expect(
      svc.createPermit({
        siteId: '00000000-0000-0000-0000-000000000020',
        type: 'exploitation',
        authority: 'DGMG',
        reference: 'PERM-2026-001',
        validFrom: '2026-01-01',
        validTo: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
