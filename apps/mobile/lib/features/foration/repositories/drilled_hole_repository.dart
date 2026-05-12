// DrilledHole local repository — extends AppendOnlyRepository (W0).
//
// D2-11 contract: only insert. Corrections land as NEW rows with
// `correctsHoleId` pointing to the original.
//
// TODO(co-design): finalize the offline draft TTL once we hear from the
// 3 field operators (currently 7 days, matches activity_log).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/sync/append_only_repository.dart';

class DrilledHole implements SyncEntity {
  DrilledHole({
    required this.id,
    required this.tenantId,
    required this.siteId,
    required this.planId,
    required this.holeIndexInPlan,
    required this.actualDepthM,
    required this.actualDiameterMm,
    required this.startedAtLocal,
    required this.endedAtLocal,
    required this.createdAtLocal,
    required this.ianaTimezone,
    required this.operationalDayId,
    required this.operatorId,
    required this.machineId,
    this.gpsLatitude,
    this.gpsLongitude,
    this.gpsAccuracyM,
    this.inclinationDeg,
    this.fuelLitersConsumed,
    this.notesText,
    this.photoBlobSha256,
    this.toleranceViolation = false,
    this.toleranceViolationReason,
    this.correctsHoleId,
    this.pendingSync = true,
  });

  @override
  final String id;
  @override
  final String tenantId;
  @override
  final bool pendingSync;
  @override
  final DateTime createdAtLocal;
  @override
  final String ianaTimezone;

  final String siteId;
  final String planId;
  final int holeIndexInPlan;
  final double? gpsLatitude;
  final double? gpsLongitude;
  final double? gpsAccuracyM;
  final double actualDepthM;
  final int actualDiameterMm;
  final double? inclinationDeg;
  final DateTime startedAtLocal;
  final DateTime endedAtLocal;
  final String operationalDayId;
  final String operatorId;
  final String machineId;
  final double? fuelLitersConsumed;
  final String? notesText;
  final String? photoBlobSha256;
  final bool toleranceViolation;
  final String? toleranceViolationReason;
  final String? correctsHoleId;
}

/// In-memory implementation. Wired against Drift in a follow-up task once
/// the @SyncEntity Drift table definitions are codegen'd from the API
/// entity (W2 chore).
class DrilledHoleRepository extends AppendOnlyRepository<DrilledHole> {
  final List<DrilledHole> _rows = <DrilledHole>[];

  @override
  Future<void> appendLocal(DrilledHole entity) async {
    _rows.add(entity);
  }

  @override
  Future<List<DrilledHole>> listPendingSync() async =>
      _rows.where((r) => r.pendingSync).toList(growable: false);

  @override
  Future<DrilledHole?> findById(String id) async {
    for (final r in _rows) {
      if (r.id == id) return r;
    }
    return null;
  }

  @override
  Future<List<DrilledHole>> listForOperationalDay(String operationalDayId) async =>
      _rows
          .where((r) => r.operationalDayId == operationalDayId)
          .toList(growable: false);

  Future<List<DrilledHole>> listForPlan(String planId) async =>
      _rows.where((r) => r.planId == planId).toList(growable: false);
}

final drilledHoleRepositoryProvider = Provider<DrilledHoleRepository>((ref) {
  return DrilledHoleRepository();
});
