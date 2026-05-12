// Mirror of `packages/shared-types/src/conflict-policy.ts`. Hand-kept in sync
// for now; a CI diff check (Pitfall #5) will gate divergence in a later plan.
// Source: D-11, D-12.

sealed class ConflictPolicy {
  const ConflictPolicy();

  String get strategy;
}

final class AppendOnlyEvent extends ConflictPolicy {
  const AppendOnlyEvent();
  @override
  String get strategy => 'append_only_event';
}

final class EventSourcedLedger extends ConflictPolicy {
  const EventSourcedLedger({required this.foldFn});
  final String foldFn;
  @override
  String get strategy => 'event_sourced_ledger';
}

final class PessimisticLock extends ConflictPolicy {
  const PessimisticLock({required this.lockTtlSec});
  final int lockTtlSec;
  @override
  String get strategy => 'pessimistic_lock';
}

final class LastWriteWins extends ConflictPolicy {
  const LastWriteWins();
  @override
  String get strategy => 'last_write_wins';
}

/// Phase-1 client-side registry — exactly the 2 entities mirrored from
/// the server's ConflictRegistry. Used by the upload pipeline to pick the
/// correct envelope shape per entity.
const Map<String, ConflictPolicy> kClientConflictRegistry = {
  'daily_activity_log': AppendOnlyEvent(),
  'user_preferences': LastWriteWins(),
};
