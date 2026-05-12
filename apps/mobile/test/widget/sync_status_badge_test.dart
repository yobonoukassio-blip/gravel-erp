import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gravel_mobile/features/activity_log/sync_status_badge.dart';

void main() {
  group('SyncStatusBadge', () {
    Future<void> pumpWithState(WidgetTester tester, SyncBadgeState state) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            syncBadgeStateProvider.overrideWith(
              (ref) => Stream<SyncBadgeState>.value(state),
            ),
          ],
          child: const MaterialApp(
            home: Scaffold(body: SyncStatusBadge()),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('renders cloud_done when synced', (tester) async {
      await pumpWithState(tester, SyncBadgeState.synced);
      expect(find.byKey(const ValueKey('sync-badge-synced')), findsOneWidget);
      expect(find.byIcon(Icons.cloud_done), findsOneWidget);
    });

    testWidgets('renders cloud_upload when pending', (tester) async {
      await pumpWithState(tester, SyncBadgeState.pending);
      expect(find.byKey(const ValueKey('sync-badge-pending')), findsOneWidget);
      expect(find.byIcon(Icons.cloud_upload), findsOneWidget);
    });

    testWidgets('renders cloud_off when error', (tester) async {
      await pumpWithState(tester, SyncBadgeState.error);
      expect(find.byKey(const ValueKey('sync-badge-error')), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off), findsOneWidget);
    });
  });
}
