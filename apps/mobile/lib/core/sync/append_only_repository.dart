/// Append-only local repository for Phase 2 entities synced via
/// PowerSync on the `append_only_event` strategy (D-11).
///
/// Entities extending this contract:
/// - DrilledHole (D2-11)
/// - ExtractionCycle (D2-20)
/// - TruckRotation (D2-30)
/// - WeighingTicket (D2-31)
/// - EquipmentRefuel (D2-51)
/// - HseIncident (D2-60)
///
/// Contract:
///   - Insert only. No update / delete on local Drift rows.
///   - Client-side UUID generated at insert time (server preserves it).
///   - `created_at_local` + IANA TZ captured from device clock.
///   - `pending_sync = true` until PowerSync upstream ACKs the row.
///   - "Corrections" land as NEW rows carrying a `corrects_id` FK to the
///     original (see D2-11 — DRILLED_HOLE_CORRECTED).
library gravel.mobile.core.sync.append_only_repository;

import 'package:uuid/uuid.dart';

abstract class SyncEntity {
  String get id;
  String get tenantId;
  bool get pendingSync;
  DateTime get createdAtLocal;
  String get ianaTimezone;
}

abstract class AppendOnlyRepository<T extends SyncEntity> {
  static const _uuid = Uuid();

  /// Build a fresh client-side UUID. Hex form, lowercased — matches the
  /// server's `uuid_generate_v4()` shape so server-side joins work.
  String newId() => _uuid.v4();

  /// Subclasses provide their own Drift table mapping. This base method
  /// enforces the append-only invariant: callers can only `appendLocal`,
  /// never `update` or `delete`.
  Future<void> appendLocal(T entity);

  /// Convenience: returns whatever entities are not yet synced. Used by
  /// the debug "pending sync drawer" surface in the mobile shell.
  Future<List<T>> listPendingSync();

  /// Reads. Subclasses implement against their Drift queries.
  Future<T?> findById(String id);
  Future<List<T>> listForOperationalDay(String operationalDayId);
}
