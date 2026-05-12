// WeighingTicket local repository — extends AppendOnlyRepository (W0).
//
// TRP-02 contract: only insert. Corrections land as NEW rows referencing
// the original via `correctsTicketId` (Phase 3 WEIGHING_TICKET_CORRECTED).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/sync/append_only_repository.dart';

class WeighingTicket implements SyncEntity {
  WeighingTicket({
    required this.id,
    required this.tenantId,
    required this.siteId,
    required this.ticketNumber,
    required this.grossKg,
    required this.tareKg,
    required this.truckEquipmentId,
    required this.driverId,
    required this.materialType,
    required this.weighedAtLocal,
    required this.ianaTimezone,
    required this.operationalDayId,
    required this.weighingStationCode,
    required this.contentHash,
    required this.createdAtLocal,
    this.clientSignatureBlobSha256,
    this.driverSignatureBlobSha256,
    this.notes,
    this.isOfflineGenerated = true,
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
  final String ticketNumber;
  final int grossKg;
  final int tareKg;
  int get netKg => grossKg - tareKg;
  final String truckEquipmentId;
  final String driverId;
  final String materialType;
  final DateTime weighedAtLocal;
  final String operationalDayId;
  final String weighingStationCode;
  final String? clientSignatureBlobSha256;
  final String? driverSignatureBlobSha256;
  final String? notes;
  final bool isOfflineGenerated;
  final String contentHash;
}

/// In-memory implementation. Wired against Drift in a follow-up codegen
/// task (same as drilled-hole repo W1-P02).
class WeighingTicketRepository extends AppendOnlyRepository<WeighingTicket> {
  final List<WeighingTicket> _rows = <WeighingTicket>[];

  @override
  Future<void> appendLocal(WeighingTicket entity) async {
    _rows.add(entity);
  }

  @override
  Future<List<WeighingTicket>> listPendingSync() async =>
      _rows.where((r) => r.pendingSync).toList(growable: false);

  @override
  Future<WeighingTicket?> findById(String id) async {
    for (final r in _rows) {
      if (r.id == id) return r;
    }
    return null;
  }

  @override
  Future<List<WeighingTicket>> listForOperationalDay(
    String operationalDayId,
  ) async =>
      _rows
          .where((r) => r.operationalDayId == operationalDayId)
          .toList(growable: false);
}

final weighingTicketRepositoryProvider =
    Provider<WeighingTicketRepository>((ref) => WeighingTicketRepository());
