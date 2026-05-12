import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'oidc_config.dart';

/// OIDC native-flow authentication using `flutter_appauth`.
/// Tokens are persisted in `flutter_secure_storage` (Keychain on iOS,
/// EncryptedSharedPreferences/Keystore on Android per D-36).
class AuthService {
  AuthService({
    FlutterAppAuth? appAuth,
    FlutterSecureStorage? storage,
  })  : _appAuth = appAuth ?? const FlutterAppAuth(),
        _storage = storage ?? const FlutterSecureStorage();

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _storage;

  static const _kAccessToken = 'access_token';
  static const _kRefreshToken = 'refresh_token';
  static const _kAccessExpiry = 'access_token_expiry';

  /// Triggers the system browser Auth Code + PKCE flow.
  /// Returns `true` on success, `false` if the user cancelled.
  Future<bool> login() async {
    final AuthorizationTokenResponse? response =
        await _appAuth.authorizeAndExchangeCode(
      AuthorizationTokenRequest(
        OidcConfig.clientId,
        OidcConfig.redirectUrl,
        issuer: OidcConfig.issuer,
        scopes: OidcConfig.scopes,
        allowInsecureConnections: const bool.fromEnvironment('DEV', defaultValue: true),
      ),
    );
    if (response == null) return false;
    await _persist(response.accessToken, response.refreshToken,
        response.accessTokenExpirationDateTime);
    return true;
  }

  /// Returns a valid access token, refreshing silently when expired.
  Future<String?> getAccessToken() async {
    final expiryStr = await _storage.read(key: _kAccessExpiry);
    if (expiryStr != null) {
      final expiry = DateTime.tryParse(expiryStr);
      if (expiry != null && expiry.isBefore(DateTime.now())) {
        final ok = await _refresh();
        if (!ok) return null;
      }
    }
    return _storage.read(key: _kAccessToken);
  }

  Future<bool> _refresh() async {
    final rt = await _storage.read(key: _kRefreshToken);
    if (rt == null) return false;
    try {
      final TokenResponse? response = await _appAuth.token(
        TokenRequest(
          OidcConfig.clientId,
          OidcConfig.redirectUrl,
          issuer: OidcConfig.issuer,
          scopes: OidcConfig.scopes,
          refreshToken: rt,
          grantType: 'refresh_token',
        ),
      );
      if (response == null) return false;
      await _persist(response.accessToken, response.refreshToken,
          response.accessTokenExpirationDateTime);
      return true;
    } on Exception {
      return false;
    }
  }

  Future<void> logout() async {
    await _storage.delete(key: _kAccessToken);
    await _storage.delete(key: _kRefreshToken);
    await _storage.delete(key: _kAccessExpiry);
  }

  Future<void> _persist(String? access, String? refresh, DateTime? expiry) async {
    if (access != null) await _storage.write(key: _kAccessToken, value: access);
    if (refresh != null) await _storage.write(key: _kRefreshToken, value: refresh);
    if (expiry != null) {
      await _storage.write(key: _kAccessExpiry, value: expiry.toIso8601String());
    }
  }
}
