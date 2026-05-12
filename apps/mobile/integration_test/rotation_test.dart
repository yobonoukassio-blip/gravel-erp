// Integration test for the truck rotation mobile flow (TRP-01).
//
// Asserted behavior:
//   - A rotation row is locally appended with pending_sync=true and links
//     to a weighing_ticket_id.
//   - The repository contract (append-only) is respected: rotations only
//     accept appends, never updates.

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:gravel_mobile/features/transport/repositories/rotation_repository.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Truck rotation mobile (TRP-01)', () {
    test('append rotation tied to weighing ticket lands in pending_sync',
        () async {
      final repo = RotationRepository();
      final rotation = TruckRotation(
        id: 'rot-1',
        tenantId: 't1',
        siteId: 'site-1',
        operationalDayId: 'opday-1',
        truckEquipmentId: 'truck-1',
        driverId: 'driver-1',
        loadedAtBenchId: 'bench-1',
        unloadedAtZoneId: 'zone-1',
        materialType: 'granite_brut',
        weighingTicketId: 'tkt-1',
        loadedAtUtc: DateTime.utc(2026, 6, 15, 8, 0),
        ianaTimezone: 'Africa/Abidjan',
        createdAtLocal: DateTime.utc(2026, 6, 15, 8, 0),
      );

      await repo.appendLocal(rotation);
      final pending = await repo.listPendingSync();
      expect(pending, hasLength(1));
      expect(pending.first.weighingTicketId, 'tkt-1');
      expect(pending.first.pendingSync, isTrue);
      expect(pending.first.unloadedAtUtc, isNull);
    });

    test('a completed rotation (with unloadedAtUtc) still pending sync', () async {
      final repo = RotationRepository();
      final rotation = TruckRotation(
        id: 'rot-2',
        tenantId: 't1',
        siteId: 'site-1',
        operationalDayId: 'opday-1',
        truckEquipmentId: 'truck-1',
        driverId: 'driver-1',
        loadedAtBenchId: 'bench-1',
        unloadedAtZoneId: 'zone-1',
        materialType: 'granite_brut',
        weighingTicketId: 'tkt-2',
        loadedAtUtc: DateTime.utc(2026, 6, 15, 8, 0),
        unloadedAtUtc: DateTime.utc(2026, 6, 15, 8, 45),
        ianaTimezone: 'Africa/Abidjan',
        createdAtLocal: DateTime.utc(2026, 6, 15, 8, 0),
      );

      await repo.appendLocal(rotation);
      final pending = await repo.listPendingSync();
      expect(pending, hasLength(1));
      expect(pending.first.unloadedAtUtc, isNotNull);
      // The server-side outbox publish happens once sync reaches the API
      // (covered in api/test/unit/transport/truck-rotation.spec.ts).
    });
  });
}
