// HseIncident local repository (HSE-01). Append-only.
// Implements AppendOnlyRepository<HseIncident> for PowerSync sync.

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/sync/append_only_repository.dart';

/// Severity 1–5 per ADR-0008.
typedef HseSeverity = int;

/// HSE incident category (mirrors HseCategory on backend).
enum HseCategory {
  accident_personnel,
  accident_materiel,
  near_miss,
  environnement,
  securite,
  autre,
}

/// A single person impacted by an incident.
class PersonImpacted {
  const PersonImpacted({
    this.employeeId,
    this.name,
    this.injuryType,
    this.bodyPart,
    required this.lostTimeH,
  });

  final String? employeeId;
  final String? name;
  final String? injuryType;
  final String? bodyPart;
  final double lostTimeH;

  Map<String, dynamic> toJson() => {
        if (employeeId != null) 'employee_id': employeeId,
        if (name != null) 'name': name,
        if (injuryType != null) 'injury_type': injuryType,
        if (bodyPart != null) 'body_part': bodyPart,
        'lost_time_h': lostTimeH,
      };
}

/// HseIncident — local model for mobile append-only submission (HSE-01, D2-60).
///
/// Immutable after creation. "Corrections" must be submitted as new incidents
/// carrying `appendsToIncidentId` (HSE_INCIDENT_CHRONOLOGY_APPENDED pattern).
class HseIncident implements SyncEntity {
  HseIncident({
    required this.id,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
    required this.category,
    required this.severity,
    required this.locationText,
    required this.chronologyMd,
    required this.occurredAtLocal,
    required this.ianaTimezone,
    required this.createdAtLocal,
    this.gpsLatitude,
    this.gpsLongitude,
    this.peopleImpacted = const [],
    this.equipmentImpactedIds = const [],
    this.photoSha256s = const [],
    this.pendingSync = true,
  }) : assert(severity >= 1 && severity <= 5, 'severity must be 1–5');

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
  final HseCategory category;
  final HseSeverity severity;
  final String locationText;
  final String chronologyMd;
  final DateTime occurredAtLocal;
  final double? gpsLatitude;
  final double? gpsLongitude;
  final List<PersonImpacted> peopleImpacted;
  final List<String> equipmentImpactedIds;

  /// SHA-256 hex strings of photos uploaded to S3 Object Lock bucket.
  final List<String> photoSha256s;

  /// Serialise to JSON for PowerSync sync queue.
  Map<String, dynamic> toJson() => {
        'id': id,
        'tenant_id': tenantId,
        'site_id': siteId,
        'operational_day_id': operationalDayId,
        'category': category.name,
        'severity': severity,
        'location_text': locationText,
        'chronology_md': chronologyMd,
        'occurred_at_local': occurredAtLocal.toIso8601String(),
        'iana_timezone': ianaTimezone,
        'occurred_at_utc': occurredAtLocal.toUtc().toIso8601String(),
        'people_impacted': peopleImpacted.map((p) => p.toJson()).toList(),
        'equipment_impacted_ids': equipmentImpactedIds,
        'content_addressed_attachments': photoSha256s,
        if (gpsLatitude != null && gpsLongitude != null)
          'gps_point': 'POINT($gpsLongitude $gpsLatitude)',
      };
}

class IncidentRepository extends AppendOnlyRepository<HseIncident> {
  final List<HseIncident> _rows = <HseIncident>[];

  @override
  Future<void> appendLocal(HseIncident entity) async {
    _rows.add(entity);
  }

  @override
  Future<List<HseIncident>> listPendingSync() async =>
      _rows.where((r) => r.pendingSync).toList(growable: false);

  @override
  Future<HseIncident?> findById(String id) async {
    for (final r in _rows) {
      if (r.id == id) return r;
    }
    return null;
  }

  @override
  Future<List<HseIncident>> listForOperationalDay(
    String operationalDayId,
  ) async =>
      _rows
          .where((r) => r.operationalDayId == operationalDayId)
          .toList(growable: false);
}

final incidentRepositoryProvider =
    Provider<IncidentRepository>((ref) => IncidentRepository());
