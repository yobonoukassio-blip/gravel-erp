// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'Gravel Ivoire ERP';

  @override
  String get login => 'Connexion';

  @override
  String get logout => 'Déconnexion';

  @override
  String get activityLog => 'Journal d\'activité';

  @override
  String get save => 'Enregistrer';

  @override
  String get cancel => 'Annuler';

  @override
  String get syncPending => 'Synchronisation en attente';

  @override
  String get syncDone => 'Synchronisé';

  @override
  String get app_name => 'Gravel Ivoire ERP';

  @override
  String get common_save => 'Enregistrer';

  @override
  String get common_cancel => 'Annuler';

  @override
  String get common_delete => 'Supprimer';

  @override
  String get common_edit => 'Modifier';

  @override
  String get common_search => 'Rechercher';

  @override
  String get common_loading => 'Chargement…';

  @override
  String get common_error => 'Erreur';

  @override
  String get common_confirm => 'Confirmer';

  @override
  String get common_back => 'Retour';

  @override
  String get common_locale_fr => 'Français (Côte d\'Ivoire)';

  @override
  String get common_locale_en => 'Anglais (Côte d\'Ivoire)';

  @override
  String get settings_title => 'Réglages';

  @override
  String get settings_language => 'Langue';

  @override
  String get auth_login_button => 'Se connecter avec Keycloak';

  @override
  String get auth_login_error => 'Échec de la connexion. Veuillez réessayer.';

  @override
  String get auth_login_title => 'Bienvenue sur Gravel Ivoire ERP';

  @override
  String get auth_login_subtitle => 'Authentification sécurisée via Keycloak.';

  @override
  String get auth_logout_button => 'Se déconnecter';

  @override
  String get auth_session_expired =>
      'Votre session a expiré, veuillez vous reconnecter.';
}
