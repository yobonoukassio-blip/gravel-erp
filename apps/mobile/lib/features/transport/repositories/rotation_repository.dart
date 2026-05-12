// TruckRotation local repository (TRP-01). Append-only.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/sync/append_only_repository.dart';

class TruckRotation implements SyncEntity {
  TruckRotation({
    required this.id,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
    required this.loadedAtBenchId,
    required this.unloadedAtZoneId,
    required this.materialType,
    required this.weighingTicketId,
    required this.loadedAtUtc,
    required this.createdAtLocal,
    required this.ianaTimezone,
    this.truckEquipmentId,
    this.driverId,
    this.unloadedAtUtc,
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
  final String operationalDayId;
  final String? truckEquipmentId;
  final String? driverId;
  final String loadedAtBenchId;
  final String unloadedAtZoneId;
  final String materialType;
  final String weighingTicketId;
  final DateTime loadedAtUtc;
  final DateTime? unloadedAtUtc;
}

class RotationRepository extends AppendOnlyRepository<TruckRotation> {
  final List<TruckRotation> _rows = <TruckRotation>[];

  @override
  Future<void> appendLocal(TruckRotation entity) async {
    _rows.add(entity);
  }

  @override
  Future<List<TruckRotation>> listPendingSync() async =>
      _rows.where((r) => r.pendingSync).toList(growable: false);

  @override
  Future<TruckRotation?> findById(String id) async {
    for (final r in _rows) {
      if (r.id == id) return r;
    }
    return null;
  }

  @override
  Future<List<TruckRotation>> listForOperationalDay(
    String operationalDayId,
  ) async =>
      _rows
          .where((r) => r.operationalDayId == operationalDayId)
          .toList(growable: false);
}

final rotationRepositoryProvider =
    Provider<RotationRepository>((ref) => RotationRepository());
