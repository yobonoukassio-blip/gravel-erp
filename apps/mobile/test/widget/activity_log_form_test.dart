// Widget tests for ActivityLogForm. Source: W2-P03-T02.
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gravel_mobile/core/db/database.dart';
import 'package:gravel_mobile/features/activity_log/activity_log_form.dart';
import 'package:gravel_mobile/features/activity_log/activity_log_repository.dart';

class _CounterIdGenerator implements IdGenerator {
  int _i = 0;
  @override
  String newUuid() {
    _i++;
    return '00000000-0000-0000-0000-${_i.toString().padLeft(12, '0')}';
  }
}

void main() {
  group('ActivityLogForm', () {
    late AppDatabase db;
    late ActivityLogRepository repo;

    setUp(() {
      // In-memory Drift for tests — no PowerSync needed for unit/widget tier.
      db = AppDatabase.fromExecutor(NativeDatabase.memory());
      repo = ActivityLogRepository(
        db: db,
        clientId: 'test-device',
        idGen: _CounterIdGenerator(),
      );
    });

    tearDown(() async {
      await db.close();
    });

    testWidgets('rejects empty notes', (tester) async {
      await tester.pumpWidget(_wrap(repo, _form()));
      await tester.tap(find.byKey(const ValueKey('activity-log-submit')));
      await tester.pump();
      expect(find.text('Notes are required'), findsOneWidget);
    });

    testWidgets('enforces 500-char maximum via maxLength', (tester) async {
      await tester.pumpWidget(_wrap(repo, _form()));
      final notesField = find.byKey(const ValueKey('activity-log-notes'));
      // maxLength lives on the underlying TextField, not TextFormField.
      final tf = tester.widget<TextField>(
        find.descendant(of: notesField, matching: find.byType(TextField)),
      );
      expect(tf.maxLength, 500);
    });

    testWidgets('saves a valid entry locally with sync_state=pending',
        (tester) async {
      await tester.pumpWidget(_wrap(repo, _form()));
      await tester.enterText(
        find.byKey(const ValueKey('activity-log-notes')),
        'morning shift started without incident',
      );
      await tester.tap(find.byKey(const ValueKey('activity-log-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      final rows = await db.select(db.dailyActivityLog).get();
      expect(rows, hasLength(1));
      expect(rows.first.notes, contains('morning shift'));
      expect(rows.first.syncState, 'pending');
      expect(rows.first.clientSeq, 1);
    });
  });
}

ActivityLogForm _form() => const ActivityLogForm(
      tenantId: '11111111-1111-1111-1111-111111111111',
      siteId: '22222222-2222-2222-2222-222222222222',
      authorUserId: '33333333-3333-3333-3333-333333333333',
    );

Widget _wrap(ActivityLogRepository repo, Widget child) {
  return ProviderScope(
    overrides: [
      activityLogRepositoryProvider.overrideWithValue(repo),
    ],
    child: MaterialApp(home: Scaffold(body: child)),
  );
}
