import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { SparePartService } from './spare-part.service';

/**
 * Unit tests for SparePartService Phase 8 enhancements (ALT-02).
 * Tests 1-8 from 08-W1-P02-PLAN.md T01 behavior spec.
 */
describe('SparePartService', () => {
  let service: SparePartService;
  let emitSpy: jest.SpyInstance;
  let mockGetOne: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockInsert: jest.Mock;

  const basePart = {
    id: 'sp-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    sku: 'SKU-001',
    label: 'Bolt M8',
    quantityOnHand: 10,
    thresholdMin: 8,
    belowThreshold: false,
  };

  beforeEach(async () => {
    mockGetOne = jest.fn();
    mockUpdate = jest.fn().mockResolvedValue(undefined);
    mockInsert = jest.fn().mockResolvedValue(undefined);

    const mockManager = {
      createQueryBuilder: () => ({
        setLock: () => ({
          where: () => ({
            getOne: mockGetOne,
          }),
        }),
      }),
      update: mockUpdate,
      insert: mockInsert,
    };

    const mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (m: unknown) => unknown) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SparePartService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventEmitter2, useValue: new EventEmitter2() },
      ],
    }).compile();

    service = module.get(SparePartService);
    const events = module.get(EventEmitter2);
    emitSpy = jest.spyOn(events, 'emit');
  });

  describe('consume() — threshold_crossed enrichment', () => {
    it('Test 1: emits threshold_crossed with siteId and severity=warning when crossing below (stock > 0)', async () => {
      mockGetOne.mockResolvedValueOnce({ ...basePart, quantityOnHand: 10, thresholdMin: 8, belowThreshold: false });

      await service.consume({ tenantId: 'tenant-1', workOrderId: 'wo-1', sparePartId: 'sp-1', quantity: 5 });

      // Payload severity is the canonical Phase-8 label ('warning'); the
      // boundary mapping warning -> Alert.severity 'high' lives in the handler.
      expect(emitSpy).toHaveBeenCalledWith('maintenance.spare_part.threshold_crossed', {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sparePartId: 'sp-1',
        sku: 'SKU-001',
        quantityOnHand: 5,
        thresholdMin: 8,
        severity: 'warning',
      });
    });

    it('Test 2: no event emitted when still above threshold', async () => {
      mockGetOne.mockResolvedValueOnce({ ...basePart, quantityOnHand: 10, thresholdMin: 5, belowThreshold: false });

      await service.consume({ tenantId: 'tenant-1', workOrderId: 'wo-1', sparePartId: 'sp-1', quantity: 2 });

      expect(emitSpy).not.toHaveBeenCalledWith(
        'maintenance.spare_part.threshold_crossed',
        expect.anything(),
      );
    });

    it('Test 3: emits severity=critical when stockout (quantityOnHand = 0)', async () => {
      mockGetOne.mockResolvedValueOnce({ ...basePart, quantityOnHand: 5, thresholdMin: 8, belowThreshold: false });

      await service.consume({ tenantId: 'tenant-1', workOrderId: 'wo-1', sparePartId: 'sp-1', quantity: 5 });

      expect(emitSpy).toHaveBeenCalledWith('maintenance.spare_part.threshold_crossed',
        expect.objectContaining({ severity: 'critical', quantityOnHand: 0 }),
      );
    });

    it('Test 4: no event when belowThreshold already true (edge-triggered guard)', async () => {
      mockGetOne.mockResolvedValueOnce({ ...basePart, quantityOnHand: 5, thresholdMin: 8, belowThreshold: true });

      await service.consume({ tenantId: 'tenant-1', workOrderId: 'wo-1', sparePartId: 'sp-1', quantity: 2 });

      expect(emitSpy).not.toHaveBeenCalledWith(
        'maintenance.spare_part.threshold_crossed',
        expect.anything(),
      );
    });
  });

  describe('restock()', () => {
    it('Test 5: recovers from below_threshold and emits threshold_recovered', async () => {
      mockGetOne.mockResolvedValueOnce({
        ...basePart,
        quantityOnHand: 2,
        thresholdMin: 5,
        belowThreshold: true,
      });

      await service.restock({ tenantId: 'tenant-1', sparePartId: 'sp-1', quantityAdded: 10 });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'sp-1' },
        { quantityOnHand: 12, belowThreshold: false },
      );
      expect(emitSpy).toHaveBeenCalledWith('maintenance.spare_part.threshold_recovered', {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sparePartId: 'sp-1',
        sku: 'SKU-001',
        quantityOnHand: 12,
      });
    });

    it('Test 6: restock while not below threshold — no recovery event', async () => {
      mockGetOne.mockResolvedValueOnce({ ...basePart, quantityOnHand: 20, thresholdMin: 5, belowThreshold: false });

      await service.restock({ tenantId: 'tenant-1', sparePartId: 'sp-1', quantityAdded: 5 });

      expect(emitSpy).not.toHaveBeenCalledWith(
        'maintenance.spare_part.threshold_recovered',
        expect.anything(),
      );
    });

    it('Test 7: throws BadRequestException when quantityAdded <= 0', async () => {
      await expect(
        service.restock({ tenantId: 'tenant-1', sparePartId: 'sp-1', quantityAdded: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.restock({ tenantId: 'tenant-1', sparePartId: 'sp-1', quantityAdded: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Test 8: no event emitted if transaction throws (part not found)', async () => {
      mockGetOne.mockResolvedValueOnce(null);

      await expect(
        service.restock({ tenantId: 'tenant-1', sparePartId: 'sp-missing', quantityAdded: 5 }),
      ).rejects.toThrow(BadRequestException);

      expect(emitSpy).not.toHaveBeenCalledWith(
        'maintenance.spare_part.threshold_recovered',
        expect.anything(),
      );
    });
  });
});
