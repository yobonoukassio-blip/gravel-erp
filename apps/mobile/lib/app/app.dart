import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/activity_log/activity_log_screen.dart';
import '../features/alerts/screens/alerts_screen.dart';
import '../features/concassage/screens/concassage_screen.dart';
import '../features/criblage/screens/criblage_screen.dart';
import '../features/dashboard/screens/dashboard_screen.dart';
import '../features/foration/screens/drilling_plan_list.dart';
import '../features/fuel/screens/equipment_refuel_form.dart';
import '../features/maintenance/screens/maintenance_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/stockpile/screens/stockpile_screen.dart';
import '../features/ventes/screens/ventes_screen.dart';
import 'common/module_placeholder.dart';
import 'theme.dart';

/// Gravel Ivoire ERP — root mobile app shell.
///
/// Wires all feature modules behind a navigation drawer (mobile) +
/// navigation rail (tablet/landscape). Tenant/site/user identity is
/// sourced from --dart-define for now and will be replaced with claims
/// from the Keycloak OIDC flow.
class GravelApp extends ConsumerWidget {
  const GravelApp({super.key});

  static const String tenantId =
      String.fromEnvironment('GRAVEL_TENANT_ID', defaultValue: '');
  static const String siteId =
      String.fromEnvironment('GRAVEL_SITE_ID', defaultValue: '');
  static const String userId =
      String.fromEnvironment('GRAVEL_USER_ID', defaultValue: '');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'Gravel Ivoire ERP',
      debugShowCheckedModeBanner: false,
      theme: GravelTheme.light(),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('fr'), Locale('en')],
      home: const _Shell(),
    );
  }
}

/// Module identifiers — routing keys inside the shell.
enum ModuleId {
  dashboard,
  activity,
  foration,
  extraction,
  transport,
  stockpile,
  concassage,
  criblage,
  fuel,
  tir,
  maintenance,
  hse,
  rh,
  ventes,
  alerts,
  settings,
}

class _NavEntry {
  const _NavEntry(this.id, this.label, this.icon);
  final ModuleId id;
  final String label;
  final IconData icon;
}

class _NavSection {
  const _NavSection(this.title, this.entries);
  final String? title;
  final List<_NavEntry> entries;
}

const _navSections = <_NavSection>[
  _NavSection(null, [
    _NavEntry(ModuleId.dashboard, 'Tableau de bord', Icons.dashboard),
    _NavEntry(ModuleId.alerts, 'Alertes', Icons.notifications_active),
  ]),
  _NavSection('PRODUCTION', [
    _NavEntry(ModuleId.foration, 'Foration', Icons.construction),
    _NavEntry(ModuleId.tir, 'Tir de mine', Icons.bolt),
    _NavEntry(ModuleId.extraction, 'Extraction', Icons.landscape),
    _NavEntry(ModuleId.concassage, 'Concassage', Icons.precision_manufacturing),
    _NavEntry(ModuleId.criblage, 'Criblage', Icons.grid_view),
    _NavEntry(ModuleId.transport, 'Transport', Icons.local_shipping),
    _NavEntry(ModuleId.stockpile, 'Stockpile', Icons.inventory_2),
  ]),
  _NavSection('COMMERCIAL', [
    _NavEntry(ModuleId.ventes, 'Ventes & BL', Icons.receipt_long),
  ]),
  _NavSection('OPÉRATIONS', [
    _NavEntry(ModuleId.fuel, 'Carburant', Icons.local_gas_station),
    _NavEntry(ModuleId.maintenance, 'Maintenance', Icons.build),
    _NavEntry(ModuleId.hse, 'HSE', Icons.health_and_safety),
    _NavEntry(ModuleId.rh, 'RH', Icons.badge),
  ]),
  _NavSection('AUTRE', [
    _NavEntry(ModuleId.activity, "Journal d'activité", Icons.edit_note),
    _NavEntry(ModuleId.settings, 'Paramètres', Icons.settings),
  ]),
];

class _Shell extends StatefulWidget {
  const _Shell();

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  ModuleId _active = ModuleId.dashboard;

  void _navigate(ModuleId id) {
    setState(() => _active = id);
    if (Navigator.canPop(context)) Navigator.of(context).pop();
  }

  void _quickActionToModule(String routeId) {
    final id = switch (routeId) {
      'foration' => ModuleId.foration,
      'extraction' => ModuleId.extraction,
      'transport' => ModuleId.transport,
      'fuel' => ModuleId.fuel,
      'tir' => ModuleId.tir,
      'hse' => ModuleId.hse,
      'activity' => ModuleId.activity,
      'rh' => ModuleId.rh,
      'alerts' => ModuleId.alerts,
      'settings' => ModuleId.settings,
      _ => ModuleId.dashboard,
    };
    _navigate(id);
  }

  Widget _bodyFor(ModuleId id) {
    switch (id) {
      case ModuleId.dashboard:
        return DashboardScreen(
          tenantId: GravelApp.tenantId,
          siteId: GravelApp.siteId,
          onNavigate: _quickActionToModule,
        );
      case ModuleId.activity:
        return ActivityLogScreen(
          tenantId: GravelApp.tenantId,
          siteId: GravelApp.siteId,
          authorUserId: GravelApp.userId,
        );
      case ModuleId.foration:
        return const DrillingPlanListScreen();
      case ModuleId.fuel:
        return const EquipmentRefuelFormScreen();
      case ModuleId.concassage:
        return const ConcassageScreen();
      case ModuleId.criblage:
        return const CriblageScreen();
      case ModuleId.maintenance:
        return const MaintenanceScreen();
      case ModuleId.ventes:
        return const VentesScreen();
      case ModuleId.stockpile:
        return const StockpileScreen();
      case ModuleId.alerts:
        return const AlertsScreen();
      case ModuleId.settings:
        return const SettingsScreen();
      case ModuleId.extraction:
        return const ModulePlaceholder(
          title: 'Extraction',
          subtitle:
              "Liste des cycles d'extraction à venir. Le formulaire de "
              "saisie cycle est accessible depuis un plan d'opération.",
          iconData: Icons.landscape,
          requirementCode: 'EXT-01 · EXT-02',
        );
      case ModuleId.transport:
        return const ModulePlaceholder(
          title: 'Transport',
          subtitle:
              'Liste des rotations + tickets de pesée à venir. La saisie '
              'individuelle est accessible depuis une rotation active.',
          iconData: Icons.local_shipping,
          requirementCode: 'TRP-01..03',
        );
      case ModuleId.tir:
        return const ModulePlaceholder(
          title: 'Tir de mine',
          subtitle:
              'Liste des plans de tir actifs à venir. Le formulaire de '
              'chargement explosif est accessible depuis un plan validé HSE.',
          iconData: Icons.bolt,
          requirementCode: 'TIR-01..07',
        );
      case ModuleId.hse:
        return const ModulePlaceholder(
          title: 'HSE',
          subtitle:
              'Liste des incidents nécessite le contexte journée opérationnelle '
              '— branchement à venir avec le sélecteur de jour ops.',
          iconData: Icons.health_and_safety,
          requirementCode: 'HSE-01 · HSE-02',
        );
      case ModuleId.rh:
        return const ModulePlaceholder(
          title: 'RH — Pointage',
          subtitle:
              'Saisie pointage équipe par superviseur. Branchement à venir '
              'avec le contexte journée opérationnelle + superviseur.',
          iconData: Icons.badge,
          requirementCode: 'RH-01..04',
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      drawer: isWide ? null : _Drawer(active: _active, onTap: _navigate),
      body: SafeArea(
        child: Row(
          children: [
            if (isWide) _SideNav(active: _active, onTap: _navigate),
            Expanded(child: _bodyFor(_active)),
          ],
        ),
      ),
    );
  }
}

/// Permanent side nav for tablet / landscape.
class _SideNav extends StatelessWidget {
  const _SideNav({required this.active, required this.onTap});

  final ModuleId active;
  final void Function(ModuleId) onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 240,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [GravelTokens.navy900, GravelTokens.navy800],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Column(
        children: [
          const _Brand(),
          Expanded(child: _NavList(active: active, onTap: onTap)),
          const _StatusFooter(),
        ],
      ),
    );
  }
}

/// Drawer for phone-sized screens.
class _Drawer extends StatelessWidget {
  const _Drawer({required this.active, required this.onTap});

  final ModuleId active;
  final void Function(ModuleId) onTap;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [GravelTokens.navy900, GravelTokens.navy800],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              const _Brand(),
              Expanded(child: _NavList(active: active, onTap: onTap)),
              const _StatusFooter(),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavList extends StatelessWidget {
  const _NavList({required this.active, required this.onTap});

  final ModuleId active;
  final void Function(ModuleId) onTap;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(
        vertical: GravelTokens.space3,
        horizontal: GravelTokens.space2,
      ),
      children: [
        for (final section in _navSections) ...[
          if (section.title != null)
            Padding(
              padding: const EdgeInsets.only(
                left: GravelTokens.space3,
                top: GravelTokens.space4,
                bottom: GravelTokens.space1,
              ),
              child: Text(
                section.title!,
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.6,
                  color: GravelTokens.textSoft,
                ),
              ),
            ),
          for (final entry in section.entries)
            _NavTile(
              entry: entry,
              active: entry.id == active,
              onTap: () => onTap(entry.id),
            ),
        ],
      ],
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(GravelTokens.space4),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: GravelTokens.navy600)),
      ),
      child: Row(
        children: [
          const GravelBrandMark(size: 36),
          const SizedBox(width: GravelTokens.space3),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Gravel Ivoire',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: GravelTokens.textOnNavy,
                ),
              ),
              Text(
                'QUARRY OPERATIONS',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                  color: GravelTokens.goldBright.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _NavTile extends StatelessWidget {
  const _NavTile({
    required this.entry,
    required this.active,
    required this.onTap,
  });

  final _NavEntry entry;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final iconColor = active ? GravelTokens.goldBright : GravelTokens.textSoft;
    final textColor =
        active ? GravelTokens.goldBright : GravelTokens.textOnNavy;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(GravelTokens.radius),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutQuart,
          padding: const EdgeInsets.symmetric(
            horizontal: GravelTokens.space3,
            vertical: GravelTokens.space2,
          ),
          margin: const EdgeInsets.symmetric(vertical: 1),
          decoration: BoxDecoration(
            color: active ? GravelTokens.navy600 : Colors.transparent,
            borderRadius: BorderRadius.circular(GravelTokens.radius),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 3,
                height: 18,
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 200),
                  opacity: active ? 1 : 0,
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [GravelTokens.goldBright, GravelTokens.gold],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                      borderRadius: BorderRadius.circular(2),
                      boxShadow: [
                        BoxShadow(
                          color: GravelTokens.gold.withValues(alpha: 0.6),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: GravelTokens.space3),
              Icon(entry.icon, size: 18, color: iconColor),
              const SizedBox(width: GravelTokens.space3),
              Expanded(
                child: Text(
                  entry.label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                    color: textColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusFooter extends StatelessWidget {
  const _StatusFooter();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: GravelTokens.space4,
        vertical: GravelTokens.space3,
      ),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: GravelTokens.navy600)),
      ),
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: GravelTokens.success,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: GravelTokens.success.withValues(alpha: 0.5),
                  blurRadius: 6,
                ),
              ],
            ),
          ),
          const SizedBox(width: GravelTokens.space2),
          const Text(
            'Sync prête',
            style: TextStyle(
              fontSize: 11,
              color: GravelTokens.textSoft,
            ),
          ),
        ],
      ),
    );
  }
}
