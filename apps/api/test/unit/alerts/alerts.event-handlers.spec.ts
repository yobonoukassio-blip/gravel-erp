import { Test, TestingModule } from '@nestjs/testing';
import { AlertsEventHandlers } from '../../../src/modules/alerts/alerts.event-handlers';
import { AlertsService } from '../../../src/modules/alerts/alerts.service';

/**
 * Unit tests for AlertsEventHandlers Phase 8 spare-part subscribers
 * (ALT-02 — 08-W1-P02 T02). Tests 1-6 from the plan's behavior spec.
 *
 * The handler applies the canonical Phase-8 severity boundary mapping:
 *   payload 'warning'  -> Alert.severity 'high'
 *   payload 'critical' -> Alert.severity 'critical'
 */
describe('AlertsEventHandlers — spare-part threshold (Phase 8 ALT-02)', () => {
  let handler: AlertsEventHandlers;
  let mockCreateFromEvent: jest.Mock;
  let mockResolveByDedupeKey: jest.Mock;

  beforeEach(async () => {
    mockCreateFromEvent = jest.fn().mockResolvedValue({ id: 'alert-1', status: 'open' });
    mockResolveByDedupeKey = jest.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsEventHandlers,
        {
          provide: AlertsService,
          useValue: {
            createFromEvent: mockCreateFromEvent,
            resolveByDedupeKey: mockResolveByDedupeKey,
          },
        },
      ],
    }).compile();

    handler = module.get(AlertsEventHandlers);
  });

  describe('onSparePartThresholdCrossed — warning -> high boundary mapping', () => {
    it('Test 1: payload severity=warning creates Alert with severity=high', async () => {
      await handler.onSparePartThresholdCrossed({
        tenantId: 'T',
        siteId: 'S',
        sparePartId: 'SP',
        sku: 'SKU-001',
        quantityOnHand: 3,
        thresholdMin: 5,
        severity: 'warning',
      });

      expect(mockCreateFromEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateFromEvent).toHaveBeenCalledWith({
        tenantId: 'T',
        siteId: 'S',
        sourceEventType: 'maintenance.spare_part.threshold_crossed',
        sourceEventId: null,
        dedupeKey: 'spare_part:SP:below_threshold',
        severity: 'high',
        payload: {
          site_id: 'S',
          spare_part_id: 'SP',
          sku: 'SKU-001',
          quantity_on_hand: 3,
          threshold_min: 5,
        },
      });
    });

    it('Test 2: duplicate call with same dedupe_key — handler always calls createFromEvent (service handles dedupe)', async () => {
      await handler.onSparePartThresholdCrossed({
        tenantId: 'T',
        siteId: 'S',
        sparePartId: 'SP',
        sku: 'SKU-001',
        quantityOnHand: 3,
        thresholdMin: 5,
        severity: 'warning',
      });

      await handler.onSparePartThresholdCrossed({
        tenantId: 'T',
        siteId: 'S',
        sparePartId: 'SP',
        sku: 'SKU-001',
        quantityOnHand: 2,
        thresholdMin: 5,
        severity: 'warning',
      });

      expect(mockCreateFromEvent).toHaveBeenCalledTimes(2);
      expect(mockCreateFromEvent.mock.calls[0][0].dedupeKey).toBe('spare_part:SP:below_threshold');
      expect(mockCreateFromEvent.mock.calls[1][0].dedupeKey).toBe('spare_part:SP:below_threshold');
    });

    it('Test 6: payload severity=critical maps to Alert severity=critical', async () => {
      await handler.onSparePartThresholdCrossed({
        tenantId: 'T',
        siteId: 'S',
        sparePartId: 'SP',
        quantityOnHand: 0,
        thresholdMin: 5,
        severity: 'critical',
      });

      expect(mockCreateFromEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
      );
    });
  });

  describe('onSparePartThresholdRecovered', () => {
    it('Test 3: resolves the matching OPEN Alert by dedupe key', async () => {
      mockResolveByDedupeKey.mockResolvedValueOnce({
        id: 'alert-1',
        status: 'resolved',
        resolvedAtUtc: new Date(),
      });

      await handler.onSparePartThresholdRecovered({
        tenantId: 'T',
        sparePartId: 'SP',
      });

      expect(mockResolveByDedupeKey).toHaveBeenCalledTimes(1);
      expect(mockResolveByDedupeKey).toHaveBeenCalledWith('T', 'spare_part:SP:below_threshold');
    });

    it('Test 4: no-op when no OPEN alert exists — resolveByDedupeKey returns null', async () => {
      mockResolveByDedupeKey.mockResolvedValueOnce(null);

      await handler.onSparePartThresholdRecovered({
        tenantId: 'T',
        sparePartId: 'SP-NONE',
      });

      expect(mockResolveByDedupeKey).toHaveBeenCalledWith('T', 'spare_part:SP-NONE:below_threshold');
    });

    it('Test 5: resolveByDedupeKey is invoked with the event tenantId (RLS scoping at the service layer)', async () => {
      await handler.onSparePartThresholdRecovered({
        tenantId: 'tenant-A',
        sparePartId: 'SP',
      });

      expect(mockResolveByDedupeKey).toHaveBeenCalledWith(
        'tenant-A',
        'spare_part:SP:below_threshold',
      );
    });
  });
});
