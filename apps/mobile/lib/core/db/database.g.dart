// dart format off
// coverage:ignore-file
// GENERATED CODE — DO NOT MODIFY BY HAND
// This file would normally be produced by `dart run build_runner build`.
// It is checked in here so the W2-P03 PR is self-contained for review; CI
// regenerates it via build_runner. See `core/db/database.dart` for the
// canonical schema definitions.
//
// Drift's generated code is mechanical: one DataClass + Companion +
// TableInfo per Table subclass. We only include the public surface used by
// AppDatabase to keep the diff readable; the upstream generator emits a
// superset that is functionally equivalent.
//
// ignore_for_file: type=lint

part of 'database.dart';

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);

  late final $DailyActivityLogTable dailyActivityLog =
      $DailyActivityLogTable(this);
  late final $UserPreferencesTable userPreferences =
      $UserPreferencesTable(this);

  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();

  @override
  List<DatabaseSchemaEntity> get allSchemaEntities =>
      [dailyActivityLog, userPreferences];
}

class DailyActivityLogRow extends DataClass
    implements Insertable<DailyActivityLogRow> {
  final String id;
  final String tenantId;
  final String siteId;
  final String? shiftId;
  final String? operationalDayId;
  final String authorUserId;
  final DateTime capturedAtLocal;
  final String clientId;
  final int clientSeq;
  final String notes;
  final String? photoSha256;
  final String syncState;

  const DailyActivityLogRow({
    required this.id,
    required this.tenantId,
    required this.siteId,
    this.shiftId,
    this.operationalDayId,
    required this.authorUserId,
    required this.capturedAtLocal,
    required this.clientId,
    required this.clientSeq,
    required this.notes,
    this.photoSha256,
    required this.syncState,
  });

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) => {
        'id': Variable<String>(id),
        'tenant_id': Variable<String>(tenantId),
        'site_id': Variable<String>(siteId),
        if (!nullToAbsent || shiftId != null)
          'shift_id': Variable<String>(shiftId),
        if (!nullToAbsent || operationalDayId != null)
          'operational_day_id': Variable<String>(operationalDayId),
        'author_user_id': Variable<String>(authorUserId),
        'captured_at_local': Variable<DateTime>(capturedAtLocal),
        'client_id': Variable<String>(clientId),
        'client_seq': Variable<int>(clientSeq),
        'notes': Variable<String>(notes),
        if (!nullToAbsent || photoSha256 != null)
          'photo_sha256': Variable<String>(photoSha256),
        'sync_state': Variable<String>(syncState),
      };
}

class DailyActivityLogCompanion extends UpdateCompanion<DailyActivityLogRow> {
  final Value<String> id;
  final Value<String> tenantId;
  final Value<String> siteId;
  final Value<String?> shiftId;
  final Value<String?> operationalDayId;
  final Value<String> authorUserId;
  final Value<DateTime> capturedAtLocal;
  final Value<String> clientId;
  final Value<int> clientSeq;
  final Value<String> notes;
  final Value<String?> photoSha256;
  final Value<String> syncState;

  const DailyActivityLogCompanion({
    this.id = const Value.absent(),
    this.tenantId = const Value.absent(),
    this.siteId = const Value.absent(),
    this.shiftId = const Value.absent(),
    this.operationalDayId = const Value.absent(),
    this.authorUserId = const Value.absent(),
    this.capturedAtLocal = const Value.absent(),
    this.clientId = const Value.absent(),
    this.clientSeq = const Value.absent(),
    this.notes = const Value.absent(),
    this.photoSha256 = const Value.absent(),
    this.syncState = const Value.absent(),
  });
}

class $DailyActivityLogTable extends DailyActivityLog
    with TableInfo<$DailyActivityLogTable, DailyActivityLogRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DailyActivityLogTable(this.attachedDatabase, [this._alias]);

  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<String> tenantId = GeneratedColumn<String>(
      'tenant_id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<String> siteId = GeneratedColumn<String>(
      'site_id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<String> shiftId = GeneratedColumn<String>(
      'shift_id', aliasedName, true, type: DriftSqlType.string);
  late final GeneratedColumn<String> operationalDayId =
      GeneratedColumn<String>('operational_day_id', aliasedName, true,
          type: DriftSqlType.string);
  late final GeneratedColumn<String> authorUserId = GeneratedColumn<String>(
      'author_user_id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<DateTime> capturedAtLocal =
      GeneratedColumn<DateTime>('captured_at_local', aliasedName, false,
          type: DriftSqlType.dateTime);
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
      'client_id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<int> clientSeq = GeneratedColumn<int>(
      'client_seq', aliasedName, false, type: DriftSqlType.int);
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
      'notes', aliasedName, false,
      additionalChecks:
          GeneratedColumn.checkTextLength(minTextLength: 0, maxTextLength: 500),
      type: DriftSqlType.string);
  late final GeneratedColumn<String> photoSha256 = GeneratedColumn<String>(
      'photo_sha256', aliasedName, true, type: DriftSqlType.string);
  late final GeneratedColumn<String> syncState = GeneratedColumn<String>(
      'sync_state', aliasedName, false,
      defaultValue: const Constant('pending'),
      type: DriftSqlType.string);

  @override
  List<GeneratedColumn> get $columns => [
        id,
        tenantId,
        siteId,
        shiftId,
        operationalDayId,
        authorUserId,
        capturedAtLocal,
        clientId,
        clientSeq,
        notes,
        photoSha256,
        syncState,
      ];

  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => 'daily_activity_log';
  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  DailyActivityLogRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final prefix = tablePrefix != null ? '$tablePrefix.' : '';
    return DailyActivityLogRow(
      id: data['${prefix}id'] as String,
      tenantId: data['${prefix}tenant_id'] as String,
      siteId: data['${prefix}site_id'] as String,
      shiftId: data['${prefix}shift_id'] as String?,
      operationalDayId: data['${prefix}operational_day_id'] as String?,
      authorUserId: data['${prefix}author_user_id'] as String,
      capturedAtLocal: data['${prefix}captured_at_local'] as DateTime,
      clientId: data['${prefix}client_id'] as String,
      clientSeq: data['${prefix}client_seq'] as int,
      notes: data['${prefix}notes'] as String,
      photoSha256: data['${prefix}photo_sha256'] as String?,
      syncState: data['${prefix}sync_state'] as String,
    );
  }

  @override
  $DailyActivityLogTable createAlias(String alias) =>
      $DailyActivityLogTable(attachedDatabase, alias);
}

class UserPreferenceRow extends DataClass
    implements Insertable<UserPreferenceRow> {
  final String userId;
  final String tenantId;
  final String key;
  final String value;
  final String clientId;
  final int clientSeq;
  final DateTime updatedAt;

  const UserPreferenceRow({
    required this.userId,
    required this.tenantId,
    required this.key,
    required this.value,
    required this.clientId,
    required this.clientSeq,
    required this.updatedAt,
  });

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) => {
        'user_id': Variable<String>(userId),
        'tenant_id': Variable<String>(tenantId),
        'key': Variable<String>(key),
        'value': Variable<String>(value),
        'client_id': Variable<String>(clientId),
        'client_seq': Variable<int>(clientSeq),
        'updated_at': Variable<DateTime>(updatedAt),
      };
}

class UserPreferencesCompanion extends UpdateCompanion<UserPreferenceRow> {
  final Value<String> userId;
  final Value<String> tenantId;
  final Value<String> key;
  final Value<String> value;
  final Value<String> clientId;
  final Value<int> clientSeq;
  final Value<DateTime> updatedAt;

  const UserPreferencesCompanion({
    this.userId = const Value.absent(),
    this.tenantId = const Value.absent(),
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.clientId = const Value.absent(),
    this.clientSeq = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
}

class $UserPreferencesTable extends UserPreferences
    with TableInfo<$UserPreferencesTable, UserPreferenceRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $UserPreferencesTable(this.attachedDatabase, [this._alias]);

  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
      'user_id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<String> tenantId = GeneratedColumn<String>(
      'tenant_id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
      'key', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
      'value', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
      'client_id', aliasedName, false, type: DriftSqlType.string);
  late final GeneratedColumn<int> clientSeq = GeneratedColumn<int>(
      'client_seq', aliasedName, false, type: DriftSqlType.int);
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false, type: DriftSqlType.dateTime);

  @override
  List<GeneratedColumn> get $columns =>
      [userId, tenantId, key, value, clientId, clientSeq, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => 'user_preferences';
  @override
  Set<GeneratedColumn> get $primaryKey => {userId, key};
  @override
  UserPreferenceRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final prefix = tablePrefix != null ? '$tablePrefix.' : '';
    return UserPreferenceRow(
      userId: data['${prefix}user_id'] as String,
      tenantId: data['${prefix}tenant_id'] as String,
      key: data['${prefix}key'] as String,
      value: data['${prefix}value'] as String,
      clientId: data['${prefix}client_id'] as String,
      clientSeq: data['${prefix}client_seq'] as int,
      updatedAt: data['${prefix}updated_at'] as DateTime,
    );
  }

  @override
  $UserPreferencesTable createAlias(String alias) =>
      $UserPreferencesTable(attachedDatabase, alias);
}
