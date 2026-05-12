// Repository for the daily activity log feature. Source: D-10, D-34.
//
// D-14 invariant: this repository does NOT compute any ordering field. The
// only DateTime it writes is `captured_at_local` — operator wall-clock, used
// purely for display. The server stamps `sequence` and `server_received_at`.

import 'dart:async';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/database.dart';

class NewActivityLogInput {
  const NewActivityLogInput({
    required this.tenantId,
    required this.siteId,
    required this.authorUserId,
    required this.capturedAtLocal,
    required this.notes,
    this.shiftId,
    this.operationalDayId,
    this.photoSha256,
  });

  final String tenantId;
  final String siteId;
  final String authorUserId;
  final DateTime capturedAtLocal;
  final String notes;
  final String? shiftId;
  final String? operationalDayId;
  final String? photoSha256;
}

abstract class IdGenerator {
  String newUuid();
}

class ActivityLogRepository {
  ActivityLogRepository({
    required this.db,
    required this.clientId,
    required this.idGen,
  });

  final AppDatabase db;
  final String clientId;
  final IdGenerator idGen;

  /// Inserts a new pending row. Returns the freshly-allocated id.
  Future<String> insert(NewActivityLogInput input) async {
    if (input.notes.length > 500) {
      throw ArgumentError.value(
        input.notes.length,
        'notes.length',
        'must be <= 500',
      );
    }
    final id = idGen.newUuid();
    final seq = await db.nextClientSeq(clientId);
    await db.insertActivity(DailyActivityLogCompanion(
      id: Value(id),
      tenantId: Value(input.tenantId),
      siteId: Value(input.siteId),
      shiftId: Value(input.shiftId),
      operationalDayId: Value(input.operationalDayId),
      authorUserId: Value(input.authorUserId),
      capturedAtLocal: Value(input.capturedAtLocal),
      clientId: Value(clientId),
      clientSeq: Value(seq),
      notes: Value(input.notes),
      photoSha256: Value(input.photoSha256),
      syncState: const Value('pending'),
    ));
    return id;
  }

  Stream<List<DailyActivityLogRow>> watchAll() => db.watchActivityLog();

  Future<void> markSynced(String id) => db.markSynced(id);
  Future<void> markError(String id) => db.markError(id);
}

/// Riverpod hook — concrete wiring is done at `main.dart` startup.
final activityLogRepositoryProvider = Provider<ActivityLogRepository>((ref) {
  throw UnimplementedError(
    'activityLogRepositoryProvider must be overridden at app composition root',
  );
});
