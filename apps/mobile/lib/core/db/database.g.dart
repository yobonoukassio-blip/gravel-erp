// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $DailyActivityLogTable extends DailyActivityLog
    with TableInfo<$DailyActivityLogTable, DailyActivityLogRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DailyActivityLogTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tenantIdMeta = const VerificationMeta(
    'tenantId',
  );
  @override
  late final GeneratedColumn<String> tenantId = GeneratedColumn<String>(
    'tenant_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _siteIdMeta = const VerificationMeta('siteId');
  @override
  late final GeneratedColumn<String> siteId = GeneratedColumn<String>(
    'site_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _shiftIdMeta = const VerificationMeta(
    'shiftId',
  );
  @override
  late final GeneratedColumn<String> shiftId = GeneratedColumn<String>(
    'shift_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _operationalDayIdMeta = const VerificationMeta(
    'operationalDayId',
  );
  @override
  late final GeneratedColumn<String> operationalDayId = GeneratedColumn<String>(
    'operational_day_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _authorUserIdMeta = const VerificationMeta(
    'authorUserId',
  );
  @override
  late final GeneratedColumn<String> authorUserId = GeneratedColumn<String>(
    'author_user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _capturedAtLocalMeta = const VerificationMeta(
    'capturedAtLocal',
  );
  @override
  late final GeneratedColumn<DateTime> capturedAtLocal =
      GeneratedColumn<DateTime>(
        'captured_at_local',
        aliasedName,
        false,
        type: DriftSqlType.dateTime,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _clientIdMeta = const VerificationMeta(
    'clientId',
  );
  @override
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
    'client_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _clientSeqMeta = const VerificationMeta(
    'clientSeq',
  );
  @override
  late final GeneratedColumn<int> clientSeq = GeneratedColumn<int>(
    'client_seq',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
    'notes',
    aliasedName,
    false,
    additionalChecks: GeneratedColumn.checkTextLength(
      minTextLength: 0,
      maxTextLength: 500,
    ),
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _photoSha256Meta = const VerificationMeta(
    'photoSha256',
  );
  @override
  late final GeneratedColumn<String> photoSha256 = GeneratedColumn<String>(
    'photo_sha256',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _syncStateMeta = const VerificationMeta(
    'syncState',
  );
  @override
  late final GeneratedColumn<String> syncState = GeneratedColumn<String>(
    'sync_state',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('pending'),
  );
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
  String get actualTableName => $name;
  static const String $name = 'daily_activity_log';
  @override
  VerificationContext validateIntegrity(
    Insertable<DailyActivityLogRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('tenant_id')) {
      context.handle(
        _tenantIdMeta,
        tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tenantIdMeta);
    }
    if (data.containsKey('site_id')) {
      context.handle(
        _siteIdMeta,
        siteId.isAcceptableOrUnknown(data['site_id']!, _siteIdMeta),
      );
    } else if (isInserting) {
      context.missing(_siteIdMeta);
    }
    if (data.containsKey('shift_id')) {
      context.handle(
        _shiftIdMeta,
        shiftId.isAcceptableOrUnknown(data['shift_id']!, _shiftIdMeta),
      );
    }
    if (data.containsKey('operational_day_id')) {
      context.handle(
        _operationalDayIdMeta,
        operationalDayId.isAcceptableOrUnknown(
          data['operational_day_id']!,
          _operationalDayIdMeta,
        ),
      );
    }
    if (data.containsKey('author_user_id')) {
      context.handle(
        _authorUserIdMeta,
        authorUserId.isAcceptableOrUnknown(
          data['author_user_id']!,
          _authorUserIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_authorUserIdMeta);
    }
    if (data.containsKey('captured_at_local')) {
      context.handle(
        _capturedAtLocalMeta,
        capturedAtLocal.isAcceptableOrUnknown(
          data['captured_at_local']!,
          _capturedAtLocalMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_capturedAtLocalMeta);
    }
    if (data.containsKey('client_id')) {
      context.handle(
        _clientIdMeta,
        clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta),
      );
    } else if (isInserting) {
      context.missing(_clientIdMeta);
    }
    if (data.containsKey('client_seq')) {
      context.handle(
        _clientSeqMeta,
        clientSeq.isAcceptableOrUnknown(data['client_seq']!, _clientSeqMeta),
      );
    } else if (isInserting) {
      context.missing(_clientSeqMeta);
    }
    if (data.containsKey('notes')) {
      context.handle(
        _notesMeta,
        notes.isAcceptableOrUnknown(data['notes']!, _notesMeta),
      );
    } else if (isInserting) {
      context.missing(_notesMeta);
    }
    if (data.containsKey('photo_sha256')) {
      context.handle(
        _photoSha256Meta,
        photoSha256.isAcceptableOrUnknown(
          data['photo_sha256']!,
          _photoSha256Meta,
        ),
      );
    }
    if (data.containsKey('sync_state')) {
      context.handle(
        _syncStateMeta,
        syncState.isAcceptableOrUnknown(data['sync_state']!, _syncStateMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  DailyActivityLogRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return DailyActivityLogRow(
      id:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}id'],
          )!,
      tenantId:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}tenant_id'],
          )!,
      siteId:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}site_id'],
          )!,
      shiftId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}shift_id'],
      ),
      operationalDayId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}operational_day_id'],
      ),
      authorUserId:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}author_user_id'],
          )!,
      capturedAtLocal:
          attachedDatabase.typeMapping.read(
            DriftSqlType.dateTime,
            data['${effectivePrefix}captured_at_local'],
          )!,
      clientId:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}client_id'],
          )!,
      clientSeq:
          attachedDatabase.typeMapping.read(
            DriftSqlType.int,
            data['${effectivePrefix}client_seq'],
          )!,
      notes:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}notes'],
          )!,
      photoSha256: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}photo_sha256'],
      ),
      syncState:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}sync_state'],
          )!,
    );
  }

  @override
  $DailyActivityLogTable createAlias(String alias) {
    return $DailyActivityLogTable(attachedDatabase, alias);
  }
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

  /// Local-only — one of `pending`, `synced`, `error`.
  /// Never serialized to the server.
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
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['tenant_id'] = Variable<String>(tenantId);
    map['site_id'] = Variable<String>(siteId);
    if (!nullToAbsent || shiftId != null) {
      map['shift_id'] = Variable<String>(shiftId);
    }
    if (!nullToAbsent || operationalDayId != null) {
      map['operational_day_id'] = Variable<String>(operationalDayId);
    }
    map['author_user_id'] = Variable<String>(authorUserId);
    map['captured_at_local'] = Variable<DateTime>(capturedAtLocal);
    map['client_id'] = Variable<String>(clientId);
    map['client_seq'] = Variable<int>(clientSeq);
    map['notes'] = Variable<String>(notes);
    if (!nullToAbsent || photoSha256 != null) {
      map['photo_sha256'] = Variable<String>(photoSha256);
    }
    map['sync_state'] = Variable<String>(syncState);
    return map;
  }

  DailyActivityLogCompanion toCompanion(bool nullToAbsent) {
    return DailyActivityLogCompanion(
      id: Value(id),
      tenantId: Value(tenantId),
      siteId: Value(siteId),
      shiftId:
          shiftId == null && nullToAbsent
              ? const Value.absent()
              : Value(shiftId),
      operationalDayId:
          operationalDayId == null && nullToAbsent
              ? const Value.absent()
              : Value(operationalDayId),
      authorUserId: Value(authorUserId),
      capturedAtLocal: Value(capturedAtLocal),
      clientId: Value(clientId),
      clientSeq: Value(clientSeq),
      notes: Value(notes),
      photoSha256:
          photoSha256 == null && nullToAbsent
              ? const Value.absent()
              : Value(photoSha256),
      syncState: Value(syncState),
    );
  }

  factory DailyActivityLogRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return DailyActivityLogRow(
      id: serializer.fromJson<String>(json['id']),
      tenantId: serializer.fromJson<String>(json['tenantId']),
      siteId: serializer.fromJson<String>(json['siteId']),
      shiftId: serializer.fromJson<String?>(json['shiftId']),
      operationalDayId: serializer.fromJson<String?>(json['operationalDayId']),
      authorUserId: serializer.fromJson<String>(json['authorUserId']),
      capturedAtLocal: serializer.fromJson<DateTime>(json['capturedAtLocal']),
      clientId: serializer.fromJson<String>(json['clientId']),
      clientSeq: serializer.fromJson<int>(json['clientSeq']),
      notes: serializer.fromJson<String>(json['notes']),
      photoSha256: serializer.fromJson<String?>(json['photoSha256']),
      syncState: serializer.fromJson<String>(json['syncState']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'tenantId': serializer.toJson<String>(tenantId),
      'siteId': serializer.toJson<String>(siteId),
      'shiftId': serializer.toJson<String?>(shiftId),
      'operationalDayId': serializer.toJson<String?>(operationalDayId),
      'authorUserId': serializer.toJson<String>(authorUserId),
      'capturedAtLocal': serializer.toJson<DateTime>(capturedAtLocal),
      'clientId': serializer.toJson<String>(clientId),
      'clientSeq': serializer.toJson<int>(clientSeq),
      'notes': serializer.toJson<String>(notes),
      'photoSha256': serializer.toJson<String?>(photoSha256),
      'syncState': serializer.toJson<String>(syncState),
    };
  }

  DailyActivityLogRow copyWith({
    String? id,
    String? tenantId,
    String? siteId,
    Value<String?> shiftId = const Value.absent(),
    Value<String?> operationalDayId = const Value.absent(),
    String? authorUserId,
    DateTime? capturedAtLocal,
    String? clientId,
    int? clientSeq,
    String? notes,
    Value<String?> photoSha256 = const Value.absent(),
    String? syncState,
  }) => DailyActivityLogRow(
    id: id ?? this.id,
    tenantId: tenantId ?? this.tenantId,
    siteId: siteId ?? this.siteId,
    shiftId: shiftId.present ? shiftId.value : this.shiftId,
    operationalDayId:
        operationalDayId.present
            ? operationalDayId.value
            : this.operationalDayId,
    authorUserId: authorUserId ?? this.authorUserId,
    capturedAtLocal: capturedAtLocal ?? this.capturedAtLocal,
    clientId: clientId ?? this.clientId,
    clientSeq: clientSeq ?? this.clientSeq,
    notes: notes ?? this.notes,
    photoSha256: photoSha256.present ? photoSha256.value : this.photoSha256,
    syncState: syncState ?? this.syncState,
  );
  DailyActivityLogRow copyWithCompanion(DailyActivityLogCompanion data) {
    return DailyActivityLogRow(
      id: data.id.present ? data.id.value : this.id,
      tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,
      siteId: data.siteId.present ? data.siteId.value : this.siteId,
      shiftId: data.shiftId.present ? data.shiftId.value : this.shiftId,
      operationalDayId:
          data.operationalDayId.present
              ? data.operationalDayId.value
              : this.operationalDayId,
      authorUserId:
          data.authorUserId.present
              ? data.authorUserId.value
              : this.authorUserId,
      capturedAtLocal:
          data.capturedAtLocal.present
              ? data.capturedAtLocal.value
              : this.capturedAtLocal,
      clientId: data.clientId.present ? data.clientId.value : this.clientId,
      clientSeq: data.clientSeq.present ? data.clientSeq.value : this.clientSeq,
      notes: data.notes.present ? data.notes.value : this.notes,
      photoSha256:
          data.photoSha256.present ? data.photoSha256.value : this.photoSha256,
      syncState: data.syncState.present ? data.syncState.value : this.syncState,
    );
  }

  @override
  String toString() {
    return (StringBuffer('DailyActivityLogRow(')
          ..write('id: $id, ')
          ..write('tenantId: $tenantId, ')
          ..write('siteId: $siteId, ')
          ..write('shiftId: $shiftId, ')
          ..write('operationalDayId: $operationalDayId, ')
          ..write('authorUserId: $authorUserId, ')
          ..write('capturedAtLocal: $capturedAtLocal, ')
          ..write('clientId: $clientId, ')
          ..write('clientSeq: $clientSeq, ')
          ..write('notes: $notes, ')
          ..write('photoSha256: $photoSha256, ')
          ..write('syncState: $syncState')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
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
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is DailyActivityLogRow &&
          other.id == this.id &&
          other.tenantId == this.tenantId &&
          other.siteId == this.siteId &&
          other.shiftId == this.shiftId &&
          other.operationalDayId == this.operationalDayId &&
          other.authorUserId == this.authorUserId &&
          other.capturedAtLocal == this.capturedAtLocal &&
          other.clientId == this.clientId &&
          other.clientSeq == this.clientSeq &&
          other.notes == this.notes &&
          other.photoSha256 == this.photoSha256 &&
          other.syncState == this.syncState);
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
  final Value<int> rowid;
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
    this.rowid = const Value.absent(),
  });
  DailyActivityLogCompanion.insert({
    required String id,
    required String tenantId,
    required String siteId,
    this.shiftId = const Value.absent(),
    this.operationalDayId = const Value.absent(),
    required String authorUserId,
    required DateTime capturedAtLocal,
    required String clientId,
    required int clientSeq,
    required String notes,
    this.photoSha256 = const Value.absent(),
    this.syncState = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       tenantId = Value(tenantId),
       siteId = Value(siteId),
       authorUserId = Value(authorUserId),
       capturedAtLocal = Value(capturedAtLocal),
       clientId = Value(clientId),
       clientSeq = Value(clientSeq),
       notes = Value(notes);
  static Insertable<DailyActivityLogRow> custom({
    Expression<String>? id,
    Expression<String>? tenantId,
    Expression<String>? siteId,
    Expression<String>? shiftId,
    Expression<String>? operationalDayId,
    Expression<String>? authorUserId,
    Expression<DateTime>? capturedAtLocal,
    Expression<String>? clientId,
    Expression<int>? clientSeq,
    Expression<String>? notes,
    Expression<String>? photoSha256,
    Expression<String>? syncState,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (tenantId != null) 'tenant_id': tenantId,
      if (siteId != null) 'site_id': siteId,
      if (shiftId != null) 'shift_id': shiftId,
      if (operationalDayId != null) 'operational_day_id': operationalDayId,
      if (authorUserId != null) 'author_user_id': authorUserId,
      if (capturedAtLocal != null) 'captured_at_local': capturedAtLocal,
      if (clientId != null) 'client_id': clientId,
      if (clientSeq != null) 'client_seq': clientSeq,
      if (notes != null) 'notes': notes,
      if (photoSha256 != null) 'photo_sha256': photoSha256,
      if (syncState != null) 'sync_state': syncState,
      if (rowid != null) 'rowid': rowid,
    });
  }

  DailyActivityLogCompanion copyWith({
    Value<String>? id,
    Value<String>? tenantId,
    Value<String>? siteId,
    Value<String?>? shiftId,
    Value<String?>? operationalDayId,
    Value<String>? authorUserId,
    Value<DateTime>? capturedAtLocal,
    Value<String>? clientId,
    Value<int>? clientSeq,
    Value<String>? notes,
    Value<String?>? photoSha256,
    Value<String>? syncState,
    Value<int>? rowid,
  }) {
    return DailyActivityLogCompanion(
      id: id ?? this.id,
      tenantId: tenantId ?? this.tenantId,
      siteId: siteId ?? this.siteId,
      shiftId: shiftId ?? this.shiftId,
      operationalDayId: operationalDayId ?? this.operationalDayId,
      authorUserId: authorUserId ?? this.authorUserId,
      capturedAtLocal: capturedAtLocal ?? this.capturedAtLocal,
      clientId: clientId ?? this.clientId,
      clientSeq: clientSeq ?? this.clientSeq,
      notes: notes ?? this.notes,
      photoSha256: photoSha256 ?? this.photoSha256,
      syncState: syncState ?? this.syncState,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (tenantId.present) {
      map['tenant_id'] = Variable<String>(tenantId.value);
    }
    if (siteId.present) {
      map['site_id'] = Variable<String>(siteId.value);
    }
    if (shiftId.present) {
      map['shift_id'] = Variable<String>(shiftId.value);
    }
    if (operationalDayId.present) {
      map['operational_day_id'] = Variable<String>(operationalDayId.value);
    }
    if (authorUserId.present) {
      map['author_user_id'] = Variable<String>(authorUserId.value);
    }
    if (capturedAtLocal.present) {
      map['captured_at_local'] = Variable<DateTime>(capturedAtLocal.value);
    }
    if (clientId.present) {
      map['client_id'] = Variable<String>(clientId.value);
    }
    if (clientSeq.present) {
      map['client_seq'] = Variable<int>(clientSeq.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (photoSha256.present) {
      map['photo_sha256'] = Variable<String>(photoSha256.value);
    }
    if (syncState.present) {
      map['sync_state'] = Variable<String>(syncState.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DailyActivityLogCompanion(')
          ..write('id: $id, ')
          ..write('tenantId: $tenantId, ')
          ..write('siteId: $siteId, ')
          ..write('shiftId: $shiftId, ')
          ..write('operationalDayId: $operationalDayId, ')
          ..write('authorUserId: $authorUserId, ')
          ..write('capturedAtLocal: $capturedAtLocal, ')
          ..write('clientId: $clientId, ')
          ..write('clientSeq: $clientSeq, ')
          ..write('notes: $notes, ')
          ..write('photoSha256: $photoSha256, ')
          ..write('syncState: $syncState, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $UserPreferencesTable extends UserPreferences
    with TableInfo<$UserPreferencesTable, UserPreferenceRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $UserPreferencesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
    'user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _tenantIdMeta = const VerificationMeta(
    'tenantId',
  );
  @override
  late final GeneratedColumn<String> tenantId = GeneratedColumn<String>(
    'tenant_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _clientIdMeta = const VerificationMeta(
    'clientId',
  );
  @override
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
    'client_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _clientSeqMeta = const VerificationMeta(
    'clientSeq',
  );
  @override
  late final GeneratedColumn<int> clientSeq = GeneratedColumn<int>(
    'client_seq',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    userId,
    tenantId,
    key,
    value,
    clientId,
    clientSeq,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'user_preferences';
  @override
  VerificationContext validateIntegrity(
    Insertable<UserPreferenceRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('user_id')) {
      context.handle(
        _userIdMeta,
        userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta),
      );
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('tenant_id')) {
      context.handle(
        _tenantIdMeta,
        tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta),
      );
    } else if (isInserting) {
      context.missing(_tenantIdMeta);
    }
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
        _valueMeta,
        value.isAcceptableOrUnknown(data['value']!, _valueMeta),
      );
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    if (data.containsKey('client_id')) {
      context.handle(
        _clientIdMeta,
        clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta),
      );
    } else if (isInserting) {
      context.missing(_clientIdMeta);
    }
    if (data.containsKey('client_seq')) {
      context.handle(
        _clientSeqMeta,
        clientSeq.isAcceptableOrUnknown(data['client_seq']!, _clientSeqMeta),
      );
    } else if (isInserting) {
      context.missing(_clientSeqMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {userId, key};
  @override
  UserPreferenceRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return UserPreferenceRow(
      userId:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}user_id'],
          )!,
      tenantId:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}tenant_id'],
          )!,
      key:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}key'],
          )!,
      value:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}value'],
          )!,
      clientId:
          attachedDatabase.typeMapping.read(
            DriftSqlType.string,
            data['${effectivePrefix}client_id'],
          )!,
      clientSeq:
          attachedDatabase.typeMapping.read(
            DriftSqlType.int,
            data['${effectivePrefix}client_seq'],
          )!,
      updatedAt:
          attachedDatabase.typeMapping.read(
            DriftSqlType.dateTime,
            data['${effectivePrefix}updated_at'],
          )!,
    );
  }

  @override
  $UserPreferencesTable createAlias(String alias) {
    return $UserPreferencesTable(attachedDatabase, alias);
  }
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
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['user_id'] = Variable<String>(userId);
    map['tenant_id'] = Variable<String>(tenantId);
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    map['client_id'] = Variable<String>(clientId);
    map['client_seq'] = Variable<int>(clientSeq);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  UserPreferencesCompanion toCompanion(bool nullToAbsent) {
    return UserPreferencesCompanion(
      userId: Value(userId),
      tenantId: Value(tenantId),
      key: Value(key),
      value: Value(value),
      clientId: Value(clientId),
      clientSeq: Value(clientSeq),
      updatedAt: Value(updatedAt),
    );
  }

  factory UserPreferenceRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return UserPreferenceRow(
      userId: serializer.fromJson<String>(json['userId']),
      tenantId: serializer.fromJson<String>(json['tenantId']),
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
      clientId: serializer.fromJson<String>(json['clientId']),
      clientSeq: serializer.fromJson<int>(json['clientSeq']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'userId': serializer.toJson<String>(userId),
      'tenantId': serializer.toJson<String>(tenantId),
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
      'clientId': serializer.toJson<String>(clientId),
      'clientSeq': serializer.toJson<int>(clientSeq),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  UserPreferenceRow copyWith({
    String? userId,
    String? tenantId,
    String? key,
    String? value,
    String? clientId,
    int? clientSeq,
    DateTime? updatedAt,
  }) => UserPreferenceRow(
    userId: userId ?? this.userId,
    tenantId: tenantId ?? this.tenantId,
    key: key ?? this.key,
    value: value ?? this.value,
    clientId: clientId ?? this.clientId,
    clientSeq: clientSeq ?? this.clientSeq,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  UserPreferenceRow copyWithCompanion(UserPreferencesCompanion data) {
    return UserPreferenceRow(
      userId: data.userId.present ? data.userId.value : this.userId,
      tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
      clientId: data.clientId.present ? data.clientId.value : this.clientId,
      clientSeq: data.clientSeq.present ? data.clientSeq.value : this.clientSeq,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('UserPreferenceRow(')
          ..write('userId: $userId, ')
          ..write('tenantId: $tenantId, ')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('clientId: $clientId, ')
          ..write('clientSeq: $clientSeq, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(userId, tenantId, key, value, clientId, clientSeq, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is UserPreferenceRow &&
          other.userId == this.userId &&
          other.tenantId == this.tenantId &&
          other.key == this.key &&
          other.value == this.value &&
          other.clientId == this.clientId &&
          other.clientSeq == this.clientSeq &&
          other.updatedAt == this.updatedAt);
}

class UserPreferencesCompanion extends UpdateCompanion<UserPreferenceRow> {
  final Value<String> userId;
  final Value<String> tenantId;
  final Value<String> key;
  final Value<String> value;
  final Value<String> clientId;
  final Value<int> clientSeq;
  final Value<DateTime> updatedAt;
  final Value<int> rowid;
  const UserPreferencesCompanion({
    this.userId = const Value.absent(),
    this.tenantId = const Value.absent(),
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.clientId = const Value.absent(),
    this.clientSeq = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  UserPreferencesCompanion.insert({
    required String userId,
    required String tenantId,
    required String key,
    required String value,
    required String clientId,
    required int clientSeq,
    required DateTime updatedAt,
    this.rowid = const Value.absent(),
  }) : userId = Value(userId),
       tenantId = Value(tenantId),
       key = Value(key),
       value = Value(value),
       clientId = Value(clientId),
       clientSeq = Value(clientSeq),
       updatedAt = Value(updatedAt);
  static Insertable<UserPreferenceRow> custom({
    Expression<String>? userId,
    Expression<String>? tenantId,
    Expression<String>? key,
    Expression<String>? value,
    Expression<String>? clientId,
    Expression<int>? clientSeq,
    Expression<DateTime>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (userId != null) 'user_id': userId,
      if (tenantId != null) 'tenant_id': tenantId,
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (clientId != null) 'client_id': clientId,
      if (clientSeq != null) 'client_seq': clientSeq,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  UserPreferencesCompanion copyWith({
    Value<String>? userId,
    Value<String>? tenantId,
    Value<String>? key,
    Value<String>? value,
    Value<String>? clientId,
    Value<int>? clientSeq,
    Value<DateTime>? updatedAt,
    Value<int>? rowid,
  }) {
    return UserPreferencesCompanion(
      userId: userId ?? this.userId,
      tenantId: tenantId ?? this.tenantId,
      key: key ?? this.key,
      value: value ?? this.value,
      clientId: clientId ?? this.clientId,
      clientSeq: clientSeq ?? this.clientSeq,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (tenantId.present) {
      map['tenant_id'] = Variable<String>(tenantId.value);
    }
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (clientId.present) {
      map['client_id'] = Variable<String>(clientId.value);
    }
    if (clientSeq.present) {
      map['client_seq'] = Variable<int>(clientSeq.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('UserPreferencesCompanion(')
          ..write('userId: $userId, ')
          ..write('tenantId: $tenantId, ')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('clientId: $clientId, ')
          ..write('clientSeq: $clientSeq, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $DailyActivityLogTable dailyActivityLog = $DailyActivityLogTable(
    this,
  );
  late final $UserPreferencesTable userPreferences = $UserPreferencesTable(
    this,
  );
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    dailyActivityLog,
    userPreferences,
  ];
}

typedef $$DailyActivityLogTableCreateCompanionBuilder =
    DailyActivityLogCompanion Function({
      required String id,
      required String tenantId,
      required String siteId,
      Value<String?> shiftId,
      Value<String?> operationalDayId,
      required String authorUserId,
      required DateTime capturedAtLocal,
      required String clientId,
      required int clientSeq,
      required String notes,
      Value<String?> photoSha256,
      Value<String> syncState,
      Value<int> rowid,
    });
typedef $$DailyActivityLogTableUpdateCompanionBuilder =
    DailyActivityLogCompanion Function({
      Value<String> id,
      Value<String> tenantId,
      Value<String> siteId,
      Value<String?> shiftId,
      Value<String?> operationalDayId,
      Value<String> authorUserId,
      Value<DateTime> capturedAtLocal,
      Value<String> clientId,
      Value<int> clientSeq,
      Value<String> notes,
      Value<String?> photoSha256,
      Value<String> syncState,
      Value<int> rowid,
    });

class $$DailyActivityLogTableFilterComposer
    extends Composer<_$AppDatabase, $DailyActivityLogTable> {
  $$DailyActivityLogTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tenantId => $composableBuilder(
    column: $table.tenantId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get shiftId => $composableBuilder(
    column: $table.shiftId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get operationalDayId => $composableBuilder(
    column: $table.operationalDayId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get authorUserId => $composableBuilder(
    column: $table.authorUserId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get capturedAtLocal => $composableBuilder(
    column: $table.capturedAtLocal,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clientId => $composableBuilder(
    column: $table.clientId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get clientSeq => $composableBuilder(
    column: $table.clientSeq,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get photoSha256 => $composableBuilder(
    column: $table.photoSha256,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get syncState => $composableBuilder(
    column: $table.syncState,
    builder: (column) => ColumnFilters(column),
  );
}

class $$DailyActivityLogTableOrderingComposer
    extends Composer<_$AppDatabase, $DailyActivityLogTable> {
  $$DailyActivityLogTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tenantId => $composableBuilder(
    column: $table.tenantId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get siteId => $composableBuilder(
    column: $table.siteId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get shiftId => $composableBuilder(
    column: $table.shiftId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get operationalDayId => $composableBuilder(
    column: $table.operationalDayId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get authorUserId => $composableBuilder(
    column: $table.authorUserId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get capturedAtLocal => $composableBuilder(
    column: $table.capturedAtLocal,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clientId => $composableBuilder(
    column: $table.clientId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get clientSeq => $composableBuilder(
    column: $table.clientSeq,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get notes => $composableBuilder(
    column: $table.notes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get photoSha256 => $composableBuilder(
    column: $table.photoSha256,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get syncState => $composableBuilder(
    column: $table.syncState,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$DailyActivityLogTableAnnotationComposer
    extends Composer<_$AppDatabase, $DailyActivityLogTable> {
  $$DailyActivityLogTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get tenantId =>
      $composableBuilder(column: $table.tenantId, builder: (column) => column);

  GeneratedColumn<String> get siteId =>
      $composableBuilder(column: $table.siteId, builder: (column) => column);

  GeneratedColumn<String> get shiftId =>
      $composableBuilder(column: $table.shiftId, builder: (column) => column);

  GeneratedColumn<String> get operationalDayId => $composableBuilder(
    column: $table.operationalDayId,
    builder: (column) => column,
  );

  GeneratedColumn<String> get authorUserId => $composableBuilder(
    column: $table.authorUserId,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get capturedAtLocal => $composableBuilder(
    column: $table.capturedAtLocal,
    builder: (column) => column,
  );

  GeneratedColumn<String> get clientId =>
      $composableBuilder(column: $table.clientId, builder: (column) => column);

  GeneratedColumn<int> get clientSeq =>
      $composableBuilder(column: $table.clientSeq, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<String> get photoSha256 => $composableBuilder(
    column: $table.photoSha256,
    builder: (column) => column,
  );

  GeneratedColumn<String> get syncState =>
      $composableBuilder(column: $table.syncState, builder: (column) => column);
}

class $$DailyActivityLogTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $DailyActivityLogTable,
          DailyActivityLogRow,
          $$DailyActivityLogTableFilterComposer,
          $$DailyActivityLogTableOrderingComposer,
          $$DailyActivityLogTableAnnotationComposer,
          $$DailyActivityLogTableCreateCompanionBuilder,
          $$DailyActivityLogTableUpdateCompanionBuilder,
          (
            DailyActivityLogRow,
            BaseReferences<
              _$AppDatabase,
              $DailyActivityLogTable,
              DailyActivityLogRow
            >,
          ),
          DailyActivityLogRow,
          PrefetchHooks Function()
        > {
  $$DailyActivityLogTableTableManager(
    _$AppDatabase db,
    $DailyActivityLogTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer:
              () =>
                  $$DailyActivityLogTableFilterComposer($db: db, $table: table),
          createOrderingComposer:
              () => $$DailyActivityLogTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer:
              () => $$DailyActivityLogTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> tenantId = const Value.absent(),
                Value<String> siteId = const Value.absent(),
                Value<String?> shiftId = const Value.absent(),
                Value<String?> operationalDayId = const Value.absent(),
                Value<String> authorUserId = const Value.absent(),
                Value<DateTime> capturedAtLocal = const Value.absent(),
                Value<String> clientId = const Value.absent(),
                Value<int> clientSeq = const Value.absent(),
                Value<String> notes = const Value.absent(),
                Value<String?> photoSha256 = const Value.absent(),
                Value<String> syncState = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => DailyActivityLogCompanion(
                id: id,
                tenantId: tenantId,
                siteId: siteId,
                shiftId: shiftId,
                operationalDayId: operationalDayId,
                authorUserId: authorUserId,
                capturedAtLocal: capturedAtLocal,
                clientId: clientId,
                clientSeq: clientSeq,
                notes: notes,
                photoSha256: photoSha256,
                syncState: syncState,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String tenantId,
                required String siteId,
                Value<String?> shiftId = const Value.absent(),
                Value<String?> operationalDayId = const Value.absent(),
                required String authorUserId,
                required DateTime capturedAtLocal,
                required String clientId,
                required int clientSeq,
                required String notes,
                Value<String?> photoSha256 = const Value.absent(),
                Value<String> syncState = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => DailyActivityLogCompanion.insert(
                id: id,
                tenantId: tenantId,
                siteId: siteId,
                shiftId: shiftId,
                operationalDayId: operationalDayId,
                authorUserId: authorUserId,
                capturedAtLocal: capturedAtLocal,
                clientId: clientId,
                clientSeq: clientSeq,
                notes: notes,
                photoSha256: photoSha256,
                syncState: syncState,
                rowid: rowid,
              ),
          withReferenceMapper:
              (p0) =>
                  p0
                      .map(
                        (e) => (
                          e.readTable(table),
                          BaseReferences(db, table, e),
                        ),
                      )
                      .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$DailyActivityLogTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $DailyActivityLogTable,
      DailyActivityLogRow,
      $$DailyActivityLogTableFilterComposer,
      $$DailyActivityLogTableOrderingComposer,
      $$DailyActivityLogTableAnnotationComposer,
      $$DailyActivityLogTableCreateCompanionBuilder,
      $$DailyActivityLogTableUpdateCompanionBuilder,
      (
        DailyActivityLogRow,
        BaseReferences<
          _$AppDatabase,
          $DailyActivityLogTable,
          DailyActivityLogRow
        >,
      ),
      DailyActivityLogRow,
      PrefetchHooks Function()
    >;
typedef $$UserPreferencesTableCreateCompanionBuilder =
    UserPreferencesCompanion Function({
      required String userId,
      required String tenantId,
      required String key,
      required String value,
      required String clientId,
      required int clientSeq,
      required DateTime updatedAt,
      Value<int> rowid,
    });
typedef $$UserPreferencesTableUpdateCompanionBuilder =
    UserPreferencesCompanion Function({
      Value<String> userId,
      Value<String> tenantId,
      Value<String> key,
      Value<String> value,
      Value<String> clientId,
      Value<int> clientSeq,
      Value<DateTime> updatedAt,
      Value<int> rowid,
    });

class $$UserPreferencesTableFilterComposer
    extends Composer<_$AppDatabase, $UserPreferencesTable> {
  $$UserPreferencesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tenantId => $composableBuilder(
    column: $table.tenantId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clientId => $composableBuilder(
    column: $table.clientId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get clientSeq => $composableBuilder(
    column: $table.clientSeq,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$UserPreferencesTableOrderingComposer
    extends Composer<_$AppDatabase, $UserPreferencesTable> {
  $$UserPreferencesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tenantId => $composableBuilder(
    column: $table.tenantId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get value => $composableBuilder(
    column: $table.value,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clientId => $composableBuilder(
    column: $table.clientId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get clientSeq => $composableBuilder(
    column: $table.clientSeq,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$UserPreferencesTableAnnotationComposer
    extends Composer<_$AppDatabase, $UserPreferencesTable> {
  $$UserPreferencesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get tenantId =>
      $composableBuilder(column: $table.tenantId, builder: (column) => column);

  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);

  GeneratedColumn<String> get clientId =>
      $composableBuilder(column: $table.clientId, builder: (column) => column);

  GeneratedColumn<int> get clientSeq =>
      $composableBuilder(column: $table.clientSeq, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$UserPreferencesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $UserPreferencesTable,
          UserPreferenceRow,
          $$UserPreferencesTableFilterComposer,
          $$UserPreferencesTableOrderingComposer,
          $$UserPreferencesTableAnnotationComposer,
          $$UserPreferencesTableCreateCompanionBuilder,
          $$UserPreferencesTableUpdateCompanionBuilder,
          (
            UserPreferenceRow,
            BaseReferences<
              _$AppDatabase,
              $UserPreferencesTable,
              UserPreferenceRow
            >,
          ),
          UserPreferenceRow,
          PrefetchHooks Function()
        > {
  $$UserPreferencesTableTableManager(
    _$AppDatabase db,
    $UserPreferencesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer:
              () =>
                  $$UserPreferencesTableFilterComposer($db: db, $table: table),
          createOrderingComposer:
              () => $$UserPreferencesTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer:
              () => $$UserPreferencesTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> userId = const Value.absent(),
                Value<String> tenantId = const Value.absent(),
                Value<String> key = const Value.absent(),
                Value<String> value = const Value.absent(),
                Value<String> clientId = const Value.absent(),
                Value<int> clientSeq = const Value.absent(),
                Value<DateTime> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => UserPreferencesCompanion(
                userId: userId,
                tenantId: tenantId,
                key: key,
                value: value,
                clientId: clientId,
                clientSeq: clientSeq,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String userId,
                required String tenantId,
                required String key,
                required String value,
                required String clientId,
                required int clientSeq,
                required DateTime updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => UserPreferencesCompanion.insert(
                userId: userId,
                tenantId: tenantId,
                key: key,
                value: value,
                clientId: clientId,
                clientSeq: clientSeq,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper:
              (p0) =>
                  p0
                      .map(
                        (e) => (
                          e.readTable(table),
                          BaseReferences(db, table, e),
                        ),
                      )
                      .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$UserPreferencesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $UserPreferencesTable,
      UserPreferenceRow,
      $$UserPreferencesTableFilterComposer,
      $$UserPreferencesTableOrderingComposer,
      $$UserPreferencesTableAnnotationComposer,
      $$UserPreferencesTableCreateCompanionBuilder,
      $$UserPreferencesTableUpdateCompanionBuilder,
      (
        UserPreferenceRow,
        BaseReferences<_$AppDatabase, $UserPreferencesTable, UserPreferenceRow>,
      ),
      UserPreferenceRow,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$DailyActivityLogTableTableManager get dailyActivityLog =>
      $$DailyActivityLogTableTableManager(_db, _db.dailyActivityLog);
  $$UserPreferencesTableTableManager get userPreferences =>
      $$UserPreferencesTableTableManager(_db, _db.userPreferences);
}
