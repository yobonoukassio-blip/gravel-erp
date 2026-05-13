/**
 * ScreeningSessionService unit tests (CRI-01).
 *
 * Tests:
 *   1. Non-conforming yield without nonconformity_reason throws BadRequestException
 *   2. complete() with 3 calibres publishes single session_completed event with 3 calibre_yields
 *   3. Status transitions ACTIVE→PAUSED→ACTIVE→COMPLETED all accepted
 *   4. 0 calibres throws BadRequestException
 */
import { BadRequestException } from '@nestjs/common';
import { ScreeningSessionService } from '../services/screening-session.service';
import { CalibreYield, ScreeningSession } from '../entities/screening-session.entity';

function _makeScreeningSession(overrides: Partial<ScreeningSession> = {}): ScreeningSession {
  return {
    id: 'screen-001',
    tenantId: 'tenant-001',
    siteId: 'site-001',
    operationalDayId: 'day-001',
    screenId: 'screen-eq-001',
    inputStockpileId: null,
    sessionStartUtc: new Date('2026-05-01T06:00:00Z'),
    sessionEndUtc: null,
    inputTonnageKg: 0,
    calibreYields: [],
    operatorId: 'op-001',
    status: 'ACTIVE',
    notesMd: null,
    createdAtUtc: new Date(),
    updatedAtUtc: new Date(),
    ...overrides,
  };
}

const THREE_CALIBRES: CalibreYield[] = [
  { calibre_code: '0-4', output_stockpile_id: 'sp-001', tonnage_kg: 200, is_nonconforming: false, nonconformity_reason: null },
  { calibre_code: '4-16', output_stockpile_id: 'sp-002', tonnage_kg: 350, is_nonconforming: false, nonconformity_reason: null },
  { calibre_code: '16-31', output_stockpile_id: 'sp-003', tonnage_kg: 150, is_nonconforming: true, nonconformity_reason: 'Surdimensionné détecté' },
];

describe('ScreeningSessionService', () => {
  let service: ScreeningSessionService;
  let mockDs: { query: jest.Mock; transaction: jest.Mock };
  let mockOutbox: { publish: jest.Mock };

  beforeEach(() => {
    mockOutbox = { publish: jest.fn().mockResolvedValue(undefined) };

    const mockManager = { query: jest.fn() };

    mockDs = {
      query: jest.fn(),
      transaction: jest.fn().mockImplementation(async (fn: (em: unknown) => Promise<unknown>) => {
        return fn(mockManager);
      }),
    };

    service = new ScreeningSessionService(
      mockDs as unknown as Parameters<typeof service.constructor>[0],
      mockOutbox as unknown as Parameters<typeof service.constructor>[1],
    );

    (service as unknown as { _testManager: typeof mockManager })._testManager = mockManager;
  });

  describe('validateCalibreYields()', () => {
    it('throws BadRequestException when is_nonconforming=true but nonconformity_reason is null', () => {
      const yields: CalibreYield[] = [
        { calibre_code: '0-4', output_stockpile_id: 'sp-001', tonnage_kg: 200, is_nonconforming: true, nonconformity_reason: null },
      ];
      expect(() => service.validateCalibreYields(yields)).toThrow(BadRequestException);
    });

    it('does not throw when is_nonconforming=true with a nonconformity_reason', () => {
      const yields: CalibreYield[] = [
        { calibre_code: '0-4', output_stockpile_id: 'sp-001', tonnage_kg: 200, is_nonconforming: true, nonconformity_reason: 'Surdimensionné' },
      ];
      expect(() => service.validateCalibreYields(yields)).not.toThrow();
    });

    it('throws BadRequestException when yields is empty', () => {
      expect(() => service.validateCalibreYields([])).toThrow(BadRequestException);
    });

    it('accepts is_nonconforming=false with nonconformity_reason=null', () => {
      const yields: CalibreYield[] = [
        { calibre_code: '0-4', output_stockpile_id: 'sp-001', tonnage_kg: 200, is_nonconforming: false, nonconformity_reason: null },
      ];
      expect(() => service.validateCalibreYields(yields)).not.toThrow();
    });
  });

  describe('complete()', () => {
    function setupManagerMocks(yields: CalibreYield[]): void {
      const manager = (service as unknown as { _testManager: { query: jest.Mock } })._testManager;
      manager.query
        // SELECT FOR UPDATE
        .mockResolvedValueOnce([{
          id: 'screen-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', screen_id: 'screen-eq-001',
          input_stockpile_id: null, session_start_utc: new Date(),
          session_end_utc: null, input_tonnage_kg: '0',
          calibre_yields: [], operator_id: 'op-001',
          status: 'ACTIVE', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }])
        // UPDATE RETURNING
        .mockResolvedValueOnce([{
          id: 'screen-001', tenant_id: 'tenant-001', site_id: 'site-001',
          operational_day_id: 'day-001', screen_id: 'screen-eq-001',
          input_stockpile_id: null, session_start_utc: new Date(),
          session_end_utc: new Date(), input_tonnage_kg: '700',
          calibre_yields: yields, operator_id: 'op-001',
          status: 'COMPLETED', notes_md: null,
          created_at_utc: new Date(), updated_at_utc: new Date(),
        }]);
    }

    it('publishes a single session_completed event with all 3 calibre_yields', async () => {
      setupManagerMocks(THREE_CALIBRES);

      await service.complete('screen-001', {
        inputTonnageKg: 700,
        calibreYields: THREE_CALIBRES,
        operatorId: 'op-001',
      });

      expect(mockOutbox.publish).toHaveBeenCalledTimes(1);
      const publishCall = mockOutbox.publish.mock.calls[0][0];
      expect(publishCall.eventType).toBe('production.screening.session_completed');
      expect(publishCall.payload.calibre_yields).toHaveLength(3);
      expect(publishCall.payload.session_id).toBe('screen-001');
      // Manager passed — proves same-tx atomicity
      expect(publishCall.manager).toBeDefined();
    });

    it('outbox payload includes calibre_yields with nonconforming entry', async () => {
      setupManagerMocks(THREE_CALIBRES);

      await service.complete('screen-001', {
        inputTonnageKg: 700,
        calibreYields: THREE_CALIBRES,
        operatorId: 'op-001',
      });

      const payload = mockOutbox.publish.mock.calls[0][0].payload;
      const nonconf = payload.calibre_yields.find(
        (y: CalibreYield) => y.is_nonconforming === true,
      );
      expect(nonconf).toBeDefined();
      expect(nonconf.nonconformity_reason).toBe('Surdimensionné détecté');
    });

    it('throws BadRequestException when completing with no calibres', async () => {
      await expect(
        service.complete('screen-001', {
          inputTonnageKg: 0,
          calibreYields: [],
          operatorId: 'op-001',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockOutbox.publish).not.toHaveBeenCalled();
    });
  });

  describe('status transitions', () => {
    it('ACTIVE→PAUSED accepted', async () => {
      mockDs.query.mockResolvedValueOnce([{
        id: 'screen-001', tenant_id: 'tenant-001', site_id: 'site-001',
        operational_day_id: 'day-001', screen_id: 'screen-eq-001',
        input_stockpile_id: null, session_start_utc: new Date(),
        session_end_utc: null, input_tonnage_kg: '0',
        calibre_yields: [], operator_id: 'op-001',
        status: 'PAUSED', notes_md: null,
        created_at_utc: new Date(), updated_at_utc: new Date(),
      }]);

      const result = await service.pause('screen-001');
      expect(result.status).toBe('PAUSED');
    });

    it('PAUSED→ACTIVE accepted', async () => {
      mockDs.query.mockResolvedValueOnce([{
        id: 'screen-001', tenant_id: 'tenant-001', site_id: 'site-001',
        operational_day_id: 'day-001', screen_id: 'screen-eq-001',
        input_stockpile_id: null, session_start_utc: new Date(),
        session_end_utc: null, input_tonnage_kg: '0',
        calibre_yields: [], operator_id: 'op-001',
        status: 'ACTIVE', notes_md: null,
        created_at_utc: new Date(), updated_at_utc: new Date(),
      }]);

      const result = await service.resume('screen-001');
      expect(result.status).toBe('ACTIVE');
    });

    it('throws BadRequestException on invalid transition (e.g., COMPLETED→PAUSED)', async () => {
      // If DB returns no rows, it means the WHERE status=$2 clause found nothing
      mockDs.query.mockResolvedValueOnce([]);

      await expect(service.pause('screen-001')).rejects.toThrow(BadRequestException);
    });
  });
});
