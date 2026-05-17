/**
 * Unit tests for AuditExportCron (HRD-MVP-05 — D-16).
 *
 * Verifies:
 *  - Iterates only active tenants with compliance_email set
 *  - Per-tenant fault isolation (one tenant failing does not abort the run)
 *  - Previous-quarter window math (UTC)
 *  - Email dispatch via NotificationService with correct payload shape
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tenant } from '../../../src/modules/tenancy/entities/tenant.entity';
import { AuditExportService } from '../../../src/modules/audit/audit-export.service';
import { AuditExportCron } from '../../../src/modules/audit/audit-export.cron';
import { NotificationService } from '../../../src/modules/notification/notification.service';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-A',
    code: 'GI',
    name: 'Gravel Ivoire',
    defaultLocale: 'fr-CI',
    groupPivotCurrency: 'XOF',
    status: 'active',
    archivedAt: null,
    complianceEmail: 'compliance@gravel.ci',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Tenant;
}

describe('AuditExportCron (HRD-MVP-05 — D-16)', () => {
  let cron: AuditExportCron;
  let tenantRepo: { createQueryBuilder: jest.Mock };
  let exportSvc: { export: jest.Mock };
  let notifications: { dispatch: jest.Mock };
  const tenantsToReturn: Tenant[] = [];

  beforeEach(async () => {
    tenantsToReturn.length = 0;
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => tenantsToReturn),
    };
    tenantRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    exportSvc = {
      export: jest.fn().mockResolvedValue({
        auditRows: [],
        chainVerification: [],
        complianceCsvUrl: 'https://example/audit.csv?X-Amz-Expires=86400',
        generatedAt: '2026-04-01T04:00:00Z',
        signedBy: 'gravel-audit-export-v1',
      }),
    };
    notifications = { dispatch: jest.fn().mockResolvedValue('job-1') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditExportCron,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: AuditExportService, useValue: exportSvc },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    cron = module.get(AuditExportCron);
  });

  it('Test 1: filters to active tenants with compliance_email set', async () => {
    tenantsToReturn.push(makeTenant());
    await cron.runForNow(new Date('2026-04-01T04:00:00Z'));

    const qbInstance = tenantRepo.createQueryBuilder.mock.results[0].value;
    expect(qbInstance.where).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"));
    expect(qbInstance.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('compliance_email IS NOT NULL'),
    );
  });

  it('Test 2: computes previous-quarter window (Q1 2026 when run on Apr 1)', async () => {
    tenantsToReturn.push(makeTenant());
    await cron.runForNow(new Date('2026-04-01T04:00:00Z'));

    const call = exportSvc.export.mock.calls[0][0];
    expect(call.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(call.to.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('Test 3: previous-quarter rolls back across year boundary (Q4 prev year when run on Jan 1)', async () => {
    tenantsToReturn.push(makeTenant());
    await cron.runForNow(new Date('2026-01-01T04:00:00Z'));
    const call = exportSvc.export.mock.calls[0][0];
    expect(call.from.toISOString()).toBe('2025-10-01T00:00:00.000Z');
    expect(call.to.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('Test 4: enqueues email via NotificationService with correct payload + CSV link', async () => {
    tenantsToReturn.push(makeTenant({ id: 'T1', complianceEmail: 'audit@t1.io', name: 'T1' }));
    await cron.runForNow(new Date('2026-04-01T04:00:00Z'));

    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    const payload = notifications.dispatch.mock.calls[0][0];
    expect(payload.tenantId).toBe('T1');
    expect(payload.channel).toBe('email');
    expect(payload.recipient.email).toBe('audit@t1.io');
    expect(payload.templateKey).toBe('audit.export.quarterly');
    expect(payload.payload.complianceCsvUrl).toBe(
      'https://example/audit.csv?X-Amz-Expires=86400',
    );
    expect(payload.payload.quarterLabel).toBe('Q1 2026');
    expect(payload.payload.tenantName).toBe('T1');
  });

  it('Test 5: per-tenant fault isolation — one tenant failing does not abort the run', async () => {
    tenantsToReturn.push(
      makeTenant({ id: 'T1', complianceEmail: 't1@x.io' }),
      makeTenant({ id: 'T2', complianceEmail: 't2@x.io' }),
      makeTenant({ id: 'T3', complianceEmail: 't3@x.io' }),
    );
    exportSvc.export.mockImplementation(async ({ tenantId }: { tenantId: string }) => {
      if (tenantId === 'T2') throw new Error('boom');
      return {
        auditRows: [],
        chainVerification: [],
        complianceCsvUrl: 'https://example?X-Amz-Expires=86400',
        generatedAt: '2026-04-01T04:00:00Z',
        signedBy: 'gravel-audit-export-v1',
      };
    });

    const result = await cron.runForNow(new Date('2026-04-01T04:00:00Z'));
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    // T1 + T3 sent, T2 skipped due to error
    const ids = notifications.dispatch.mock.calls.map((c) => c[0].tenantId);
    expect(ids.sort()).toEqual(['T1', 'T3']);
  });

  it('Test 6: skips dispatch but counts result when tenant list is empty', async () => {
    // tenantsToReturn empty
    const result = await cron.runForNow(new Date('2026-04-01T04:00:00Z'));
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
