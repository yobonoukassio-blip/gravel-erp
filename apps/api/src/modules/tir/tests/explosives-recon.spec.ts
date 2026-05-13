import { ExplosivesReconciliationJob } from '../jobs/explosives-reconciliation.job';
import { ExplosivesReconciliationService } from '../services/explosives-reconciliation.service';

/**
 * TIR-07 explosives reconciliation spec.
 */
describe('ExplosivesReconciliationJob (TIR-07)', () => {
  let job: ExplosivesReconciliationJob;
  let mockReconService: {
    computeBalance: jest.Mock;
    getPhysicalCount: jest.Mock;
    computeGap: jest.Mock;
    recordPhysicalCount: jest.Mock;
  };
  let mockOperationalDayService: {
    blockClosure: jest.Mock;
    resolveClosure: jest.Mock;
  };
  let mockEvents: { emit: jest.Mock };

  const TENANT = 'tenant-ci';
  const SITE = 'site-q1';
  const DAY_ID = 'od-2026-05-13';

  beforeEach(() => {
    mockReconService = {
      computeBalance: jest.fn().mockResolvedValue({ ANFO: 100000, EMULSION: 50000 }),
      getPhysicalCount: jest.fn().mockResolvedValue({ ANFO: 100000, EMULSION: 50000 }),
      computeGap: jest.fn().mockReturnValue(0),
      recordPhysicalCount: jest.fn().mockResolvedValue(undefined),
    };
    mockOperationalDayService = {
      blockClosure: jest.fn().mockResolvedValue(undefined),
      resolveClosure: jest.fn().mockResolvedValue(undefined),
    };
    mockEvents = { emit: jest.fn() };
    job = new ExplosivesReconciliationJob(
      mockReconService as never,
      mockEvents as never,
      mockOperationalDayService,
    );
  });

  describe('reconcile', () => {
    it('calls blockClosure when gap > 50g', async () => {
      mockReconService.computeBalance.mockResolvedValue({ ANFO: 100000 });
      mockReconService.getPhysicalCount.mockResolvedValue({ ANFO: 99940 }); // 60g gap
      mockReconService.computeGap.mockReturnValue(60); // > TOLERANCE_G (50)

      const result = await job.reconcile({ tenantId: TENANT, siteId: SITE, operationalDayId: DAY_ID });

      expect(mockOperationalDayService.blockClosure).toHaveBeenCalledWith(
        DAY_ID,
        'EXPLOSIVES_RECONCILIATION_GAP',
      );
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'tir.reconciliation.gap_detected',
        expect.objectContaining({ siteId: SITE, gapG: 60 }),
      );
      expect(result.blocked).toBe(true);
    });

    it('does NOT call blockClosure when gap <= 50g', async () => {
      mockReconService.computeBalance.mockResolvedValue({ ANFO: 100000 });
      mockReconService.getPhysicalCount.mockResolvedValue({ ANFO: 99970 }); // 30g gap
      mockReconService.computeGap.mockReturnValue(30); // <= TOLERANCE_G (50)

      const result = await job.reconcile({ tenantId: TENANT, siteId: SITE, operationalDayId: DAY_ID });

      expect(mockOperationalDayService.blockClosure).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
      expect(result.blocked).toBe(false);
    });

    it('does NOT call blockClosure when gap equals exactly 50g', async () => {
      mockReconService.computeGap.mockReturnValue(50); // exactly tolerance — not blocked
      const result = await job.reconcile({ tenantId: TENANT, siteId: SITE, operationalDayId: DAY_ID });
      expect(mockOperationalDayService.blockClosure).not.toHaveBeenCalled();
      expect(result.blocked).toBe(false);
    });

    it('blocks when gap is 51g (1g over tolerance)', async () => {
      mockReconService.computeGap.mockReturnValue(51);
      const result = await job.reconcile({ tenantId: TENANT, siteId: SITE, operationalDayId: DAY_ID });
      expect(mockOperationalDayService.blockClosure).toHaveBeenCalledWith(
        DAY_ID,
        'EXPLOSIVES_RECONCILIATION_GAP',
      );
      expect(result.blocked).toBe(true);
    });
  });

  describe('resolveGap', () => {
    it('calls resolveClosure when physical count is submitted', async () => {
      await job.resolveGap(DAY_ID);
      expect(mockOperationalDayService.resolveClosure).toHaveBeenCalledWith(
        DAY_ID,
        'EXPLOSIVES_RECONCILIATION_GAP',
      );
    });
  });
});

describe('ExplosivesReconciliationService.computeBalance (TIR-07)', () => {
  let service: ExplosivesReconciliationService;
  let mockDs: { query: jest.Mock };

  const TENANT = 'tenant-ci';
  const SITE = 'site-q1';
  const DAY_ID = 'od-2026-05-13';

  beforeEach(() => {
    mockDs = { query: jest.fn() };
    service = new ExplosivesReconciliationService(mockDs as never);
  });

  it('returns correct sum per product_type from mock events', async () => {
    mockDs.query.mockResolvedValueOnce([
      { product_type: 'ANFO', total_g: '50000' },
      { product_type: 'EMULSION', total_g: '-10000' },
    ]);
    const balance = await service.computeBalance(SITE, DAY_ID, TENANT);
    expect(balance['ANFO']).toBe(50000);
    expect(balance['EMULSION']).toBe(-10000);
  });

  it('returns empty map when no events exist', async () => {
    mockDs.query.mockResolvedValueOnce([]);
    const balance = await service.computeBalance(SITE, DAY_ID, TENANT);
    expect(Object.keys(balance)).toHaveLength(0);
  });

  it('computeGap handles missing keys between ledger and physical', () => {
    const ledger = { ANFO: 100000 };
    const physical = { ANFO: 99950, EMULSION: 0 }; // EMULSION not in ledger
    const gap = service.computeGap(ledger, physical);
    // |100000 - 99950| + |0 - 0| = 50
    expect(gap).toBe(50);
  });
});
