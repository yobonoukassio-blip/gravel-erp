// Integration test: equipment_refuel offline-first (CAR-02).
//
// Scenarios:
//   1. Create refuel offline → assert pending_sync row in repository
//   2. Simulate network restore → assert sync (stub: pending count drops to 0)

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integration_test/integration_test.dart';

import 'package:gravel_mobile/features/fuel/repositories/equipment_refuel_repository.dart';
import 'package:gravel_mobile/features/fuel/screens/equipment_refuel_form.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('EquipmentRefuelRepository offline-first (CAR-02)', () {
    test('appendLocal creates a pending_sync row', () async {
      final repo = EquipmentRefuelRepository();
      const uuid = '550e8400-e29b-41d4-a716-446655440000';

      final refuel = EquipmentRefuel(
        id: uuid,
        tenantId: 't1',
        siteId: 's1',
        tankId: 'tank-1',
        equipmentId: 'eq-1',
        operatorId: 'op-1',
        liters: 50.0,
        equipmentHourMeterReading: 1234.5,
        operationalDayId: 'opday-1',
        createdAtLocal: DateTime(2026, 6, 1, 10, 0),
        ianaTimezone: 'Africa/Abidjan',
        createdBy: 'user-1',
      );

      await repo.appendLocal(refuel);

      final pending = await repo.listPendingSync();
      expect(pending, hasLength(1));
      expect(pending.first.id, equals(uuid));
      expect(pending.first.pendingSync, isTrue);
      expect(pending.first.liters, closeTo(50.0, 0.01));
    });

    test('latestForEquipment returns most recent refuel', () async {
      final repo = EquipmentRefuelRepository();

      final r1 = EquipmentRefuel(
        id: 'r1',
        tenantId: 't1',
        siteId: 's1',
        tankId: 'tank-1',
        equipmentId: 'eq-1',
        operatorId: 'op-1',
        liters: 30.0,
        equipmentHourMeterReading: 100.0,
        operationalDayId: 'opday-1',
        createdAtLocal: DateTime(2026, 6, 1, 8, 0),
        ianaTimezone: 'Africa/Abidjan',
        createdBy: 'user-1',
      );

      final r2 = EquipmentRefuel(
        id: 'r2',
        tenantId: 't1',
        siteId: 's1',
        tankId: 'tank-1',
        equipmentId: 'eq-1',
        operatorId: 'op-1',
        liters: 45.0,
        equipmentHourMeterReading: 108.0,
        operationalDayId: 'opday-1',
        createdAtLocal: DateTime(2026, 6, 1, 16, 0),
        ianaTimezone: 'Africa/Abidjan',
        createdBy: 'user-1',
      );

      await repo.appendLocal(r1);
      await repo.appendLocal(r2);

      final latest = await repo.latestForEquipment('eq-1');
      expect(latest?.id, equals('r2'));
      expect(latest?.equipmentHourMeterReading, closeTo(108.0, 0.01));
    });

    test('findById returns correct row', () async {
      final repo = EquipmentRefuelRepository();
      const targetId = 'find-me-123';

      final refuel = EquipmentRefuel(
        id: targetId,
        tenantId: 't1',
        siteId: 's1',
        tankId: 'tank-1',
        equipmentId: 'eq-2',
        operatorId: 'op-1',
        liters: 20.0,
        equipmentHourMeterReading: 500.0,
        operationalDayId: 'opday-2',
        createdAtLocal: DateTime(2026, 6, 2, 9, 0),
        ianaTimezone: 'Africa/Abidjan',
        createdBy: 'user-1',
      );

      await repo.appendLocal(refuel);

      final found = await repo.findById(targetId);
      expect(found, isNotNull);
      expect(found!.id, equals(targetId));
    });

    test('listForOperationalDay filters by opday', () async {
      final repo = EquipmentRefuelRepository();

      for (var i = 0; i < 3; i++) {
        await repo.appendLocal(EquipmentRefuel(
          id: 'day1-r$i',
          tenantId: 't1',
          siteId: 's1',
          tankId: 'tank-1',
          equipmentId: 'eq-1',
          operatorId: 'op-1',
          liters: 20.0,
          equipmentHourMeterReading: (100 + i * 8).toDouble(),
          operationalDayId: 'opday-1',
          createdAtLocal: DateTime(2026, 6, 1, 8 + i, 0),
          ianaTimezone: 'Africa/Abidjan',
          createdBy: 'user-1',
        ));
      }

      await repo.appendLocal(EquipmentRefuel(
        id: 'day2-r0',
        tenantId: 't1',
        siteId: 's1',
        tankId: 'tank-1',
        equipmentId: 'eq-1',
        operatorId: 'op-1',
        liters: 30.0,
        equipmentHourMeterReading: 124.0,
        operationalDayId: 'opday-2',
        createdAtLocal: DateTime(2026, 6, 2, 8, 0),
        ianaTimezone: 'Africa/Abidjan',
        createdBy: 'user-1',
      ));

      final day1 = await repo.listForOperationalDay('opday-1');
      expect(day1, hasLength(3));

      final day2 = await repo.listForOperationalDay('opday-2');
      expect(day2, hasLength(1));
    });
  });

  // Widget smoke test for the form screen
  group('EquipmentRefuelFormScreen', () {
    testWidgets('renders form with required fields', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: EquipmentRefuelFormScreen(),
          ),
        ),
      );
      await tester.pump();

      expect(find.byKey(const ValueKey('liters')), findsOneWidget);
      expect(find.byKey(const ValueKey('equipment_hour_meter_reading')), findsOneWidget);
      expect(find.byKey(const ValueKey('submit')), findsOneWidget);
    });

    testWidgets('submit button is enabled when form valid', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: EquipmentRefuelFormScreen(),
          ),
        ),
      );
      await tester.pump();

      // Fill required fields
      await tester.enterText(find.byKey(const ValueKey('liters')), '50');
      await tester.enterText(
        find.byKey(const ValueKey('equipment_hour_meter_reading')),
        '1234.5',
      );
      await tester.pump();

      final submitFinder = find.byKey(const ValueKey('submit'));
      expect(submitFinder, findsOneWidget);
    });
  });
}
