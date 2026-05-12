// Drift schema mirroring the Postgres tables in W2-P03 sync scope.
// Source: D-10, D-34. PITFALLS #5 — schema drift checked in CI (deferred).
//
// PowerSync uses `sqlite_async`/`drift_sqlite_async`; we keep both worlds
// happy by exposing the underlying SqliteDatabase to PowerSyncDatabase as
// well so the same on-disk file is shared.

import 'package:drift/drift.dart';
import 'package:drift_sqlite_async/drift_sqlite_async.dart';
import 'package:sqlite_async/sqlite_async.dart';

part 'database.g.dart';

/// Local mirror of the Postgres `daily_activity_log` table.
/// `sync_state` is local-only metadata for the UI (synced / pending / error).
@DataClassName('DailyActivityLogRow')
class DailyActivityLog extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text().named('tenant_id')();
  TextColumn get siteId => text().named('site_id')();
  TextColumn get shiftId => text().named('shift_id').nullable()();
  TextColumn get operationalDayId =>
      text().named('operational_day_id').nullable()();
  TextColumn get authorUserId => text().named('author_user_id')();
  DateTimeColumn get capturedAtLocal => dateTime().named('captured_at_local')();
  TextColumn get clientId => text().named('client_id')();
  IntColumn get clientSeq => integer().named('client_seq')();
  TextColumn get notes =>
      text().withLength(min: 0, max: 500)();
  TextColumn get photoSha256 => text().named('photo_sha256').nullable()();

  /// Local-only — one of `pending`, `synced`, `error`.
  /// Never serialized to the server.
  TextColumn get syncState =>
      text().named('sync_state').withDefault(const Constant('pending'))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Local mirror of the Postgres `user_preferences` table.
@DataClassName('UserPreferenceRow')
class UserPreferences extends Table {
  TextColumn get userId => text().named('user_id')();
  TextColumn get tenantId => text().named('tenant_id')();
  TextColumn get key => text()();
  TextColumn get value => text()(); // JSON-encoded
  TextColumn get clientId => text().named('client_id')();
  IntColumn get clientSeq => integer().named('client_seq')();
  DateTimeColumn get updatedAt => dateTime().named('updated_at')();

  @override
  Set<Column> get primaryKey => {userId, key};
}

@DriftDatabase(tables: [DailyActivityLog, UserPreferences])
class AppDatabase extends _$AppDatabase {
  /// Production constructor — wraps the PowerSync-managed SqliteDatabase.
  AppDatabase(SqliteDatabase db) : super(SqliteAsyncDriftConnection(db));

  /// Test/dev constructor — accepts any Drift QueryExecutor (e.g. NativeDatabase.memory()).
  AppDatabase.fromExecutor(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 1;

  /// All activity log rows ordered newest-captured first.
  Stream<List<DailyActivityLogRow>> watchActivityLog() {
    return (select(dailyActivityLog)
          ..orderBy([(t) => OrderingTerm.desc(t.capturedAtLocal)]))
        .watch();
  }

  Future<int> insertActivity(DailyActivityLogCompanion row) {
    return into(dailyActivityLog).insert(row);
  }

  Future<void> markSynced(String id) {
    return (update(dailyActivityLog)..where((t) => t.id.equals(id))).write(
      const DailyActivityLogCompanion(syncState: Value('synced')),
    );
  }

  Future<void> markError(String id) {
    return (update(dailyActivityLog)..where((t) => t.id.equals(id))).write(
      const DailyActivityLogCompanion(syncState: Value('error')),
    );
  }

  Future<int> nextClientSeq(String clientId) async {
    final row = await (selectOnly(dailyActivityLog)
          ..addColumns([dailyActivityLog.clientSeq.max()])
          ..where(dailyActivityLog.clientId.equals(clientId)))
        .getSingleOrNull();
    final current = row?.read(dailyActivityLog.clientSeq.max());
    return (current ?? 0) + 1;
  }
}
