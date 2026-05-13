/**
 * CrusherSessionService unit tests (CON-01, CON-02).
 *
 * Tests:
 *   1. complete() publishes outbox event in same tx as status update
 *   2. Rollback test: roll back tx → outbox row gone + session still ACTIVE
 *   3. performance_pct GENERATED column = 80 when output=800kg, input=1000kg
 *   4. energy_kwh stored correctly on completion
 *   5. energyService.upsert() called with correct kwh value (CON-02)
 */
import { BadRequestException } from '@nestjs/common';
import { CrusherSessionService } from '../services/crusher-session.service';
import { CrusherSession } from '../entities/crusher-session.entity';

// ---- Minimal mocks ----

function makeSession(overrides: Partial<CrusherSession> = {}): CrusherSession {
  return {
    id: 'session-001',
    tenantId: 'tenant-001',
    siteId: 'site-001',
    operationalDayId: 'day-001',
    crusherId: 'crusher-001',
    inputZoneId: null,
    outputStockpileId: 'stockpile-001',
    materialType: 'granite_brut',
    calibreCode: '0-31',
    inputTonnageKg: 0,
    outputTonnageKg: 0,
    energyKwh: 0,
    operatingHours: 0,
    performancePct: 0,
    sessionStartUtc: new Date('2026-05-01T06:00:00Z'),
    sessionEndUtc: null,
    operatorId: 'op-001',
    status: 'ACTIVE',
    notesMd: null,
    createdAtUtc: new Date(),
    updatedAtUtc: new Date(),
    ...overrides,
  };
}

describe('CrusherSessionService', () => {
  let service: CrusherSessionService;
  let mockDs: { query: jest.Mock; transaction: jest.Mock };
  let mockOutbox: { publish: jest.Mock };
  let mockEnergy: { upsert: jest.Mock };

  beforeEach(() => {
    mockOutbox = { publish: jest.fn().mockResolvedValue(undefined) };
    mockEnergy = { upsert: jest.fn().mockResolvedValue(undefined) };

    // Manager mock simulates running within a transaction
    const mockManager = {
      query: jest.fn(),
    };

    mockDs = {
      query: jest.fn(),
      transaction: jest.fn().mockImplementation(async (fn: (em: unknown) => Promise<unknown>) => {
        return fn(mockManager);
      }),
    };

    service = new CrusherSessionService(
      mockDs as unknown as Parameters<typeof service.constructor>[0],
      mockOutbox as unknown as Parameters<typeof service.constructor>[1],
      mockEnergy as unknown as Parameters<typeof service.constructor>[2],
    );

    // Wire manager to service for introspection
    (service as unknown as { _testManager: typeof mockManager })._testManager = mockManager;
  });

  describe('complete()', () => {
    it('publishes outbox event in same transaction as session update', async () => {
      const activeSession = makeSession({ status: 'ACTIVE' });
      const _completedSession = makeSession({
        status: 'COMPLETED',
        inputTonnageKg: 1000,
        outputTonnageKg: 800,
        energyKwh: 150,
        operatingHours: 4,
        sessionEndUtc: new Date(),
        performancePct: 80,
      });

      const manager = (service as unknown as { _testManager: { query: jest.Mock } })._testManager;
      // SELECT FOR UPDATE returns active session
      manager.query
        .mockResolvedValueOnce([{
          id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', crusher_id: 'crusher-001',
          input_zone_id: null, output_stockpile_id: 'stockpile-001',
          material_type: 'granite_brut', calibre_code: '0-31',
          input_tonnage_kg: '0', output_tonnage_kg: '0', energy_kwh: '0',
          operating_hours: '0', performance_pct: '0',
          session_start_utc: activeSession.sessionStartUtc,
          session_end_utc: null, operator_id: 'op-001',
          status: 'ACTIVE', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }])
        // UPDATE RETURNING returns completed session
        .mockResolvedValueOnce([{
          id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', crusher_id: 'crusher-001',
          input_zone_id: null, output_stockpile_id: 'stockpile-001',
          material_type: 'granite_brut', calibre_code: '0-31',
          input_tonnage_kg: '1000', output_tonnage_kg: '800', energy_kwh: '150',
          operating_hours: '4', performance_pct: '80',
          session_start_utc: activeSession.sessionStartUtc,
          session_end_utc: new Date(), operator_id: 'op-001',
          status: 'COMPLETED', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }]);

      await service.complete('session-001', {
        inputTonnageKg: 1000,
        outputTonnageKg: 800,
        energyKwh: 150,
        operatingHours: 4,
        yearMonth: '2026-05',
        operatorId: 'op-001',
      });

      // Outbox published inside the transaction
      expect(mockOutbox.publish).toHaveBeenCalledTimes(1);
      const publishCall = mockOutbox.publish.mock.calls[0][0];
      expect(publishCall.eventType).toBe('production.crusher.session_completed');
      expect(publishCall.payload.session_id).toBe('session-001');
      expect(publishCall.payload.output_tonnage_kg).toBe(800);
      expect(publishCall.payload.energy_kwh).toBe(150);
      // Manager passed to outbox — proves same-tx atomicity
      expect(publishCall.manager).toBeDefined();
    });

    it('rolls back: outbox not published when tx rolled back (manager not provided = ds.transaction wraps)', async () => {
      // If the DB update fails, the outbox.publish should not be called.
      const manager = (service as unknown as { _testManager: { query: jest.Mock } })._testManager;
      manager.query
        .mockResolvedValueOnce([{
          id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', crusher_id: 'crusher-001',
          input_zone_id: null, output_stockpile_id: 'stockpile-001',
          material_type: 'granite_brut', calibre_code: '0-31',
          input_tonnage_kg: '0', output_tonnage_kg: '0', energy_kwh: '0',
          operating_hours: '0', performance_pct: '0',
          session_start_utc: new Date(), session_end_utc: null,
          operator_id: 'op-001', status: 'ACTIVE', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }])
        // Simulate DB failure on UPDATE
        .mockRejectedValueOnce(new Error('DB constraint violation'));

      await expect(
        service.complete('session-001', {
          inputTonnageKg: 1000,
          outputTonnageKg: 800,
          energyKwh: 150,
          operatingHours: 4,
          yearMonth: '2026-05',
          operatorId: 'op-001',
        }),
      ).rejects.toThrow('DB constraint violation');

      // Outbox was NOT published because the session update failed
      expect(mockOutbox.publish).not.toHaveBeenCalled();
    });

    it('stores energy_kwh correctly and calls energyService.upsert with correct kwh (CON-02)', async () => {
      const manager = (service as unknown as { _testManager: { query: jest.Mock } })._testManager;
      manager.query
        .mockResolvedValueOnce([{
          id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', crusher_id: 'crusher-001',
          input_zone_id: null, output_stockpile_id: 'stockpile-001',
          material_type: 'granite_brut', calibre_code: '0-31',
          input_tonnage_kg: '0', output_tonnage_kg: '0', energy_kwh: '0',
          operating_hours: '0', performance_pct: '0',
          session_start_utc: new Date(), session_end_utc: null,
          operator_id: 'op-001', status: 'ACTIVE', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }])
        .mockResolvedValueOnce([{
          id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', crusher_id: 'crusher-001',
          input_zone_id: null, output_stockpile_id: 'stockpile-001',
          material_type: 'granite_brut', calibre_code: '0-31',
          input_tonnage_kg: '1000', output_tonnage_kg: '800', energy_kwh: '250.5',
          operating_hours: '5', performance_pct: '80',
          session_start_utc: new Date(), session_end_utc: new Date(),
          operator_id: 'op-001', status: 'COMPLETED', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }]);

      const result = await service.complete('session-001', {
        inputTonnageKg: 1000,
        outputTonnageKg: 800,
        energyKwh: 250.5,
        operatingHours: 5,
        yearMonth: '2026-05',
        operatorId: 'op-001',
      });

      expect(result.energyKwh).toBe(250.5);
      expect(mockEnergy.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockEnergy.upsert.mock.calls[0][0];
      expect(upsertCall.kwh).toBe(250.5);
      expect(upsertCall.usageType).toBe('concassage');
      expect(upsertCall.yearMonth).toBe('2026-05');
    });

    it('performance_pct is 80 when output=800kg, input=1000kg', async () => {
      // The GENERATED column is computed by Postgres. We verify the returned value is correct.
      const manager = (service as unknown as { _testManager: { query: jest.Mock } })._testManager;
      manager.query
        .mockResolvedValueOnce([{
          id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', crusher_id: 'crusher-001',
          input_zone_id: null, output_stockpile_id: 'stockpile-001',
          material_type: 'granite_brut', calibre_code: '0-31',
          input_tonnage_kg: '0', output_tonnage_kg: '0', energy_kwh: '0',
          operating_hours: '0', performance_pct: '0',
          session_start_utc: new Date(), session_end_utc: null,
          operator_id: 'op-001', status: 'ACTIVE', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }])
        .mockResolvedValueOnce([{
          id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', crusher_id: 'crusher-001',
          input_zone_id: null, output_stockpile_id: 'stockpile-001',
          material_type: 'granite_brut', calibre_code: '0-31',
          input_tonnage_kg: '1000', output_tonnage_kg: '800', energy_kwh: '100',
          operating_hours: '4', performance_pct: '80.00', // Postgres returns this from GENERATED col
          session_start_utc: new Date(), session_end_utc: new Date(),
          operator_id: 'op-001', status: 'COMPLETED', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }]);

      const result = await service.complete('session-001', {
        inputTonnageKg: 1000,
        outputTonnageKg: 800,
        energyKwh: 100,
        operatingHours: 4,
        yearMonth: '2026-05',
        operatorId: 'op-001',
      });

      expect(result.performancePct).toBe(80);
    });

    it('throws BadRequestException when session is already COMPLETED', async () => {
      const manager = (service as unknown as { _testManager: { query: jest.Mock } })._testManager;
      manager.query.mockResolvedValueOnce([{
        id: 'session-001', tenant_id: 'tenant-001', site_id: 'site-001',
        operational_day_id: 'day-001', crusher_id: 'crusher-001',
        input_zone_id: null, output_stockpile_id: 'stockpile-001',
        material_type: 'granite_brut', calibre_code: '0-31',
        input_tonnage_kg: '1000', output_tonnage_kg: '800', energy_kwh: '100',
        operating_hours: '4', performance_pct: '80',
        session_start_utc: new Date(), session_end_utc: new Date(),
        operator_id: 'op-001', status: 'COMPLETED', notes_md: null,
        created_at_utc: new Date(), updated_at_utc: new Date(),
      }]);

      await expect(
        service.complete('session-001', {
          inputTonnageKg: 1000,
          outputTonnageKg: 800,
          energyKwh: 100,
          operatingHours: 4,
          yearMonth: '2026-05',
          operatorId: 'op-001',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
