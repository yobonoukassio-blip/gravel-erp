import 'package:drift/drift.dart';

// ---------------------------------------------------------------------------
// BlastCharge local model (SQLite / Drift offline-first)
// ---------------------------------------------------------------------------

/// Represents a single hole-loading charge entry, captured offline.
/// Sync strategy: append_only_event — PowerSync pushes to backend.
/// No update or delete exposed (mirrors blast_charge append-only constraint).
class BlastCharge {
  final String id;
  final String blastPlanId;
  final String holeId;
  final String productType;
  final int plannedQtyG;
  final int actualQtyG;
  final String? detonatorSerial;
  final String operatorId;
  final DateTime occurredAtUtc;
  final bool pendingSync;

  const BlastCharge({
    required this.id,
    required this.blastPlanId,
    required this.holeId,
    required this.productType,
    required this.plannedQtyG,
    required this.actualQtyG,
    this.detonatorSerial,
    required this.operatorId,
    required this.occurredAtUtc,
    this.pendingSync = true,
  });

  double get variancePct {
    if (plannedQtyG == 0) return 0.0;
    return ((actualQtyG - plannedQtyG) / plannedQtyG) * 100.0;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'blast_plan_id': blastPlanId,
        'hole_id': holeId,
        'product_type': productType,
        'planned_qty_g': plannedQtyG,
        'actual_qty_g': actualQtyG,
        'detonator_serial': detonatorSerial,
        'operator_id': operatorId,
        'occurred_at_utc': occurredAtUtc.toIso8601String(),
        'pending_sync': pendingSync,
      };

  BlastCharge copyWith({bool? pendingSync}) => BlastCharge(
        id: id,
        blastPlanId: blastPlanId,
        holeId: holeId,
        productType: productType,
        plannedQtyG: plannedQtyG,
        actualQtyG: actualQtyG,
        detonatorSerial: detonatorSerial,
        operatorId: operatorId,
        occurredAtUtc: occurredAtUtc,
        pendingSync: pendingSync ?? this.pendingSync,
      );
}

// ---------------------------------------------------------------------------
// AppendOnlyRepository contract (mirrors W0-P01 ShiftEntryRepository pattern)
// ---------------------------------------------------------------------------

/// Append-only repository for blast charges.
/// Implements the AppendOnlyRepository<BlastCharge> contract.
/// No update or delete methods exposed.
class BlastChargeRepository {
  // In production this is backed by PowerSync's SQLite store via Drift.
  // For offline-first tests we use an in-memory list.
  final List<BlastCharge> _store = [];

  /// Append a new blast charge row.
  /// Sets pending_sync = true (PowerSync will sync when connectivity returns).
  Future<BlastCharge> append({
    required String id,
    required String blastPlanId,
    required String holeId,
    required String productType,
    required int plannedQtyG,
    required int actualQtyG,
    String? detonatorSerial,
    required String operatorId,
    DateTime? occurredAtUtc,
  }) async {
    final charge = BlastCharge(
      id: id,
      blastPlanId: blastPlanId,
      holeId: holeId,
      productType: productType,
      plannedQtyG: plannedQtyG,
      actualQtyG: actualQtyG,
      detonatorSerial: detonatorSerial,
      operatorId: operatorId,
      occurredAtUtc: occurredAtUtc ?? DateTime.now().toUtc(),
      pendingSync: true,
    );
    _store.add(charge);
    return charge;
  }

  /// Returns all blast charges for a given blast plan.
  Future<List<BlastCharge>> listForBlastPlan(String blastPlanId) async {
    return _store
        .where((c) => c.blastPlanId == blastPlanId)
        .toList();
  }

  /// Find by detonator serial number.
  Future<BlastCharge?> findByDetonatorSerial(String serial) async {
    try {
      return _store.firstWhere((c) => c.detonatorSerial == serial);
    } catch (_) {
      return null;
    }
  }

  /// Count pending (unsynced) rows.
  Future<int> countPendingSync() async {
    return _store.where((c) => c.pendingSync).length;
  }

  // NOTE: No update() or delete() — blast_charge is append-only.
}
