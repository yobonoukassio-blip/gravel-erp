/**
 * Unit tests for AuditExportController (HRD-MVP-05 — D-14).
 *
 * Verifies query-param validation and the D-14 endpoint signature.
 * RBAC enforcement is delegated to RolesGuard which is verified in its own
 * unit/integration suite; here we instantiate the controller directly to
 * keep the test focused on input handling and service delegation.
 */
import { BadRequestException } from '@nestjs/common';
import { AuditExportController } from '../../../src/modules/audit/audit-export.controller';

describe('AuditExportController (HRD-MVP-05)', () => {
  let controller: AuditExportController;
  let svc: { export: jest.Mock };

  beforeEach(() => {
    svc = {
      export: jest.fn().mockResolvedValue({
        auditRows: [],
        chainVerification: [],
        complianceCsvUrl: 'https://example/X-Amz-Expires=86400',
        generatedAt: '2026-05-17T00:00:00Z',
        signedBy: 'gravel-audit-export-v1',
      }),
    };
    controller = new AuditExportController(svc as never);
  });

  it('Test 1: rejects request missing tenant_id', async () => {
    await expect(
      controller.export('', '2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Test 2: rejects request missing from/to', async () => {
    await expect(controller.export('tenant-A', '', '2026-04-01T00:00:00Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.export('tenant-A', '2026-01-01T00:00:00Z', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Test 3: rejects non-ISO timestamps', async () => {
    await expect(controller.export('tenant-A', 'not-a-date', '2026-04-01T00:00:00Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Test 4: rejects when from >= to', async () => {
    await expect(
      controller.export('tenant-A', '2026-04-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.export('tenant-A', '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Test 5: delegates to service with parsed Date objects and returns response shape', async () => {
    const res = await controller.export(
      'tenant-A',
      '2026-01-01T00:00:00Z',
      '2026-04-01T00:00:00Z',
    );
    expect(svc.export).toHaveBeenCalledTimes(1);
    const call = svc.export.mock.calls[0][0];
    expect(call.tenantId).toBe('tenant-A');
    expect(call.from).toBeInstanceOf(Date);
    expect(call.to).toBeInstanceOf(Date);
    expect(call.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(call.to.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(res.signedBy).toBe('gravel-audit-export-v1');
    expect(res.complianceCsvUrl).toMatch(/X-Amz-Expires=86400/);
  });
});
