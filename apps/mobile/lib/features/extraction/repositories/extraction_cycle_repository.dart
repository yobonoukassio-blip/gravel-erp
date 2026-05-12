// Append-only repository for ExtractionCycle (D2-20, EXT-01).
//
// Built on `sqlite_async` directly rather than Drift so this feature can ship
// without re-running the Drift codegen step. The PowerSync-managed sqlite
// database is shared with the Drift `AppDatabase` (W2-P03 pattern) — both
// see the same on-disk file, so this repo's writes are picked up by the
// PowerSync upload connector.
//
// Contract (AppendOnlyRepository — D2-20):
//   - INSERT only. No UPDATE/DELETE on local rows.
//   - Client-side UUID generated at insert; server preserves it.
//   - `created_at_local` + IANA TZ captured from device clock (display-only,
//     never the ordering authority — D-14).
//   - `sync_state = 'pending'` until PowerSync upstream ACKs the row.
//   - Corrections land as NEW rows with `corrects_id` FK.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqlite_async/sqlite_async.dart';
import 'package:uuid/uuid.dart';

import '../../../core/sync/append_only_repository.dart';

const _createExtractionCycleSql = '''
CREATE TABLE IF NOT EXISTS extraction_cycle (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL,
  site_id                  TEXT NOT NULL,
  operational_day_id       TEXT NOT NULL,
  bench_id                 TEXT NOT NULL,
  equipment_id             TEXT NOT NULL,
  operator_id              TEXT NOT NULL,
  material_type            TEXT NOT NULL CHECK (material_type IN ('granite_brut','tout_venant','sterile')),
  estimated_tonnage_t      REAL NOT NULL CHECK (estimated_tonnage_t >= 0),
  cycle_started_at_local   TEXT NOT NULL,
  cycle_ended_at_local     TEXT NOT NULL,
  iana_timezone            TEXT NOT NULL,
  downtime_minutes         INTEGER NULL CHECK (downtime_minutes IS NULL OR downtime_minutes >= 0),
  downtime_reason_code     TEXT NULL CHECK (downtime_reason_code IS NULL OR downtime_reason_code IN ('meal_break','fuel','mechanical','weather','safety','other')),
  notes                    TEXT NULL,
  corrects_id              TEXT NULL,
  created_at_local         TEXT NOT NULL,
  created_by               TEXT NOT NULL,
  sync_state               TEXT NOT NULL DEFAULT 'pending'
);
''';

/// Domain values mirrored from the backend entity. Plain string constants so
/// they can be referenced from widgets without importing typed enums.
const kMaterialTypes = <String>['granite_brut', 'tout_venant', 'sterile'];

const kDowntimeReasons = <String>[
  'meal_break',
  'fuel',
  'mechanical',
  'weather',
  'safety',
  'other',
];

class ExtractionCycleRow implements SyncEntity {
  ExtractionCycleRow({
    required this.id,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
    required this.benchId,
    required this.equipmentId,
    required this.operatorId,
    required this.materialType,
    required this.estimatedTonnageT,
    required this.cycleStartedAtLocal,
    required this.cycleEndedAtLocal,
    required this.ianaTimezone,
    required this.downtimeMinutes,
    required this.downtimeReasonCode,
    required this.notes,
    required this.correctsId,
    required this.createdAtLocal,
    required this.createdBy,
    required this.syncState,
  });

  @override
  final String id;
  @override
  final String tenantId;
  final String siteId;
  final String operationalDayId;
  final String benchId;
  final String equipmentId;
  final String operatorId;
  final String materialType;
  final double estimatedTonnageT;
  final DateTime cycleStartedAtLocal;
  final DateTime cycleEndedAtLocal;
  @override
  final String ianaTimezone;
  final int? downtimeMinutes;
  final String? downtimeReasonCode;
  final String? notes;
  final String? correctsId;
  final DateTime createdAtLocal;
  final String createdBy;
  final String syncState;

  @override
  bool get pendingSync => syncState == 'pending';
  // `createdAtLocal`, `id`, `tenantId`, `ianaTimezone` are satisfied by the
  // final fields declared above (Dart auto-promotes them to getters that
  // implement the abstract SyncEntity getters).
}

class NewExtractionCycleInput {
  const NewExtractionCycleInput({
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
    required this.benchId,
    required this.equipmentId,
    required this.operatorId,
    required this.materialType,
    required this.estimatedTonnageT,
    required this.cycleStartedAtLocal,
    required this.cycleEndedAtLocal,
    required this.ianaTimezone,
    required this.createdBy,
    this.downtimeMinutes,
    this.downtimeReasonCode,
    this.notes,
    this.correctsId,
  });

  final String tenantId;
  final String siteId;
  final String operationalDayId;
  final String benchId;
  final String equipmentId;
  final String operatorId;
  final String materialType;
  final double estimatedTonnageT;
  final DateTime cycleStartedAtLocal;
  final DateTime cycleEndedAtLocal;
  final String ianaTimezone;
  final String createdBy;
  final int? downtimeMinutes;
  final String? downtimeReasonCode;
  final String? notes;
  final String? correctsId;
}

/// AppendOnlyRepository implementation backed by sqlite_async.
class ExtractionCycleRepository extends AppendOnlyRepository<ExtractionCycleRow> {
  ExtractionCycleRepository({required this.db, Uuid? uuid})
      : _uuid = uuid ?? const Uuid();

  final SqliteDatabase db;
  final Uuid _uuid;

  Future<void> ensureSchema() async {
    await db.execute(_createExtractionCycleSql);
  }

  /// Insert a new extraction cycle locally. Returns the freshly-allocated id.
  Future<String> insert(NewExtractionCycleInput input) async {
    _validate(input);
    final id = _uuid.v4();
    await db.execute(
      '''
      INSERT INTO extraction_cycle (
        id, tenant_id, site_id, operational_day_id, bench_id, equipment_id,
        operator_id, material_type, estimated_tonnage_t,
        cycle_started_at_local, cycle_ended_at_local, iana_timezone,
        downtime_minutes, downtime_reason_code, notes, corrects_id,
        created_at_local, created_by, sync_state
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ''',
      [
        id,
        input.tenantId,
        input.siteId,
        input.operationalDayId,
        input.benchId,
        input.equipmentId,
        input.operatorId,
        input.materialType,
        input.estimatedTonnageT,
        input.cycleStartedAtLocal.toIso8601String(),
        input.cycleEndedAtLocal.toIso8601String(),
        input.ianaTimezone,
        input.downtimeMinutes,
        input.downtimeReasonCode,
        input.notes,
        input.correctsId,
        DateTime.now().toIso8601String(),
        input.createdBy,
        'pending',
      ],
    );
    return id;
  }

  @override
  Future<void> appendLocal(ExtractionCycleRow entity) async {
    await db.execute(
      '''
      INSERT INTO extraction_cycle (
        id, tenant_id, site_id, operational_day_id, bench_id, equipment_id,
        operator_id, material_type, estimated_tonnage_t,
        cycle_started_at_local, cycle_ended_at_local, iana_timezone,
        downtime_minutes, downtime_reason_code, notes, corrects_id,
        created_at_local, created_by, sync_state
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ''',
      [
        entity.id,
        entity.tenantId,
        entity.siteId,
        entity.operationalDayId,
        entity.benchId,
        entity.equipmentId,
        entity.operatorId,
        entity.materialType,
        entity.estimatedTonnageT,
        entity.cycleStartedAtLocal.toIso8601String(),
        entity.cycleEndedAtLocal.toIso8601String(),
        entity.ianaTimezone,
        entity.downtimeMinutes,
        entity.downtimeReasonCode,
        entity.notes,
        entity.correctsId,
        entity.createdAtLocal.toIso8601String(),
        entity.createdBy,
        entity.syncState,
      ],
    );
  }

  @override
  Future<List<ExtractionCycleRow>> listPendingSync() async {
    final result = await db.getAll(
      "SELECT * FROM extraction_cycle WHERE sync_state = 'pending' ORDER BY created_at_local DESC",
    );
    return result.map(_rowFromMap).toList();
  }

  @override
  Future<ExtractionCycleRow?> findById(String id) async {
    final rows =
        await db.getAll('SELECT * FROM extraction_cycle WHERE id = ?', [id]);
    if (rows.isEmpty) return null;
    return _rowFromMap(rows.first);
  }

  @override
  Future<List<ExtractionCycleRow>> listForOperationalDay(
    String operationalDayId,
  ) async {
    final result = await db.getAll(
      'SELECT * FROM extraction_cycle WHERE operational_day_id = ? ORDER BY cycle_started_at_local ASC',
      [operationalDayId],
    );
    return result.map(_rowFromMap).toList();
  }

  /// Counts pending rows. Integration test asserts this returns > 0 after
  /// submit while offline.
  Future<int> countPending() async {
    final rows = await db.getAll(
      "SELECT COUNT(*) AS c FROM extraction_cycle WHERE sync_state = 'pending'",
    );
    return (rows.first['c'] as int?) ?? 0;
  }

  void _validate(NewExtractionCycleInput input) {
    if (!kMaterialTypes.contains(input.materialType)) {
      throw ArgumentError.value(
        input.materialType,
        'materialType',
        'must be one of $kMaterialTypes',
      );
    }
    if (input.estimatedTonnageT < 0) {
      throw ArgumentError.value(
        input.estimatedTonnageT,
        'estimatedTonnageT',
        'must be >= 0',
      );
    }
    if (!input.cycleEndedAtLocal.isAfter(input.cycleStartedAtLocal)) {
      throw ArgumentError(
        'cycleEndedAtLocal must be strictly after cycleStartedAtLocal',
      );
    }
    final reason = input.downtimeReasonCode;
    final mins = input.downtimeMinutes;
    if (reason != null && !kDowntimeReasons.contains(reason)) {
      throw ArgumentError.value(reason, 'downtimeReasonCode');
    }
    if (reason != null && (mins == null || mins <= 0)) {
      throw ArgumentError('downtime_reason_code requires downtime_minutes > 0');
    }
    if (mins != null && mins < 0) {
      throw ArgumentError.value(mins, 'downtimeMinutes', 'must be >= 0');
    }
    final elapsedMin =
        input.cycleEndedAtLocal.difference(input.cycleStartedAtLocal).inMinutes;
    if (mins != null && mins > elapsedMin) {
      throw ArgumentError('downtime_minutes cannot exceed cycle elapsed time');
    }
  }

  ExtractionCycleRow _rowFromMap(Map<String, dynamic> r) {
    return ExtractionCycleRow(
      id: r['id'] as String,
      tenantId: r['tenant_id'] as String,
      siteId: r['site_id'] as String,
      operationalDayId: r['operational_day_id'] as String,
      benchId: r['bench_id'] as String,
      equipmentId: r['equipment_id'] as String,
      operatorId: r['operator_id'] as String,
      materialType: r['material_type'] as String,
      estimatedTonnageT: (r['estimated_tonnage_t'] as num).toDouble(),
      cycleStartedAtLocal:
          DateTime.parse(r['cycle_started_at_local'] as String),
      cycleEndedAtLocal: DateTime.parse(r['cycle_ended_at_local'] as String),
      ianaTimezone: r['iana_timezone'] as String,
      downtimeMinutes: r['downtime_minutes'] as int?,
      downtimeReasonCode: r['downtime_reason_code'] as String?,
      notes: r['notes'] as String?,
      correctsId: r['corrects_id'] as String?,
      createdAtLocal: DateTime.parse(r['created_at_local'] as String),
      createdBy: r['created_by'] as String,
      syncState: r['sync_state'] as String,
    );
  }
}

/// Riverpod provider — overridden at app composition root with the concrete
/// PowerSync-managed SqliteDatabase.
final extractionCycleRepositoryProvider =
    Provider<ExtractionCycleRepository>((ref) {
  throw UnimplementedError(
    'extractionCycleRepositoryProvider must be overridden at app composition root',
  );
});
