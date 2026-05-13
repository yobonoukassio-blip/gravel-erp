/**
 * HSE Incident chain-integrity unit tests (HSE-01).
 *
 * Verifies the chain-of-hash for 100 incidents using verifyChain()
 * (stateless function from EventChainVerifier — no DB required).
 *
 * Run: pnpm --filter=@gravel/api test hse-incident-chain-integrity
 */

import { createHash, randomUUID } from 'crypto';
import { GENESIS_PREV_HASH, sha256, buildHseIncidentCanonicalPayload } from '../services/hse-incident.service';
import { verifyChain } from '../../../../common/chain-of-hash/event-chain.verifier';

type ChainRow = {
  id: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  canonical_payload: Buffer;
};

function buildHseChain(count: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev = GENESIS_PREV_HASH;

  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const now = new Date(Date.now() + i * 60_000); // spread over time
    const canonical = buildHseIncidentCanonicalPayload({
      category: i % 2 === 0 ? 'near_miss' : 'accident_personnel',
      severity: (i % 5) + 1,
      occurredAtLocal: now,
      ianaTimezone: 'Africa/Abidjan',
      operationalDayId: randomUUID(),
      locationText: `Site A — Banc ${i + 1}`,
      peopleImpacted:
        i % 3 === 0
          ? [{ lost_time_h: 0, name: `Worker ${i}`, injury_type: 'minor_cut', body_part: 'hand' }]
          : [],
      equipmentImpactedIds: i % 4 === 0 ? [randomUUID()] : [],
      chronologyMd: `## Chronologie incident ${i}\n\nDétails de l'incident numéro ${i}.`,
      contentAddressedAttachments: [],
    });
    const rowHash = sha256(prev, canonical);
    rows.push({ id, prev_hash: prev, row_hash: rowHash, canonical_payload: canonical });
    prev = rowHash;
  }

  return rows;
}

describe('EventChainVerifier — hse_incident chain integrity', () => {
  it('verifies a chain of 100 incidents as valid', () => {
    const rows = buildHseChain(100);
    const result = verifyChain(rows);

    expect(result.valid).toBe(true);
    expect(result.eventsChecked).toBe(100);
    expect(result.brokenAt).toBeUndefined();
  });

  it('detects row_hash corruption at position 50', () => {
    const rows = buildHseChain(100);
    // Corrupt the row_hash of incident at position 50.
    rows[50].row_hash = createHash('sha256').update('CORRUPTED_PAYLOAD').digest();

    const result = verifyChain(rows);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
    // The verifier should detect the corruption at row 50 or 51
    // (row 50 has wrong row_hash, so row 51 will have prev_hash mismatch).
    const brokenIdx = rows.findIndex((r) => r.id === result.brokenAt?.id);
    expect(brokenIdx).toBeGreaterThanOrEqual(50);
    expect(brokenIdx).toBeLessThanOrEqual(51);
  });

  it('detects phantom event insertion (breaks prev_hash link)', () => {
    const rows = buildHseChain(100);
    // Build a phantom event with GENESIS prev_hash (breaks the chain).
    const phantomCanonical = buildHseIncidentCanonicalPayload({
      category: 'securite',
      severity: 1,
      occurredAtLocal: new Date(),
      ianaTimezone: 'Africa/Abidjan',
      operationalDayId: randomUUID(),
      locationText: 'PHANTOM',
      peopleImpacted: [],
      equipmentImpactedIds: [],
      chronologyMd: 'PHANTOM INSERTION',
      contentAddressedAttachments: [],
    });
    const phantomHash = sha256(GENESIS_PREV_HASH, phantomCanonical);
    const phantom: ChainRow = {
      id: randomUUID(),
      prev_hash: GENESIS_PREV_HASH,
      row_hash: phantomHash,
      canonical_payload: phantomCanonical,
    };

    // Insert phantom at position 25.
    rows.splice(25, 0, phantom);

    const result = verifyChain(rows);
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.reason).toBe('phantom_event_inserted');
  });

  it('detects genesis violation (first row has non-zero prev_hash)', () => {
    const rows = buildHseChain(5);
    // Force the first row to have a non-zero prev_hash.
    rows[0].prev_hash = Buffer.alloc(32, 0xff);

    const result = verifyChain(rows);
    expect(result.valid).toBe(false);
    expect(result.brokenAt?.reason).toBe('genesis_non_zero_prev_hash');
  });

  it('returns valid for empty chain (no incidents yet)', () => {
    const result = verifyChain([]);
    expect(result.valid).toBe(true);
    expect(result.eventsChecked).toBe(0);
  });
});
