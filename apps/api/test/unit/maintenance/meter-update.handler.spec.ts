import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { MeterUpdateHandler } from '../../../src/modules/maintenance/event-handlers/meter-update.handler';

describe('MeterUpdateHandler', () => {
  let handler: MeterUpdateHandler;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn().mockResolvedValue({ rowCount: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeterUpdateHandler,
        {
          provide: DataSource,
          useValue: { query: mockQuery },
        },
      ],
    }).compile();

    handler = module.get(MeterUpdateHandler);
  });

  describe('onRefuelCreated — hour meter updates', () => {
    it('Test 1: updates hour_meter_current when reading is HIGHER than stored value', async () => {
      await handler.onRefuelCreated({
        tenantId: 'tenant-1',
        equipmentId: 'equip-1',
        equipmentHourMeterReading: '1500.0',
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('hour_meter_current IS NULL OR hour_meter_current < $3::numeric');
      expect(params).toEqual(['equip-1', 'tenant-1', '1500.0']);
    });

    it('Test 2: IF HIGHER guard prevents regression — SQL WHERE clause prevents update when reading is LOWER', async () => {
      // The SQL WHERE clause includes "hour_meter_current < $3::numeric"
      // so the DB will NOT update if current > incoming. We verify the SQL is correct.
      await handler.onRefuelCreated({
        tenantId: 'tenant-1',
        equipmentId: 'equip-1',
        equipmentHourMeterReading: '1400.0',
      });

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('hour_meter_current < $3::numeric');
      // The handler always issues the UPDATE; the WHERE clause is the guard
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('Test 3: updates when hour_meter_current is NULL (first reading)', async () => {
      await handler.onRefuelCreated({
        tenantId: 'tenant-1',
        equipmentId: 'equip-1',
        equipmentHourMeterReading: '800.0',
      });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('hour_meter_current IS NULL');
      expect(params[2]).toBe('800.0');
    });

    it('Test 3b: no-op when equipmentId is missing', async () => {
      await handler.onRefuelCreated({
        tenantId: 'tenant-1',
        equipmentId: '',
        equipmentHourMeterReading: '800.0',
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('Test 3c: no-op when equipmentHourMeterReading is missing', async () => {
      await handler.onRefuelCreated({
        tenantId: 'tenant-1',
        equipmentId: 'equip-1',
        equipmentHourMeterReading: '',
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('onRotationCompleted — km/odometer updates', () => {
    it('Test 4: updates odometer_km_current when km_total_after is HIGHER', async () => {
      await handler.onRotationCompleted({
        payload: {
          tenant_id: 'tenant-1',
          truck_equipment_id: 'equip-2',
          km_total_after: '245.50',
        },
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('odometer_km_current IS NULL OR odometer_km_current < $3::numeric');
      expect(params).toEqual(['equip-2', 'tenant-1', '245.50']);
    });

    it('Test 5: no-op when km_total_after is null', async () => {
      await handler.onRotationCompleted({
        payload: {
          tenant_id: 'tenant-1',
          truck_equipment_id: 'equip-2',
          km_total_after: null,
        },
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('Test 6: no-op when truck_equipment_id is null', async () => {
      await handler.onRotationCompleted({
        payload: {
          tenant_id: 'tenant-1',
          truck_equipment_id: null,
          km_total_after: '100.00',
        },
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('Test 6b: no-op when tenant_id is missing', async () => {
      await handler.onRotationCompleted({
        payload: {
          truck_equipment_id: 'equip-2',
          km_total_after: '100.00',
        },
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('Test 7: all UPDATEs scope by tenant_id (RLS-safe)', async () => {
      // Verify hour meter update includes tenant_id
      await handler.onRefuelCreated({
        tenantId: 'tenant-A',
        equipmentId: 'equip-1',
        equipmentHourMeterReading: '500.0',
      });
      const [sqlHours] = mockQuery.mock.calls[0];
      expect(sqlHours).toContain('tenant_id = $2');

      mockQuery.mockClear();

      // Verify km update includes tenant_id
      await handler.onRotationCompleted({
        payload: {
          tenant_id: 'tenant-B',
          truck_equipment_id: 'equip-2',
          km_total_after: '200.00',
        },
      });
      const [sqlKm] = mockQuery.mock.calls[0];
      expect(sqlKm).toContain('tenant_id = $2');
    });
  });
});
