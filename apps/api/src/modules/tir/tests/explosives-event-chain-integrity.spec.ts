import {
  GENESIS_PREV_HASH,
  verifyChain,
} from '../../../common/chain-of-hash/event-chain.verifier';
import {
  buildCanonicalPayload,
  sha256,
} from '../services/explosives-ledger.service';

/**
 * TIR-01 chain-integrity spec.
 *
 * Builds in-memory fixtures using the same hash function used at insert time,
 * then verifies them via the stateless `verifyChain` helper.
 * Mirrors the stockpile-event-chain-integrity pattern.
 */
describe('explosives_event chain-of-hash integrity (TIR-01)', () => {
  function makeChain(n: number) {
    const baseTs = Date.UTC(2026, 4, 1, 6, 0, 0); // 2026-05-01 06:00 UTC
    const rows: Array<{
      id: string;
      prev_hash: Buffer;
      row_hash: Buffer;
      canonical_payload: Buffer;
    }> = [];
    let prev = GENESIS_PREV_HASH;

    for (let i = 0; i < n; i++) {
      const payload = buildCanonicalPayload({
        eventType: 'EXPLOSIVES_IN',
        productType: 'ANFO',
        quantityG: (5000 + i).toString(),
        siteId: 'site-quarry-1',
        operationalDayId: 'od-2026-05-01',
        sourceReference: { doc_ref: `BL-${i}`, batch: `BATCH-${i}` },
        occurredAtUtc: new Date(baseTs + i * 3600_000),
      });
      const rowHash = sha256(prev, payload);
      rows.push({
        id: `expl-evt-${i}`,
        prev_hash: prev,
        row_hash: rowHash,
        canonical_payload: payload,
      });
      prev = rowHash;
    }

    return rows;
  }

  it('genesis prev_hash is 32 zero bytes', () => {
    expect(GENESIS_PREV_HASH.length).toBe(32);
    expect(GENESIS_PREV_HASH.every((b) => b === 0)).toBe(true);
  });

  it('returns valid=true on 100 well-formed events', () => {
    const rows = makeChain(100);
    const res = verifyChain(rows);
    expect(res.valid).toBe(true);
    expect(res.eventsChecked).toBe(100);
  });

  it('detects single-byte row_hash flip at row 50 (row_hash_mismatch)', () => {
    const rows = makeChain(100);
    const corrupted = Buffer.from(rows[50].row_hash);
    corrupted[0] = corrupted[0] ^ 0x01;
    rows[50] = { ...rows[50], row_hash: corrupted };

    const res = verifyChain(rows);
    expect(res.valid).toBe(false);
    expect(res.brokenAt?.id).toBe('expl-evt-50');
    expect(res.brokenAt?.reason).toBe('row_hash_mismatch');
  });

  it('detects phantom event splice (prev_hash mismatch on next row)', () => {
    const rows = makeChain(10);
    // Replace row 3's row_hash with zeros — row 4's prev_hash no longer matches
    const zeroed = Buffer.alloc(32, 0);
    rows[3] = { ...rows[3], row_hash: zeroed };

    const res = verifyChain(rows);
    expect(res.valid).toBe(false);
    expect(res.brokenAt?.id).toBe('expl-evt-4');
    expect(res.brokenAt?.reason).toBe('phantom_event_inserted');
  });

  it('pdf_sha256 is NOT part of canonical payload (chain remains valid when pdf is attached)', () => {
    // The canonical payload does not include pdf_sha256 — so when the async PDF
    // handler sets pdf_sha256 the chain remains valid. We verify here that the
    // payload builder does NOT include pdf_sha256.
    const payload = buildCanonicalPayload({
      eventType: 'EXPLOSIVES_IN',
      productType: 'EMULSION',
      quantityG: '10000',
      siteId: 'site-1',
      operationalDayId: 'od-1',
      sourceReference: {},
      occurredAtUtc: new Date('2026-05-01T10:00:00Z'),
    });
    const payloadStr = payload.toString('utf8');
    expect(payloadStr).not.toContain('pdf_sha256');
  });

  it('different product_types produce different canonical payloads', () => {
    const base = {
      eventType: 'EXPLOSIVES_IN' as const,
      quantityG: '1000',
      siteId: 'site-1',
      operationalDayId: 'od-1',
      sourceReference: {},
      occurredAtUtc: new Date('2026-05-01T10:00:00Z'),
    };
    const p1 = buildCanonicalPayload({ ...base, productType: 'ANFO' });
    const p2 = buildCanonicalPayload({ ...base, productType: 'EMULSION' });
    expect(p1.equals(p2)).toBe(false);
  });
});
