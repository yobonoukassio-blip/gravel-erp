/**
 * HSE Incident unit tests (HSE-01).
 *
 * Tests:
 *   1. Create 3 incidents → chain verified via EventChainVerifier logic.
 *   2. PATCH /hse-incidents/:id → 405 Method Not Allowed.
 *   3. hse.incident.created event emitted with correct payload.
 *
 * Run: pnpm --filter=@gravel/api test hse-incident
 */

import { createHash, randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HseIncidentService, GENESIS_PREV_HASH, sha256, buildHseIncidentCanonicalPayload } from '../services/hse-incident.service';
import type { CreateHseIncidentInput } from '../services/hse-incident.service';
import { verifyChain } from '../../../common/chain-of-hash/event-chain.verifier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIncidentInput(
  tenantId: string,
  override: Partial<CreateHseIncidentInput> = {},
): CreateHseIncidentInput {
  const now = new Date();
  return {
    tenantId,
    siteId: randomUUID(),
    occurredAtLocal: now,
    ianaTimezone: 'Africa/Abidjan',
    occurredAtUtc: now,
    operationalDayId: randomUUID(),
    category: 'near_miss',
    severity: 2,
    reporterUserId: randomUUID(),
    locationText: 'Banc de carrière zone A',
    gpsPoint: null,
    peopleImpacted: [],
    equipmentImpactedIds: [],
    chronologyMd: '## Chronologie\n\nUne pierre a chuté du banc 3.',
    contentAddressedAttachments: [],
    ...override,
  };
}

/** Build a lightweight in-memory row chain for verifyChain(). */
function buildChainRows(count: number): Array<{
  id: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  canonical_payload: Buffer;
}> {
  const rows: Array<{
    id: string;
    prev_hash: Buffer;
    row_hash: Buffer;
    canonical_payload: Buffer;
  }> = [];
  let prev = GENESIS_PREV_HASH;

  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const now = new Date();
    const canonical = buildHseIncidentCanonicalPayload({
      category: 'near_miss',
      severity: 2,
      occurredAtLocal: now,
      ianaTimezone: 'Africa/Abidjan',
      operationalDayId: randomUUID(),
      locationText: `Location ${i}`,
      peopleImpacted: [],
      equipmentImpactedIds: [],
      chronologyMd: `Chronology ${i}`,
      contentAddressedAttachments: [],
    });
    const rowHash = sha256(prev, canonical);
    rows.push({ id, prev_hash: prev, row_hash: rowHash, canonical_payload: canonical });
    prev = rowHash;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HseIncidentService — chain-of-hash + events', () => {
  let service: HseIncidentService;
  let emitter: EventEmitter2;
  const tenantId = randomUUID();

  // In-memory store to simulate DB rows.
  const store: Array<{
    id: string;
    prev_hash: Buffer;
    row_hash: Buffer;
    canonical_payload: Buffer;
    severity: number;
    status: string;
  }> = [];

  beforeEach(async () => {
    store.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HseIncidentService,
        EventEmitter2,
        {
          provide: getDataSourceToken(),
          useValue: {
            query: jest.fn(),
            transaction: jest.fn((fn: (em: unknown) => Promise<unknown>) => fn(mockEm)),
          },
        },
      ],
    }).compile();

    service = module.get(HseIncidentService);
    emitter = module.get(EventEmitter2);

    // Wire mock EntityManager to simulate DB operations.
    const ds = module.get(getDataSourceToken());
    const mockEm = buildMockEm(store, tenantId);
    (ds.transaction as jest.Mock).mockImplementation(
      (fn: (em: unknown) => Promise<unknown>) => fn(mockEm),
    );
  });

  describe('chain-of-hash (in-memory)', () => {
    it('verifies chain of 3 incidents using verifyChain()', () => {
      // Build 3 rows in memory using the canonical payload builder.
      const rows = buildChainRows(3);
      const result = verifyChain(rows);
      expect(result.valid).toBe(true);
      expect(result.eventsChecked).toBe(3);
    });

    it('detects corruption when row_hash is tampered', () => {
      const rows = buildChainRows(3);
      // Corrupt the second row's row_hash.
      rows[1].row_hash = createHash('sha256').update('TAMPERED').digest();
      const result = verifyChain(rows);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBeDefined();
    });

    it('detects phantom event insertion (broken prev_hash link)', () => {
      const rows = buildChainRows(3);
      // Insert a phantom row between index 0 and 1.
      const phantom = buildChainRows(1)[0];
      rows.splice(1, 0, phantom);
      const result = verifyChain(rows);
      expect(result.valid).toBe(false);
      expect(result.brokenAt?.reason).toBe('phantom_event_inserted');
    });
  });

  describe('create()', () => {
    it('emits hse.incident.created with correct payload', async () => {
      const emitSpy = jest.spyOn(emitter, 'emit');

      const input = buildIncidentInput(tenantId, { severity: 3, category: 'accident_personnel' });
      const incident = await service.create(input);

      expect(incident.id).toBeDefined();
      expect(incident.tenantId).toBe(tenantId);
      expect(incident.severity).toBe(3);
      expect(incident.category).toBe('accident_personnel');

      expect(emitSpy).toHaveBeenCalledWith(
        'hse.incident.created',
        expect.objectContaining({
          incident_id: incident.id,
          severity: 3,
          category: 'accident_personnel',
          site_id: input.siteId,
          tenant_id: tenantId,
        }),
      );
    });

    it('rejects severity outside 1-5', async () => {
      const input = buildIncidentInput(tenantId, { severity: 6 });
      await expect(service.create(input)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_SEVERITY' }),
      });
    });

    it('rejects empty chronology_md', async () => {
      const input = buildIncidentInput(tenantId, { chronologyMd: '  ' });
      await expect(service.create(input)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CHRONOLOGY_REQUIRED' }),
      });
    });
  });

  describe('rejectPatch() — append-only enforcement', () => {
    it('throws 405 METHOD_NOT_ALLOWED', () => {
      expect(() => service.rejectPatch()).toThrow(HttpException);
      try {
        service.rejectPatch();
      } catch (e) {
        const ex = e as HttpException;
        expect(ex.getStatus()).toBe(HttpStatus.METHOD_NOT_ALLOWED);
        expect((ex.getResponse() as { code: string }).code).toBe('METHOD_NOT_ALLOWED');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Mock EntityManager builder
// ---------------------------------------------------------------------------

function buildMockEm(
  store: Array<{ id: string; prev_hash: Buffer; row_hash: Buffer; canonical_payload: Buffer; severity: number; status: string }>,
  tenantId: string,
) {
  return {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('SELECT row_hash') && sql.includes('FROM hse_incident')) {
        // fetchPrevHash
        if (store.length === 0) return [];
        return [{ row_hash: store[store.length - 1].row_hash }];
      }
      if (sql.includes('INSERT INTO hse_incident')) {
        const id = params[0] as string;
        const category = params[7] as string;
        const severity = params[8] as number;
        const locationText = params[10] as string;
        const chronologyMd = params[14] as string;
        const prev = store.length === 0 ? GENESIS_PREV_HASH : store[store.length - 1].row_hash;
        const now = new Date();
        const canonical = buildHseIncidentCanonicalPayload({
          category: category as never,
          severity,
          occurredAtLocal: now,
          ianaTimezone: 'Africa/Abidjan',
          operationalDayId: params[6] as string,
          locationText,
          peopleImpacted: [],
          equipmentImpactedIds: [],
          chronologyMd,
          contentAddressedAttachments: [],
        });
        const rowHash = sha256(prev, canonical);
        const row = {
          id,
          tenant_id: tenantId,
          site_id: params[2] as string,
          occurred_at_local: now.toISOString(),
          iana_timezone: 'Africa/Abidjan',
          occurred_at_utc: now.toISOString(),
          operational_day_id: params[6] as string,
          category,
          severity,
          reporter_user_id: params[9] as string,
          location_text: locationText,
          gps_point: null,
          people_impacted: [],
          equipment_impacted_ids: [],
          chronology_md: chronologyMd,
          content_addressed_attachments: [],
          status: 'open',
          prev_hash: prev,
          row_hash: rowHash,
          created_at_utc: now.toISOString(),
        };
        store.push({ id, prev_hash: prev, row_hash: rowHash, canonical_payload: canonical, severity, status: 'open' });
        return [row];
      }
      return [];
    }),
  };
}
