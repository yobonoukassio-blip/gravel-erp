import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShiftRosterService } from '../services/shift-roster.service';
import type { ShiftRosterRow } from '../services/shift-roster.service';

/**
 * Unit tests for ShiftRosterService (RH-03).
 */

const BASE_ROSTER: ShiftRosterRow = {
  id: 'roster-001',
  tenant_id: 'tenant-1',
  site_id: 'site-1',
  roster_date: '2026-05-13',
  roster_jsonb: [{ employee_id: 'emp-1', position_code: 'FOREUR', shift_type: 'JOUR' }],
  version: 1,
  created_at_utc: '2026-05-13T06:00:00Z',
  updated_at_utc: '2026-05-13T06:00:00Z',
};

describe('ShiftRosterService', () => {
  it('upsert creates a new roster when none exists', async () => {
    const ds = {
      query: jest.fn()
        .mockResolvedValueOnce([])              // findByDate → empty
        .mockResolvedValueOnce([BASE_ROSTER]),   // INSERT
    } as unknown as DataSource;
    const svc = new ShiftRosterService(ds);

    const result = await svc.upsert({
      tenantId: 'tenant-1',
      siteId: 'site-1',
      rosterDate: '2026-05-13',
      rosterSlots: BASE_ROSTER.roster_jsonb,
    });

    expect(result.id).toBe('roster-001');
    expect(result.version).toBe(1);
  });

  it('upsert updates roster when version matches', async () => {
    const updated: ShiftRosterRow = { ...BASE_ROSTER, version: 2 };
    const ds = {
      query: jest.fn()
        .mockResolvedValueOnce([BASE_ROSTER])  // findByDate → existing
        .mockResolvedValueOnce([updated]),      // UPDATE
    } as unknown as DataSource;
    const svc = new ShiftRosterService(ds);

    const result = await svc.upsert({
      tenantId: 'tenant-1',
      siteId: 'site-1',
      rosterDate: '2026-05-13',
      rosterSlots: BASE_ROSTER.roster_jsonb,
      version: 1, // matches existing version
    });

    expect(result.version).toBe(2);
  });

  it('upsert throws 409 when version mismatches', async () => {
    const ds = {
      query: jest.fn().mockResolvedValue([BASE_ROSTER]), // findByDate → existing v1
    } as unknown as DataSource;
    const svc = new ShiftRosterService(ds);

    await expect(
      svc.upsert({
        tenantId: 'tenant-1',
        siteId: 'site-1',
        rosterDate: '2026-05-13',
        rosterSlots: [],
        version: 99, // wrong version
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
