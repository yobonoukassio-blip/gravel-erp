// EquipmentRefuel local repository (CAR-02). Append-only.
//
// Stores equipment refuel records locally via the AppendOnlyRepository
// contract. PowerSync replicates rows to the server once connectivity
// is restored.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/sync/append_only_repository.dart';

class EquipmentRefuel implements SyncEntity {
  EquipmentRefuel({
    required this.id,
    required this.tenantId,
    required this.siteId,
    required this.tankId,
    required this.equipmentId,
    required this.operatorId,
    required this.liters,
    required this.equipmentHourMeterReading,
    required this.operationalDayId,
    required this.createdAtLocal,
    required this.ianaTimezone,
    required this.createdBy,
    this.gaugePhotoBlobSha256,
    this.notes,
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
  final String tankId;
  final String equipmentId;
  final String operatorId;

  /// Litres dispensed. Must be > 0.
  final double liters;

  /// Running hour meter reading on the equipment. Monotonically non-decreasing.
  final double equipmentHourMeterReading;

  final String operationalDayId;
  final String createdBy;

  /// SHA-256 of the gauge photo blob (optional — captured by image_picker).
  final String? gaugePhotoBlobSha256;
  final String? notes;
}

class EquipmentRefuelRepository extends AppendOnlyRepository<EquipmentRefuel> {
  final List<EquipmentRefuel> _rows = <EquipmentRefuel>[];

  @override
  Future<void> appendLocal(EquipmentRefuel entity) async {
    _rows.add(entity);
  }

  @override
  Future<List<EquipmentRefuel>> listPendingSync() async =>
      _rows.where((r) => r.pendingSync).toList(growable: false);

  @override
  Future<EquipmentRefuel?> findById(String id) async {
    for (final r in _rows) {
      if (r.id == id) return r;
    }
    return null;
  }

  @override
  Future<List<EquipmentRefuel>> listForOperationalDay(
    String operationalDayId,
  ) async =>
      _rows
          .where((r) => r.operationalDayId == operationalDayId)
          .toList(growable: false);

  /// Returns the most recent refuel for a given equipment (for hour meter validation).
  Future<EquipmentRefuel?> latestForEquipment(String equipmentId) async {
    final matching =
        _rows.where((r) => r.equipmentId == equipmentId).toList();
    if (matching.isEmpty) return null;
    matching.sort((a, b) => b.createdAtLocal.compareTo(a.createdAtLocal));
    return matching.first;
  }
}

final equipmentRefuelRepositoryProvider =
    Provider<EquipmentRefuelRepository>((ref) => EquipmentRefuelRepository());
