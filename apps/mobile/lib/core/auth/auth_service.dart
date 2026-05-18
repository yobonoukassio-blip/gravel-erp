import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'oidc_config.dart';

/// Local email/password authentication mirroring the web flow.
///
/// POSTs {email, password} to `\$apiBaseUrl/api/auth/login` and stores the
/// HS256 JWT in `flutter_secure_storage` (Keychain on iOS, Keystore on Android).
/// All subsequent API calls should send the token via `Authorization: Bearer`.
class AuthService {
  AuthService({
    Dio? dio,
    FlutterSecureStorage? storage,
  })  : _dio = dio ?? Dio(BaseOptions(baseUrl: OidcConfig.apiBaseUrl)),
        _storage = storage ?? const FlutterSecureStorage();

  final Dio _dio;
  final FlutterSecureStorage _storage;

  static const _kAccessToken = 'access_token';
  static const _kUserEmail = 'user_email';
  static const _kUserRole = 'user_role';
  static const _kTenantId = 'tenant_id';
  static const _kSiteIds = 'site_ids';

  /// Returns `true` on successful credential validation.
  /// Throws [AuthException] on invalid credentials / network errors.
  Future<bool> loginWithPassword(String email, String password) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/auth/login',
        data: {'email': email.trim(), 'password': password},
        options: Options(
          headers: {'Content-Type': 'application/json'},
          sendTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        ),
      );

      final body = response.data;
      if (body == null) {
        throw const AuthException(
          code: 'ERR_EMPTY_RESPONSE',
          message: 'Réponse serveur vide.',
        );
      }

      final token = body['accessToken'] as String?;
      final user = body['user'] as Map<String, dynamic>?;
      if (token == null || user == null) {
        throw const AuthException(
          code: 'ERR_BAD_RESPONSE',
          message: 'Réponse serveur invalide.',
        );
      }

      await _storage.write(key: _kAccessToken, value: token);
      await _storage.write(
        key: _kUserEmail,
        value: user['email']?.toString() ?? '',
      );
      await _storage.write(
        key: _kUserRole,
        value: user['role']?.toString() ?? '',
      );
      await _storage.write(
        key: _kTenantId,
        value: user['tenantId']?.toString() ?? '',
      );
      final siteIds = user['siteIds'] as List<dynamic>?;
      await _storage.write(
        key: _kSiteIds,
        value: siteIds?.map((e) => e.toString()).join(',') ?? '',
      );
      return true;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw const AuthException(
          code: 'ERR_AUTH_INVALID_CREDENTIALS',
          message: 'Identifiants invalides.',
        );
      }
      final base = OidcConfig.apiBaseUrl.isEmpty
          ? '(empty — build-time env var missing)'
          : OidcConfig.apiBaseUrl;
      final reason = switch (e.type) {
        DioExceptionType.connectionTimeout => 'timeout connexion',
        DioExceptionType.sendTimeout => 'timeout envoi',
        DioExceptionType.receiveTimeout => 'timeout réception',
        DioExceptionType.badCertificate => 'certificat SSL invalide',
        DioExceptionType.connectionError => 'connexion refusée / DNS',
        DioExceptionType.cancel => 'annulé',
        DioExceptionType.badResponse =>
          'réponse ${e.response?.statusCode ?? "?"}',
        DioExceptionType.unknown => 'erreur inconnue',
      };
      throw AuthException(
        code: 'ERR_NETWORK',
        message: 'Serveur injoignable ($reason).\nAPI: $base\n${e.message ?? ""}',
      );
    }
  }

  Future<String?> getAccessToken() => _storage.read(key: _kAccessToken);

  Future<String?> getUserEmail() => _storage.read(key: _kUserEmail);

  Future<String?> getUserRole() => _storage.read(key: _kUserRole);

  Future<String?> getTenantId() => _storage.read(key: _kTenantId);

  Future<List<String>> getSiteIds() async {
    final raw = await _storage.read(key: _kSiteIds);
    if (raw == null || raw.isEmpty) return const [];
    return raw.split(',');
  }

  Future<bool> isAuthenticated() async {
    final token = await _storage.read(key: _kAccessToken);
    return token != null && token.isNotEmpty;
  }

  Future<void> logout() async {
    await _storage.delete(key: _kAccessToken);
    await _storage.delete(key: _kUserEmail);
    await _storage.delete(key: _kUserRole);
    await _storage.delete(key: _kTenantId);
    await _storage.delete(key: _kSiteIds);
  }
}

class AuthException implements Exception {
  const AuthException({required this.code, required this.message});
  final String code;
  final String message;

  @override
  String toString() => 'AuthException($code): $message';
}
