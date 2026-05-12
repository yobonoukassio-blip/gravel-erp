/**
 * Per-entity sync conflict policy registry — Source: D-11 (Phase 1 CONTEXT.md).
 *
 * Each business entity replicated by PowerSync declares one of four strategies:
 *   - append_only_event      : terrain captures (journal d'activité, incidents HSE, rotations, BL, ravitaillements)
 *   - event_sourced_ledger   : stockpile balance, fuel tank balance (derived from append-only events + fold)
 *   - pessimistic_lock       : tir/forage plans (exclusive lock for the editing window)
 *   - last_write_wins        : user preferences, low-criticality master data
 */

export type ConflictPolicy =
  | { strategy: 'append_only_event' }
  | { strategy: 'event_sourced_ledger'; foldFn: string }
  | { strategy: 'pessimistic_lock'; lockTtlSec: number }
  | { strategy: 'last_write_wins' };

export type ConflictStrategy = ConflictPolicy['strategy'];

export const CONFLICT_STRATEGIES: readonly ConflictStrategy[] = [
  'append_only_event',
  'event_sourced_ledger',
  'pessimistic_lock',
  'last_write_wins',
] as const;
