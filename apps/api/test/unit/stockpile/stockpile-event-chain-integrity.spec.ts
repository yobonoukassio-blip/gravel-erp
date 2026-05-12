import {
  GENESIS_PREV_HASH,
  verifyChain,
} from '../../../src/common/chain-of-hash/event-chain.verifier';
import {
  buildCanonicalPayload,
  sha256,
} from '../../../src/modules/stockpile/services/stockpile-event.service';

/**
 * STK-01 chain-integrity spec.
 *
 * Builds 100 valid stockpile_event rows in-memory using the same hash function
 * the service uses at insert time, runs them through the generic
 * `verifyChain` pure helper, then corrupts one byte and re-verifies.
 *
 * Note: the production `EventChainVerifier.verifyChain` reconstructs the
 * canonical_payload by re-running the per-table SQL against Postgres
 * (`CANONICAL_PAYLOAD_SQL.stockpile_event`). Here we mirror the exact same
 * JSON shape on the Node side via `buildCanonicalPayload`. Integration tests
 * (CI with a real DB) exercise the DB-side path end-to-end.
 */
describe('stockpile_event chain-of-hash integrity (STK-01)', () => {
  function makeChain(n: number) {
    const baseTs = Date.UTC(2026, 5, 1, 10, 0, 0);
    const rows: Array<{
      id: string;
      prev_hash: Buffer;
      row_hash: Buffer;
      canonical_payload: Buffer;
    }> = [];
    let prev = GENESIS_PREV_HASH;
    for (let i = 0; i < n; i++) {
      const payload = buildCanonicalPayload({
        eventType: 'STOCKPILE_INFLOW',
        stockpileId: 'sp-1',
        tonnageDeltaKg: BigInt(1000 + i),
        materialType: 'granite_brut',
        calibreCode: '0-31_5',
        operationalDayId: 'od-1',
        sourceReference: { rotation_id: `r-${i}` },
        occurredAtUtc: new Date(baseTs + i * 60_000),
      });
      const rowHash = sha256(prev, payload);
      rows.push({
        id: `evt-${i}`,
        prev_hash: prev,
        row_hash: rowHash,
        canonical_payload: payload,
      });
      prev = rowHash;
    }
    return rows;
  }

  it('returns valid=true on 100 well-formed events', () => {
    const rows = makeChain(100);
    const res = verifyChain(rows);
    expect(res.valid).toBe(true);
    expect(res.eventsChecked).toBe(100);
  });

  it('returns valid=false with brokenAt when a single byte is injected at row 50', () => {
    const rows = makeChain(100);
    // Inject a single-byte corruption into row 50's row_hash.
    const corrupted = Buffer.from(rows[50].row_hash);
    corrupted[0] = corrupted[0] ^ 0x01;
    rows[50] = { ...rows[50], row_hash: corrupted };

    const res = verifyChain(rows);
    expect(res.valid).toBe(false);
    // The verifier walks in order; the row whose row_hash was tampered fails
    // the hash check on itself (row_hash_mismatch).
    expect(res.brokenAt?.id).toBe('evt-50');
    expect(res.brokenAt?.reason).toBe('row_hash_mismatch');
  });

  it('returns valid=false at row N+1 when row N row_hash is replaced (link broken downstream)', () => {
    const rows = makeChain(10);
    // Replace row 3's row_hash with zeros — row 4's prev_hash no longer matches.
    rows[3] = { ...rows[3], row_hash: Buffer.alloc(32, 0) };
    const res = verifyChain(rows);
    expect(res.valid).toBe(false);
    // First failure is the row_hash check on row 3 itself.
    expect(res.brokenAt?.id).toBe('evt-3');
  });
});
