import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShiftEntryService } from '../services/shift-entry.service';
import type { ShiftEntryRow } from '../services/shift-entry.service';

/**
 * Unit tests for ShiftEntryService (RH-02).
 */

const BASE_ROW: ShiftEntryRow = {
  id: 'entry-001',
  tenant_id: 'tenant-1',
  site_id: 'site-1',
  operational_day_id: 'opday-1',
  employee_id: 'emp-1',
  check_in_utc: '2026-05-13T06:00:00Z',
  check_out_utc: null,
  position_code: 'FOREUR',
  supervisor_id: 'sup-1',
  supersedes_id: null,
  created_at_utc: '2026-05-13T06:00:00Z',
};

describe('ShiftEntryService', () => {
  it('create inserts a new shift entry row', async () => {
    const ds = {
      query: jest.fn().mockResolvedValue([BASE_ROW]),
    } as unknown as DataSource;
    const svc = new ShiftEntryService(ds);

    const result = await svc.create({
      tenantId: 'tenant-1',
      siteId: 'site-1',
      operationalDayId: 'opday-1',
      employeeId: 'emp-1',
      checkInUtc: new Date('2026-05-13T06:00:00Z'),
      positionCode: 'FOREUR',
      supervisorId: 'sup-1',
    });

    expect(result.id).toBe('entry-001');
    expect(result.check_out_utc).toBeNull();
  });

  it('recordCheckOut creates a superseding row', async () => {
    const supersedingRow: ShiftEntryRow = {
      ...BASE_ROW,
      id: 'entry-002',
      check_out_utc: '2026-05-13T14:00:00Z',
      supersedes_id: 'entry-001',
    };

    const ds = {
      query: jest.fn()
        .mockResolvedValueOnce([BASE_ROW])         // findById
        .mockResolvedValueOnce([supersedingRow]),   // INSERT
    } as unknown as DataSource;
    const svc = new ShiftEntryService(ds);

    const result = await svc.recordCheckOut(
      'entry-001',
      'tenant-1',
      new Date('2026-05-13T14:00:00Z'),
    );

    expect(result.check_out_utc).toBe('2026-05-13T14:00:00Z');
    expect(result.supersedes_id).toBe('entry-001');
  });

  it('recordCheckOut throws when entry already checked out', async () => {
    const checkedOut: ShiftEntryRow = { ...BASE_ROW, check_out_utc: '2026-05-13T14:00:00Z' };
    const ds = {
      query: jest.fn().mockResolvedValue([checkedOut]),
    } as unknown as DataSource;
    const svc = new ShiftEntryService(ds);

    await expect(
      svc.recordCheckOut('entry-001', 'tenant-1', new Date()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
