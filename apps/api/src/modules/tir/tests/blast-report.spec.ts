import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import {
  BLAST_REPORT_GENESIS_HASH,
  BlastReportService,
  buildBlastReportCanonicalPayload,
  sha256BlastReport,
} from '../services/blast-report.service';
import { verifyChain } from '../../../common/chain-of-hash/event-chain.verifier';

/**
 * TIR-06 blast report spec.
 */
describe('BlastReportService (TIR-06)', () => {
  let service: BlastReportService;
  let mockDs: { query: jest.Mock; transaction: jest.Mock };
  let mockBlastPlanService: { findById: jest.Mock };

  const TENANT = 'tenant-ci';
  const SITE = 'site-q1';
  const PLAN_ID = 'plan-fired-001';
  const REPORTER = 'reporter-001';

  function makeFiredPlan() {
    return { id: PLAN_ID, status: 'FIRED', tenantId: TENANT };
  }

  function makeReportRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    const prevHash = Buffer.alloc(32, 0);
    const payload = buildBlastReportCanonicalPayload({
      blastPlanId: PLAN_ID,
      fragmentationObs: 'Good fragmentation, uniform distribution',
      vibrationMmS: '2.50',
      incidentIds: [],
      occurredAtUtc: new Date('2026-05-13T14:00:00Z'),
    });
    const rowHash = sha256BlastReport(prevHash, payload);
    return {
      id: 'report-001',
      occurred_at_utc: new Date('2026-05-13T14:00:00Z').toISOString(),
      tenant_id: TENANT,
      site_id: SITE,
      blast_plan_id: PLAN_ID,
      fragmentation_obs: 'Good fragmentation, uniform distribution',
      vibration_mm_s: '2.50',
      incident_ids: '{}',
      reporter_id: REPORTER,
      notes_md: null,
      prev_hash: prevHash,
      row_hash: rowHash,
      created_at_utc: new Date().toISOString(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockBlastPlanService = { findById: jest.fn().mockResolvedValue(makeFiredPlan()) };
    mockDs = {
      query: jest.fn(),
      transaction: jest.fn((cb: (em: unknown) => Promise<unknown>) => {
        const em = { query: jest.fn() };
        // prev hash (empty chain)
        em.query.mockResolvedValueOnce([]); // no prev rows
        em.query.mockResolvedValueOnce([makeReportRow()]); // INSERT RETURNING
        em.query.mockResolvedValueOnce([]); // UPDATE blast_plan status
        return cb(em);
      }),
    };
    service = new BlastReportService(mockDs as never, mockBlastPlanService as never);
  });

  describe('append', () => {
    it('appends a blast report when plan is FIRED', async () => {
      const report = await service.append({
        tenantId: TENANT,
        siteId: SITE,
        blastPlanId: PLAN_ID,
        fragmentationObs: 'Good fragmentation, uniform distribution',
        vibrationMmS: 2.5,
        reporterId: REPORTER,
      });
      expect(report.blastPlanId).toBe(PLAN_ID);
      expect(report.fragmentationObs).toBeTruthy();
    });

    it('throws ERR_PLAN_NOT_FIRED when plan is not FIRED', async () => {
      mockBlastPlanService.findById.mockResolvedValue({ id: PLAN_ID, status: 'LOADED', tenantId: TENANT });
      await expect(
        service.append({
          tenantId: TENANT,
          siteId: SITE,
          blastPlanId: PLAN_ID,
          fragmentationObs: 'obs',
          reporterId: REPORTER,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ERR_INCIDENT_NOT_FOUND for invalid incident UUIDs', async () => {
      // incident_ids validation queries hse_incident
      mockDs.query.mockResolvedValueOnce([]); // no incidents found
      await expect(
        service.append({
          tenantId: TENANT,
          siteId: SITE,
          blastPlanId: PLAN_ID,
          fragmentationObs: 'obs',
          incidentIds: ['invalid-uuid-001'],
          reporterId: REPORTER,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('chain integrity (10-report chain)', () => {
    it('builds a 10-report chain and verifies integrity', () => {
      const rows: Array<{
        id: string;
        prev_hash: Buffer;
        row_hash: Buffer;
        canonical_payload: Buffer;
      }> = [];
      let prev = BLAST_REPORT_GENESIS_HASH;

      for (let i = 0; i < 10; i++) {
        const payload = buildBlastReportCanonicalPayload({
          blastPlanId: `plan-${i}`,
          fragmentationObs: `Good fragmentation ${i}`,
          vibrationMmS: `${i + 1}.00`,
          incidentIds: [],
          occurredAtUtc: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T14:00:00Z`),
        });
        const rowHash = sha256BlastReport(prev, payload);
        rows.push({ id: `report-${i}`, prev_hash: prev, row_hash: rowHash, canonical_payload: payload });
        prev = rowHash;
      }

      const res = verifyChain(rows);
      expect(res.valid).toBe(true);
      expect(res.eventsChecked).toBe(10);
    });

    it('detects single-byte row_hash flip at row 5', () => {
      const rows: Array<{
        id: string;
        prev_hash: Buffer;
        row_hash: Buffer;
        canonical_payload: Buffer;
      }> = [];
      let prev = BLAST_REPORT_GENESIS_HASH;
      for (let i = 0; i < 10; i++) {
        const payload = buildBlastReportCanonicalPayload({
          blastPlanId: `plan-${i}`,
          fragmentationObs: `obs ${i}`,
          vibrationMmS: null,
          incidentIds: [],
          occurredAtUtc: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
        });
        const rowHash = sha256BlastReport(prev, payload);
        rows.push({ id: `report-${i}`, prev_hash: prev, row_hash: rowHash, canonical_payload: payload });
        prev = rowHash;
      }

      // Corrupt row 5
      const corrupted = Buffer.from(rows[5].row_hash);
      corrupted[0] = corrupted[0] ^ 0x01;
      rows[5] = { ...rows[5], row_hash: corrupted };

      const res = verifyChain(rows);
      expect(res.valid).toBe(false);
      expect(res.brokenAt?.id).toBe('report-5');
      expect(res.brokenAt?.reason).toBe('row_hash_mismatch');
    });
  });
});
