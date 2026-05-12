// REQ: EXT-01 — Mobile capture offline du cycle d'extraction.
// Source: 02-W1-P03 / D2-20 / D2-21.
//
// End-to-end: launches the ExtractionCycleForm widget, fills it out, taps
// the immutability-confirmation dialog, and asserts that a `pending_sync`
// row lands in the local sqlite store.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gravel_mobile/features/extraction/repositories/extraction_cycle_repository.dart';
import 'package:gravel_mobile/features/extraction/screens/extraction_cycle_form.dart';
import 'package:integration_test/integration_test.dart';
import 'package:sqlite_async/sqlite_async.dart';

const _tenantId = '11111111-1111-1111-1111-111111111111';
const _siteId = '22222222-2222-2222-2222-222222222222';
const _dayId = '33333333-3333-3333-3333-333333333333';
const _operatorId = '44444444-4444-4444-4444-444444444444';
const _equipmentId = '55555555-5555-5555-5555-555555555555';
const _benchId = '66666666-6666-6666-6666-666666666666';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late SqliteDatabase db;
  late ExtractionCycleRepository repo;

  setUp(() async {
    // In-memory sqlite_async database; the form writes through the same
    // path as in production (no Drift in this feature module).
    db = SqliteDatabase(path: ':memory:');
    repo = ExtractionCycleRepository(db: db);
    await repo.ensureSchema();
  });

  tearDown(() async {
    await db.close();
  });

  testWidgets(
    'EXT-01: operator submits an extraction cycle offline → pending_sync row appears',
    (tester) async {
      String? submittedId;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            extractionCycleRepositoryProvider.overrideWithValue(repo),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: ExtractionCycleForm(
                tenantId: _tenantId,
                siteId: _siteId,
                operationalDayId: _dayId,
                operatorId: _operatorId,
                ianaTimezone: 'Africa/Abidjan',
                activeEquipmentIds: const [_equipmentId],
                activeBenchIds: const [_benchId],
                onSubmitted: (id) => submittedId = id,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Fill the estimated tonnage field.
      await tester.enterText(
        find.byKey(const ValueKey('extraction-tonnage')),
        '50.0',
      );
      await tester.pumpAndSettle();

      // Tap submit → confirmation dialog appears (immutability gate D2-20).
      await tester.tap(find.byKey(const ValueKey('extraction-submit')));
      await tester.pumpAndSettle();

      // Confirm.
      await tester.tap(
        find.byKey(const ValueKey('extraction-confirm-immutable')),
      );
      await tester.pumpAndSettle();

      // The repo handed back an id.
      expect(submittedId, isNotNull,
          reason: 'form should have inserted a cycle');

      // Direct DB assertion: exactly 1 pending_sync row, with our inputs.
      final pendingCount = await repo.countPending();
      expect(pendingCount, 1, reason: 'pending_sync row must be present');

      final rows = await repo.listPendingSync();
      expect(rows, hasLength(1));
      final row = rows.first;
      expect(row.syncState, 'pending');
      expect(row.tenantId, _tenantId);
      expect(row.operationalDayId, _dayId);
      expect(row.materialType, 'granite_brut');
      expect(row.estimatedTonnageT, 50.0);
      // ExtractionCycle invariants — D2-20.
      expect(row.correctsId, isNull);
      expect(row.pendingSync, isTrue);
    },
  );

  testWidgets(
    'EXT-01: validation rejects downtime_reason without downtime_minutes',
    (tester) async {
      // Direct repo-level guard — also covered by the form via validators,
      // but asserting here keeps the test fast and deterministic.
      expect(
        () => repo.insert(NewExtractionCycleInput(
          tenantId: _tenantId,
          siteId: _siteId,
          operationalDayId: _dayId,
          benchId: _benchId,
          equipmentId: _equipmentId,
          operatorId: _operatorId,
          materialType: 'granite_brut',
          estimatedTonnageT: 50,
          cycleStartedAtLocal: DateTime(2026, 5, 12, 8),
          cycleEndedAtLocal: DateTime(2026, 5, 12, 10),
          ianaTimezone: 'Africa/Abidjan',
          downtimeMinutes: null,
          downtimeReasonCode: 'meal_break',
          createdBy: _operatorId,
        )),
        throwsA(isA<ArgumentError>()),
      );
    },
  );
}
