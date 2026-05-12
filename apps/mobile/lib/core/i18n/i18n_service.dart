import 'dart:ui' show Locale;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/oidc_config.dart';

/// Active locale notifier. The canonical write path is
/// `PUT /api/users/me/preferences` (W2-P04 NestJS endpoint).
///
/// We do NOT call `/api/sync/preferences` here — that is W2-P03's
/// sync-replica path and is reconciled via CDC. The canonical source
/// of truth is `users.preferred_locale`.
class I18nService extends StateNotifier<Locale> {
  I18nService({Dio? dio, Locale initial = const Locale('fr')})
      : _dio = dio ?? Dio(BaseOptions(baseUrl: OidcConfig.apiBaseUrl)),
        super(initial);

  final Dio _dio;

  /// Setter used by the settings screen. Persists locally and to the API.
  Future<void> setLocale(Locale next) async {
    state = next;
    final tag = next.languageCode == 'en' ? 'en-CI' : 'fr-CI';
    await _dio.put(
      '/api/users/me/preferences',
      data: {'key': 'locale', 'value': tag},
    );
  }
}

/// Riverpod provider — overridden in tests with a mock Dio.
final i18nServiceProvider = StateNotifierProvider<I18nService, Locale>(
  (ref) => I18nService(),
);
