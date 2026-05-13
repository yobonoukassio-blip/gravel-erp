// Integration test for ShiftEntry offline flow (RH-02).
// 4 assertions per PLAN.md:
//   1. Create shift_entry row offline → pending_sync = true, check_out_utc = null
//   2. Assert row has pending_sync = true and check_out_utc = null
//   3. Simulate check-out → assert check_out_utc != null and pending_sync = true
//   4. Assert listForOperationalDay returns 1 row

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../lib/features/rh/repositories/shift_entry_repository.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('ShiftEntry offline flow (RH-02)', () {
    late ShiftEntryRepository repo;

    setUp(() {
      repo = ShiftEntryRepository();
    });

    test('1 & 2. create shift entry offline → pending_sync=true, check_out_utc=null', () async {
      final entry = ShiftEntry(
        id: repo.newId(),
        tenantId: 'tenant-test',
        siteId: 'site-test',
        operationalDayId: 'opday-test-001',
        employeeId: 'emp-test-001',
        checkInUtc: DateTime.now().toUtc(),
        supervisorId: 'sup-test-001',
        createdAtLocal: DateTime.now(),
        ianaTimezone: 'Africa/Abidjan',
        pendingSync: true,
      );

      await repo.appendLocal(entry);

      final found = await repo.findById(entry.id);
      expect(found, isNotNull);

      // Assertion 1: row exists
      expect(found!.id, equals(entry.id));
      // Assertion 2: pending_sync = true and check_out_utc = null (offline row)
      expect(found.pendingSync, isTrue);
      expect(found.checkOutUtc, isNull);
    });

    test('3. simulate check-out update → check_out_utc != null, pending_sync = true', () async {
      final originalId = repo.newId();
      final original = ShiftEntry(
        id: originalId,
        tenantId: 'tenant-test',
        siteId: 'site-test',
        operationalDayId: 'opday-test-001',
        employeeId: 'emp-test-001',
        checkInUtc: DateTime.now().toUtc(),
        supervisorId: 'sup-test-001',
        createdAtLocal: DateTime.now(),
        ianaTimezone: 'Africa/Abidjan',
        pendingSync: true,
      );
      await repo.appendLocal(original);

      final checkOutTime = DateTime.now().toUtc().add(const Duration(hours: 8));
      final checkOutRow = await repo.recordCheckOut(originalId, checkOutTime);

      // Assertion 3: check_out_utc is populated
      expect(checkOutRow.checkOutUtc, isNotNull);
      expect(checkOutRow.pendingSync, isTrue);
      expect(checkOutRow.supersedesId, equals(originalId));
    });

    test('4. listForOperationalDay returns the created entry', () async {
      const opDayId = 'opday-test-002';
      final entry = ShiftEntry(
        id: repo.newId(),
        tenantId: 'tenant-test',
        siteId: 'site-test',
        operationalDayId: opDayId,
        employeeId: 'emp-test-001',
        checkInUtc: DateTime.now().toUtc(),
        supervisorId: 'sup-test-001',
        createdAtLocal: DateTime.now(),
        ianaTimezone: 'Africa/Abidjan',
        pendingSync: true,
      );
      await repo.appendLocal(entry);

      final list = await repo.listForOperationalDay(opDayId);

      // Assertion 4: exactly 1 row for this operational day
      expect(list.length, equals(1));
      expect(list.first.operationalDayId, equals(opDayId));
    });
  });
}
