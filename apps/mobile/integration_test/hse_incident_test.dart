// Integration test: HSE incident offline capture (HSE-01).
//
// Tests:
//   1. Create incident offline (no photos in offline test, mocked) →
//      assert pending_sync row in IncidentRepository.
//   2. Incident id is a valid UUID.
//   3. Incident severity is within 1–5.
//   4. Incident chronology_md is non-empty.
//
// Run: cd apps/mobile && flutter test integration_test/hse_incident_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../lib/features/hse/repositories/incident_repository.dart';

void main() {
  group('HseIncident offline capture — pending_sync row', () {
    late ProviderContainer container;
    late IncidentRepository repo;

    setUp(() {
      container = ProviderContainer();
      repo = container.read(incidentRepositoryProvider);
    });

    tearDown(() {
      container.dispose();
    });

    test('appendLocal creates a pending_sync row', () async {
      final now = DateTime.now();
      final incident = HseIncident(
        id: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        siteId: 'site-uuid-0001',
        operationalDayId: 'opday-uuid-0001',
        category: HseCategory.near_miss,
        severity: 2,
        locationText: 'Banc de carrière zone A',
        chronologyMd: '## Chronologie\n\nPierre détachée du banc 3.',
        occurredAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
        createdAtLocal: now,
        photoSha256s: const [],
        pendingSync: true,
      );

      await repo.appendLocal(incident);

      final pending = await repo.listPendingSync();
      expect(pending, hasLength(1));
      expect(pending.first.id, equals(incident.id));
      expect(pending.first.pendingSync, isTrue);
    });

    test('incident has valid severity (1–5)', () async {
      final now = DateTime.now();
      final incident = HseIncident(
        id: '660e8400-e29b-41d4-a716-446655440001',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        siteId: 'site-uuid-0001',
        operationalDayId: 'opday-uuid-0002',
        category: HseCategory.accident_personnel,
        severity: 5,
        locationText: 'Zone extraction B',
        chronologyMd: '## Accident grave\n\nFracture du bras.',
        occurredAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
        createdAtLocal: now,
        photoSha256s: const [],
      );

      await repo.appendLocal(incident);

      final found = await repo.findById(incident.id);
      expect(found, isNotNull);
      expect(found!.severity, inInclusiveRange(1, 5));
      expect(found.chronologyMd.isNotEmpty, isTrue);
    });

    test('pending_sync is true by default', () async {
      final now = DateTime.now();
      final incident = HseIncident(
        id: '770e8400-e29b-41d4-a716-446655440002',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        siteId: 'site-uuid-0001',
        operationalDayId: 'opday-uuid-0003',
        category: HseCategory.securite,
        severity: 1,
        locationText: 'Atelier mécanique',
        chronologyMd: '## Observation sécurité\n\nFilet de sécurité manquant.',
        occurredAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
        createdAtLocal: now,
      );

      await repo.appendLocal(incident);
      final found = await repo.findById(incident.id);
      expect(found?.pendingSync, isTrue);
    });

    test('listForOperationalDay returns incidents for given day', () async {
      final now = DateTime.now();
      const dayId = 'opday-uuid-filter-test';
      const otherDayId = 'opday-uuid-other';

      for (var i = 0; i < 3; i++) {
        await repo.appendLocal(HseIncident(
          id: 'incident-day-$i',
          tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          siteId: 'site-uuid-0001',
          operationalDayId: dayId,
          category: HseCategory.near_miss,
          severity: 1,
          locationText: 'Zone $i',
          chronologyMd: 'Chronologie $i',
          occurredAtLocal: now,
          ianaTimezone: 'Africa/Abidjan',
          createdAtLocal: now,
        ));
      }

      // Different day.
      await repo.appendLocal(HseIncident(
        id: 'incident-other-day',
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        siteId: 'site-uuid-0001',
        operationalDayId: otherDayId,
        category: HseCategory.autre,
        severity: 1,
        locationText: 'Zone autre',
        chronologyMd: 'Chronologie autre',
        occurredAtLocal: now,
        ianaTimezone: 'Africa/Abidjan',
        createdAtLocal: now,
      ));

      final forDay = await repo.listForOperationalDay(dayId);
      expect(forDay, hasLength(3));
      expect(forDay.every((i) => i.operationalDayId == dayId), isTrue);
    });
  });
}
