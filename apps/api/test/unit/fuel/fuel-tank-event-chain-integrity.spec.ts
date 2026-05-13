import {
  buildFuelCanonicalPayload,
  GENESIS_PREV_HASH,
  sha256Fuel,
} from '../../../src/modules/fuel/services/fuel-tank-event.service';
import {
  ChainVerifyResult,
  GENESIS_PREV_HASH as VERIFIER_GENESIS,
  verifyChain,
} from '../../../src/common/chain-of-hash/event-chain.verifier';

/**
 * fuel_tank_event chain integrity spec (CAR-01).
 *
 * Uses the stateless `verifyChain()` export from event-chain.verifier.ts
 * to test integrity of in-memory event fixtures.
 *
 * Covers:
 *   - 100 events: verifier returns valid=true
 *   - Injected corruption: verifier returns valid=false, brokenAt set
 */

interface ChainFixtureRow {
  id: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  canonical_payload: Buffer;
}

function buildFixture(count: number): ChainFixtureRow[] {
  const rows: ChainFixtureRow[] = [];
  let prev = GENESIS_PREV_HASH;

  for (let i = 0; i < count; i++) {
    const payload = buildFuelCanonicalPayload({
      eventType: 'FUEL_DELIVERY_IN',
      tankId: 'tank-1',
      litersDelta: 100 + i,
      operationalDayId: `od-${i}`,
      sourceReference: { idx: i },
      occurredAtUtc: new Date(Date.UTC(2026, 5, 1, 10, i, 0)),
      costPerLiterMinorUnits: 75000n,
      currency: 'XOF',
    });
    const rowHash = sha256Fuel(prev, payload);
    rows.push({
      id: `event-${i}`,
      prev_hash: prev,
      row_hash: rowHash,
      canonical_payload: payload,
    });
    prev = rowHash;
  }
  return rows;
}

describe('fuel_tank_event chain integrity (CAR-01)', () => {
  it('verifyChain returns valid=true for 100 correctly-chained events', () => {
    const rows = buildFixture(100);
    const result: ChainVerifyResult = verifyChain(rows);
    expect(result.valid).toBe(true);
    expect(result.eventsChecked).toBe(100);
  });

  it('detects corruption: row_hash tampered → valid=false', () => {
    const rows = buildFixture(100);
    // Corrupt row 49's row_hash
    const corrupted = rows.map((r, i) => {
      if (i !== 49) return r;
      return {
        ...r,
        row_hash: Buffer.alloc(32, 0xff), // tampered
      };
    });
    // verifyChain recomputes row_hash and detects the tamper at row 49 itself.
    const result: ChainVerifyResult = verifyChain(corrupted);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
    expect(result.brokenAt!.id).toBe('event-49');
    expect(result.brokenAt!.reason).toBe('row_hash_mismatch');
  });

  it('detects corruption: canonical_payload tampered → valid=false', () => {
    const rows = buildFixture(100);
    const corrupted = rows.map((r, i) => {
      if (i !== 30) return r;
      return {
        ...r,
        canonical_payload: Buffer.from('corrupted_data', 'utf8'),
      };
    });
    const result: ChainVerifyResult = verifyChain(corrupted);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
    expect(result.brokenAt!.id).toBe('event-30');
    expect(result.brokenAt!.reason).toBe('row_hash_mismatch');
  });

  it('detects phantom event injected mid-chain → valid=false', () => {
    const rows = buildFixture(10);
    // Insert a phantom row between index 4 and 5 — its prev_hash is wrong
    const phantomPayload = Buffer.from('phantom', 'utf8');
    const phantomPrevHash = Buffer.alloc(32, 0xaa); // does not match rows[4].row_hash
    const phantomRowHash = sha256Fuel(phantomPrevHash, phantomPayload);
    const withPhantom = [
      ...rows.slice(0, 5),
      { id: 'phantom-1', prev_hash: phantomPrevHash, row_hash: phantomRowHash, canonical_payload: phantomPayload },
      ...rows.slice(5),
    ];
    const result: ChainVerifyResult = verifyChain(withPhantom);
    expect(result.valid).toBe(false);
    expect(result.brokenAt!.id).toBe('phantom-1');
    expect(result.brokenAt!.reason).toBe('phantom_event_inserted');
  });

  it('genesis check: first event with non-zero prev_hash → valid=false', () => {
    const rows = buildFixture(5);
    const corrupted = rows.map((r, i) => {
      if (i !== 0) return r;
      return { ...r, prev_hash: Buffer.alloc(32, 0x01) };
    });
    const result: ChainVerifyResult = verifyChain(corrupted);
    expect(result.valid).toBe(false);
    expect(result.brokenAt!.id).toBe('event-0');
    expect(result.brokenAt!.reason).toBe('genesis_non_zero_prev_hash');
  });

  it('GENESIS_PREV_HASH matches verifier sentinel', () => {
    expect(GENESIS_PREV_HASH.equals(VERIFIER_GENESIS)).toBe(true);
  });
});
