# Android Setup — flutter_appauth redirect scheme

After running `flutter create .` (which generates the `android/` and `ios/`
directories), add the following to `android/app/build.gradle` inside the
`defaultConfig` block to register the OIDC redirect scheme for the
`gravel-mobile` Keycloak client:

```gradle
defaultConfig {
    // ...
    manifestPlaceholders = [
        'appAuthRedirectScheme': 'ci.gravel.mobile'
    ]
}
```

This must match `OidcConfig.redirectUrl = 'ci.gravel.mobile://oauth/callback'`
in `lib/core/auth/oidc_config.dart`.

For iOS (deferred to Phase 6 per D-34), add to `ios/Runner/Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>ci.gravel.mobile</string></array>
  </dict>
</array>
```
