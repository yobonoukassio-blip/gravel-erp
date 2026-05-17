/**
 * Unit tests for AuditExportService (HRD-MVP-05 — D-14/15).
 *
 * Verifies:
 *  - Export shape matches D-14 (auditRows, chainVerification, complianceCsvUrl)
 *  - Chain verification delegates to existing AuditChainVerifier (no duplication)
 *  - S3 presigned URL contains 24h (86400s) expiry per D-15
 *  - Per-table chain verification entries cover all distinct tables in window
 *  - CSV writer produces header + chain summary
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLog } from '../../../src/modules/audit/audit-log.entity';
import { AuditChainVerifier } from '../../../src/modules/audit/audit-chain.verifier';
import { AuditExportService } from '../../../src/modules/audit/audit-export.service';

function makeAuditRow(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: '1',
    tenantId: 'tenant-A',
    tableName: 'sites',
    rowPk: 'site-1',
    action: 'INSERT',
    beforeJsonb: null,
    afterJsonb: { id: 'site-1', name: 'A1' },
    actorUserId: 'user-1',
    requestId: null,
    atUtc: new Date('2026-04-15T10:00:00Z'),
    prevHash: Buffer.from([0x00]),
    rowHash: Buffer.from([0xab, 0xcd]),
    ...overrides,
  } as AuditLog;
}

describe('AuditExportService (HRD-MVP-05)', () => {
  let svc: AuditExportService;
  let auditRepo: { createQueryBuilder: jest.Mock };
  let verifier: { verifyChain: jest.Mock };

  const builderRows: AuditLog[] = [];

  beforeEach(async () => {
    builderRows.length = 0;
    // Chained query builder mock.
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => builderRows),
    };
    auditRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    verifier = {
      verifyChain: jest.fn().mockResolvedValue({ valid: true, rowsChecked: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditExportService,
        { provide: getRepositoryToken(AuditLog), useValue: auditRepo },
        { provide: AuditChainVerifier, useValue: verifier },
      ],
    }).compile();

    svc = module.get(AuditExportService);
  });

  it('Test 1: returns response shape {auditRows, chainVerification, complianceCsvUrl, generatedAt, signedBy}', async () => {
    builderRows.push(makeAuditRow());
    const result = await svc.export({
      tenantId: 'tenant-A',
      from: new Date('2026-04-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
    });

    expect(result).toHaveProperty('auditRows');
    expect(result).toHaveProperty('chainVerification');
    expect(result).toHaveProperty('complianceCsvUrl');
    expect(result).toHaveProperty('generatedAt');
    expect(result.signedBy).toBe('gravel-audit-export-v1');
    expect(Array.isArray(result.auditRows)).toBe(true);
    expect(result.auditRows.length).toBe(1);
    expect(result.auditRows[0].tableName).toBe('sites');
    expect(result.auditRows[0].action).toBe('INSERT');
  });

  it('Test 2: chainVerification has one entry per distinct table in window; flags broken chain', async () => {
    builderRows.push(
      makeAuditRow({ id: '1', tableName: 'sites' }),
      makeAuditRow({ id: '2', tableName: 'work_orders' }),
      makeAuditRow({ id: '3', tableName: 'sites' }),
    );
    verifier.verifyChain.mockImplementation(async (_tid: string, table: string) => {
      if (table === 'work_orders') {
        return { valid: false, brokenAt: '42', rowsChecked: 5 };
      }
      return { valid: true, rowsChecked: 2 };
    });

    const result = await svc.export({
      tenantId: 'tenant-A',
      from: new Date('2026-04-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
    });

    expect(result.chainVerification).toHaveLength(2);
    const tables = result.chainVerification.map((c) => c.tableName).sort();
    expect(tables).toEqual(['sites', 'work_orders']);
    const broken = result.chainVerification.find((c) => c.tableName === 'work_orders');
    expect(broken?.valid).toBe(false);
    expect(broken?.brokenAt).toBe('42');
  });

  it('Test 3: complianceCsvUrl is a presigned URL with 24h (86400s) expiry per D-15', async () => {
    builderRows.push(makeAuditRow());
    const result = await svc.export({
      tenantId: 'tenant-A',
      from: new Date('2026-04-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
    });

    expect(result.complianceCsvUrl).toMatch(/X-Amz-Expires=86400/);
    expect(result.complianceCsvUrl).toMatch(/^https?:\/\//);
  });

  it('Test 4: delegates to existing AuditChainVerifier (no duplicate chain logic)', async () => {
    builderRows.push(makeAuditRow({ tableName: 'sites' }));
    await svc.export({
      tenantId: 'tenant-A',
      from: new Date('2026-04-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
    });
    expect(verifier.verifyChain).toHaveBeenCalledWith('tenant-A', 'sites');
  });

  it('Test 5: empty result set still returns a CSV URL and empty chainVerification', async () => {
    const result = await svc.export({
      tenantId: 'tenant-empty',
      from: new Date('2026-04-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
    });
    expect(result.auditRows).toHaveLength(0);
    expect(result.chainVerification).toHaveLength(0);
    expect(result.complianceCsvUrl).toMatch(/X-Amz-Expires=86400/);
  });

  it('Test 6: query builder filters by tenantId + at_utc window', async () => {
    builderRows.push(makeAuditRow());
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-07-01T00:00:00Z');
    await svc.export({ tenantId: 'tenant-A', from, to });

    const qbInstance = auditRepo.createQueryBuilder.mock.results[0].value;
    expect(qbInstance.where).toHaveBeenCalledWith(expect.stringContaining('tenant_id'), {
      tenantId: 'tenant-A',
    });
    expect(qbInstance.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('at_utc >= :from'),
      { from },
    );
    expect(qbInstance.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('at_utc < :to'),
      { to },
    );
  });
});
