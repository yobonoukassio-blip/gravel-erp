/// OIDC client config for the Gravel mobile app.
/// Source: D-01, D-04, D-05, D-36.
///
/// `clientId` matches the Keycloak `gravel-mobile` client (public, PKCE on).
/// `redirectUrl` is the custom scheme declared in `android/app/build.gradle`
/// via `manifestPlaceholders = ['appAuthRedirectScheme': 'ci.gravel.mobile']`.
class OidcConfig {
  OidcConfig._();

  static const String clientId = 'gravel-mobile';
  static const String redirectUrl = 'ci.gravel.mobile://oauth/callback';
  static const String issuer = String.fromEnvironment(
    'KEYCLOAK_ISSUER',
    defaultValue: 'http://localhost:8080/realms/gravel-dev',
  );
  static const List<String> scopes = <String>[
    'openid',
    'profile',
    'email',
    'gravel-claims',
    'offline_access',
  ];

  /// Base URL of the Gravel API. Locale prefs are written to
  /// `\$apiBaseUrl/api/users/me/preferences` (canonical W2-P04 endpoint).
  static const String apiBaseUrl = String.fromEnvironment(
    'GRAVEL_API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
}
