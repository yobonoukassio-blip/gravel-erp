/**
 * REQ: FND-11 — Sync conflict policy framework (append_only_event, event_sourced_ledger,
 *               pessimistic_lock, last_write_wins) — chaos harness.
 * Source: D-10, D-11, D-12, D-13, D-14.
 * Implementing plan: W1-P03 (sync engine + ConflictRegistry + chaos harness).
 *
 * Wave 0 RED. BLOCKING tier per D-13.
 */
import type { ConflictPolicy } from '@gravel/shared-types';

describe('FND-11: Sync conflict resolution chaos harness', () => {
  it('ConflictPolicy union exposes 4 strategies', () => {
    const sample: ConflictPolicy[] = [
      { strategy: 'append_only_event' },
      { strategy: 'event_sourced_ledger', foldFn: 'stockpile_balance_v1' },
      { strategy: 'pessimistic_lock', lockTtlSec: 300 },
      { strategy: 'last_write_wins' },
    ];
    expect(sample).toHaveLength(4);
  });

  it('append_only_event: 2 offline clients edit same daily_activity_log entity — no loss, no duplicate', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P03 (sync chaos harness)');
  });

  it('last_write_wins: preference conflict resolves to last write per server-side Lamport order (NEVER device.now per D-14)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P03');
  });

  it('pessimistic_lock: second editor receives 409 with lock holder identity', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P03');
  });

  it('event_sourced_ledger: fold function applied deterministically across replicas', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P03');
  });

  it('no event uses device.now() for ordering (D-14 — Lamport clock or server_received_at + sequence)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P03');
  });
});
