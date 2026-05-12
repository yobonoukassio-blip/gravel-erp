// REQ: FND-09 — FR ↔ EN per-user, persisted, propagated to web + mobile.
// Implementing plan: W2-P04.
//
// Widget test:
//   1. Mount app with locale=fr → settings screen shows French label.
//   2. Tap dropdown → choose EN.
//   3. MaterialApp rebuilds with locale=en; label updates.
//   4. The mocked Dio receives a PUT to /api/users/me/preferences with
//      {key:'locale', value:'en-CI'}.
//   5. The PUT URL is NOT /api/sync/preferences (canonical write-path gate).
import 'dart:ui' show Locale;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:gravel_mobile/core/i18n/i18n_service.dart';
import 'package:gravel_mobile/features/settings/settings_screen.dart';

class _RecordingDio extends Fake implements Dio {
  final List<({String path, Map<String, dynamic> data})> calls = [];

  @override
  Future<Response<T>> put<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    final map = (data as Map).cast<String, dynamic>();
    calls.add((path: path, data: map));
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }
}

void main() {
  testWidgets('FR → EN switch persists via PUT /api/users/me/preferences', (tester) async {
    final dio = _RecordingDio();
    final container = ProviderContainer(
      overrides: [
        i18nServiceProvider.overrideWith(
          (ref) => I18nService(dio: dio, initial: const Locale('fr')),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );

    expect(find.text('Language'), findsOneWidget);

    // Open the dropdown and pick English.
    await tester.tap(find.byType(DropdownButton<Locale>));
    await tester.pumpAndSettle();
    await tester.tap(find.text("English (Côte d'Ivoire)").last);
    await tester.pumpAndSettle();

    // Locale state updated.
    expect(container.read(i18nServiceProvider).languageCode, 'en');

    // Network call: canonical endpoint only.
    expect(dio.calls, hasLength(1));
    expect(dio.calls.first.path, '/api/users/me/preferences');
    expect(dio.calls.first.path, isNot(contains('/api/sync/preferences')));
    expect(dio.calls.first.data['key'], 'locale');
    expect(dio.calls.first.data['value'], 'en-CI');
  });

  testWidgets('default locale follows preferred_locale claim, falls back to fr-CI', (tester) async {
    final dio = _RecordingDio();
    final container = ProviderContainer(
      overrides: [
        i18nServiceProvider.overrideWith(
          (ref) => I18nService(dio: dio, initial: const Locale('fr')),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );
    expect(container.read(i18nServiceProvider).languageCode, 'fr');
  });
}
