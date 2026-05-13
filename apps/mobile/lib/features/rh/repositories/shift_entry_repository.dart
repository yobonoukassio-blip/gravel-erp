// ShiftEntry local repository (RH-02). Append-only.
// Implements AppendOnlyRepository<ShiftEntry> for PowerSync sync.
// Sync strategy: append_only_event (same as DrilledHole, HseIncident).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/sync/append_only_repository.dart';

/// A shift entry submitted by a supervisor for an employee (RH-02).
class ShiftEntry implements SyncEntity {
  ShiftEntry({
    required this.id,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
    required this.employeeId,
    required this.checkInUtc,
    required this.supervisorId,
    required this.createdAtLocal,
    required this.ianaTimezone,
    this.checkOutUtc,
    this.positionCode,
    this.supersedesId,
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
  final String employeeId;
  final DateTime checkInUtc;
  final String supervisorId;

  /// Null until check-out is recorded (creates a new superseding entry).
  final DateTime? checkOutUtc;

  final String? positionCode;

  /// Points to the shift_entry this row supersedes (check-out correction).
  final String? supersedesId;

  Map<String, dynamic> toJson() => {
        'id': id,
        'tenant_id': tenantId,
        'site_id': siteId,
        'operational_day_id': operationalDayId,
        'employee_id': employeeId,
        'check_in_utc': checkInUtc.toUtc().toIso8601String(),
        if (checkOutUtc != null)
          'check_out_utc': checkOutUtc!.toUtc().toIso8601String(),
        if (positionCode != null) 'position_code': positionCode,
        'supervisor_id': supervisorId,
        if (supersedesId != null) 'supersedes_id': supersedesId,
      };

  /// Create a copy with check-out filled in.
  /// Returns a NEW ShiftEntry — does not mutate the original (immutability pattern).
  ShiftEntry withCheckOut(DateTime checkOut) => ShiftEntry(
        id: id,
        tenantId: tenantId,
        siteId: siteId,
        operationalDayId: operationalDayId,
        employeeId: employeeId,
        checkInUtc: checkInUtc,
        checkOutUtc: checkOut,
        positionCode: positionCode,
        supervisorId: supervisorId,
        supersedesId: supersedesId,
        createdAtLocal: createdAtLocal,
        ianaTimezone: ianaTimezone,
        pendingSync: true,
      );
}

/// ShiftEntry repository — append-only (RH-02).
///
/// Does NOT expose update() or delete(). Use [recordCheckOut] to add a
/// superseding entry when the employee leaves.
class ShiftEntryRepository extends AppendOnlyRepository<ShiftEntry> {
  final List<ShiftEntry> _rows = <ShiftEntry>[];

  @override
  Future<void> appendLocal(ShiftEntry entity) async {
    _rows.add(entity);
  }

  @override
  Future<List<ShiftEntry>> listPendingSync() async =>
      _rows.where((r) => r.pendingSync).toList(growable: false);

  @override
  Future<ShiftEntry?> findById(String id) async {
    for (final r in _rows) {
      if (r.id == id) return r;
    }
    return null;
  }

  @override
  Future<List<ShiftEntry>> listForOperationalDay(
    String operationalDayId,
  ) async =>
      _rows
          .where((r) => r.operationalDayId == operationalDayId)
          .toList(growable: false);

  /// Record check-out: creates a new superseding ShiftEntry row in local
  /// SQLite with check_out_utc filled in and supersedes_id set to [id].
  ///
  /// The original row remains unchanged (append-only contract).
  Future<ShiftEntry> recordCheckOut(String id, DateTime checkOutUtc) async {
    final original = await findById(id);
    if (original == null) {
      throw StateError('ShiftEntry $id not found in local cache.');
    }

    final correction = ShiftEntry(
      id: newId(),
      tenantId: original.tenantId,
      siteId: original.siteId,
      operationalDayId: original.operationalDayId,
      employeeId: original.employeeId,
      checkInUtc: original.checkInUtc,
      checkOutUtc: checkOutUtc,
      positionCode: original.positionCode,
      supervisorId: original.supervisorId,
      supersedesId: id,
      createdAtLocal: DateTime.now(),
      ianaTimezone: original.ianaTimezone,
      pendingSync: true,
    );

    await appendLocal(correction);
    return correction;
  }
}

final shiftEntryRepositoryProvider =
    Provider<ShiftEntryRepository>((ref) => ShiftEntryRepository());
