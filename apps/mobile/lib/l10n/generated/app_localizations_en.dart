// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Gravel Ivoire ERP';

  @override
  String get login => 'Login';

  @override
  String get logout => 'Logout';

  @override
  String get activityLog => 'Activity log';

  @override
  String get save => 'Save';

  @override
  String get cancel => 'Cancel';

  @override
  String get syncPending => 'Sync pending';

  @override
  String get syncDone => 'Synced';

  @override
  String get app_name => 'Gravel Ivoire ERP';

  @override
  String get common_save => 'Save';

  @override
  String get common_cancel => 'Cancel';

  @override
  String get common_delete => 'Delete';

  @override
  String get common_edit => 'Edit';

  @override
  String get common_search => 'Search';

  @override
  String get common_loading => 'Loading…';

  @override
  String get common_error => 'Error';

  @override
  String get common_confirm => 'Confirm';

  @override
  String get common_back => 'Back';

  @override
  String get common_locale_fr => 'French (Côte d\'Ivoire)';

  @override
  String get common_locale_en => 'English (Côte d\'Ivoire)';

  @override
  String get settings_title => 'Settings';

  @override
  String get settings_language => 'Language';

  @override
  String get auth_login_button => 'Sign in with Keycloak';

  @override
  String get auth_login_error => 'Sign-in failed. Please try again.';

  @override
  String get auth_login_title => 'Welcome to Gravel Ivoire ERP';

  @override
  String get auth_login_subtitle => 'Secure authentication via Keycloak.';

  @override
  String get auth_logout_button => 'Sign out';

  @override
  String get auth_session_expired =>
      'Your session has expired, please sign in again.';
}
