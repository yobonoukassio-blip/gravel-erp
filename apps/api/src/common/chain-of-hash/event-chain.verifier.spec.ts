import { computeRowHash, GENESIS_PREV_HASH, verifyChain } from './event-chain.verifier';
import { randomUUID } from 'crypto';

/**
 * Unit tests for the generic event-chain verifier.
 *
 * The DB-backed integration variant lives in
 * `test/integration/event-chain.verifier.int-spec.ts` and seeds an actual
 * `stockpile_event` table. These pure-TS specs exercise the algorithm with
 * in-memory fixtures so they run in the `unit` Jest project.
 */

interface FixtureRow {
  id: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  canonical_payload: Buffer;
}

function makeChain(count: number): FixtureRow[] {
  const rows: FixtureRow[] = [];
  let prev = GENESIS_PREV_HASH;
  for (let i = 0; i < count; i += 1) {
    const id = randomUUID();
    const payload = Buffer.from(
      JSON.stringify({
        event_type: 'STOCKPILE_INFLOW',
        index: i,
        tonnage_delta_kg: 1000 + i,
      }),
      'utf8',
    );
    const rowHash = computeRowHash(prev, payload);
    rows.push({
      id,
      prev_hash: prev,
      row_hash: rowHash,
      canonical_payload: payload,
    });
    prev = rowHash;
  }
  return rows;
}

describe('EventChainVerifier (pure-TS, in-memory)', () => {
  describe('genesis handling', () => {
    it('treats empty chain as valid (eventsChecked = 0)', () => {
      const result = verifyChain([]);
      expect(result.valid).toBe(true);
      expect(result.eventsChecked).toBe(0);
    });

    it('rejects a chain whose first row has a non-zero prev_hash', () => {
      const rows = makeChain(1);
      rows[0].prev_hash = Buffer.alloc(32, 0xff);
      // re-derive row_hash so only the prev_hash is wrong (not the hash too)
      rows[0].row_hash = computeRowHash(rows[0].prev_hash, rows[0].canonical_payload);
      const result = verifyChain(rows);
      expect(result.valid).toBe(false);
      expect(result.brokenAt?.reason).toBe('genesis_non_zero_prev_hash');
    });
  });

  describe('valid chain', () => {
    it('accepts valid 100-event chain', () => {
      const rows = makeChain(100);
      const result = verifyChain(rows);
      expect(result.valid).toBe(true);
      expect(result.eventsChecked).toBe(100);
      expect(result.brokenAt).toBeUndefined();
    });
  });

  describe('corruption detection', () => {
    it('detects single-byte corruption in row_hash', () => {
      const rows = makeChain(100);
      // Flip exactly one bit in event[50].row_hash, then rebuild the
      // downstream prev_hash chain so the FIRST detected break is the
      // row_hash mismatch on event[50] (not a downstream prev_hash mismatch).
      const corrupted = Buffer.from(rows[50].row_hash);
      corrupted[0] = corrupted[0] ^ 0x01;
      rows[50].row_hash = corrupted;
      let prev = corrupted;
      for (let i = 51; i < rows.length; i += 1) {
        rows[i].prev_hash = prev;
        rows[i].row_hash = computeRowHash(prev, rows[i].canonical_payload);
        prev = rows[i].row_hash;
      }

      const result = verifyChain(rows);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBeDefined();
      expect(result.brokenAt?.id).toBe(rows[50].id);
      expect(result.brokenAt?.reason).toBe('row_hash_mismatch');
    });

    it('detects phantom event insertion between event[30] and event[31]', () => {
      const rows = makeChain(100);
      const phantom: FixtureRow = {
        id: randomUUID(),
        // Phantom's prev_hash matches event[30].row_hash (so it splices in
        // cleanly *at* the seam) but downstream rows still point to the
        // pre-phantom event[30].row_hash, which is event[31].prev_hash —
        // wait: event[31] still has the genuine pre-splice prev_hash, so
        // the detection happens at event[31] when its prev_hash !=
        // phantom.row_hash. That is exactly the contract we want.
        prev_hash: rows[30].row_hash,
        row_hash: Buffer.alloc(32, 0), // placeholder, recompute below
        canonical_payload: Buffer.from(JSON.stringify({ event_type: 'PHANTOM' }), 'utf8'),
      };
      phantom.row_hash = computeRowHash(phantom.prev_hash, phantom.canonical_payload);

      const tampered = [...rows.slice(0, 31), phantom, ...rows.slice(31)];

      const result = verifyChain(tampered);
      expect(result.valid).toBe(false);
      // The seam: event[31] (now at index 32) is the first row whose
      // stored prev_hash disagrees with the running expected hash
      // (phantom.row_hash).
      expect(result.brokenAt?.id).toBe(rows[31].id);
      expect(result.brokenAt?.reason).toBe('phantom_event_inserted');
    });
  });
});
