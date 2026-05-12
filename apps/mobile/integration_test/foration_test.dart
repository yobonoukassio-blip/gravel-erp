// Integration test for the foration mobile slice (FOR-02, D2-81, D2-12).
//
// Asserted behavior:
//   - GPS accuracy indicator renders with the correct color band
//   - In-tolerance hole submits and lands in pending_sync
//   - Out-of-tolerance hole triggers the tolerance confirmation modal
//
// Uses the in-memory DrilledHoleRepository (PowerSync-backed Drift wiring
// lands in a follow-up task once codegen is in place).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:gravel_mobile/features/foration/repositories/drilled_hole_repository.dart';
import 'package:gravel_mobile/features/foration/screens/drilled_hole_form.dart';
import 'package:gravel_mobile/features/foration/widgets/gps_accuracy_indicator.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Foration mobile (FOR-02)', () {
    late DrilledHoleRepository repo;

    setUp(() {
      repo = DrilledHoleRepository();
    });

    Widget wrap(Widget child) {
      return ProviderScope(
        overrides: [
          drilledHoleRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(home: child),
      );
    }

    testWidgets('GPS accuracy indicator turns green at 8m', (tester) async {
      await tester.pumpWidget(wrap(
        const Scaffold(body: GpsAccuracyIndicator(accuracyM: 8.0)),
      ));
      expect(find.byKey(const ValueKey('gps-accuracy-indicator')), findsOneWidget);
      expect(gpsAccuracyLevel(8.0), GpsAccuracyLevel.green);
    });

    testWidgets('in-tolerance submission lands in pending_sync', (tester) async {
      await tester.pumpWidget(wrap(
        const DrilledHoleFormScreen(planId: 'demo-plan-1'),
      ));
      await tester.pumpAndSettle();

      // Plan target = 12m / 89mm. Submit 12.0m / 89mm → no tolerance modal.
      await tester.enterText(find.byKey(const ValueKey('depth')), '12.0');
      await tester.enterText(find.byKey(const ValueKey('diameter')), '89');
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('submit')));
      await tester.pumpAndSettle();

      // Confirm "non modifiable" modal.
      expect(find.text('Une fois envoyé, non modifiable. Confirmer.'),
          findsOneWidget);
      await tester.tap(find.text('Envoyer'));
      await tester.pumpAndSettle();

      final pending = await repo.listPendingSync();
      expect(pending, hasLength(1));
      expect(pending.first.toleranceViolation, isFalse);
    });

    testWidgets('out-of-tolerance triggers tolerance confirmation modal',
        (tester) async {
      await tester.pumpWidget(wrap(
        const DrilledHoleFormScreen(planId: 'demo-plan-1'),
      ));
      await tester.pumpAndSettle();

      // Plan target = 12m. Submit 16.0m (33% deviation > 10%) → modal.
      await tester.enterText(find.byKey(const ValueKey('depth')), '16.0');
      await tester.enterText(find.byKey(const ValueKey('diameter')), '89');
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('submit')));
      await tester.pumpAndSettle();

      expect(find.text('Hors tolérance — Confirmer ?'), findsOneWidget);
      // Cancel out for the assertion — no row should be inserted yet.
      await tester.tap(find.text('Annuler'));
      await tester.pumpAndSettle();
      final pending = await repo.listPendingSync();
      expect(pending, isEmpty);
    });
  });
}
