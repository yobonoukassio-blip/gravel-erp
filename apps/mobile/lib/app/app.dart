import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/activity_log/activity_log_screen.dart';

/// Gravel Ivoire ERP — root mobile app shell.
/// W2-P03 wires the journal d'activité feature behind a navigation rail.
/// Real auth (Keycloak OIDC) integrates in W2-P04 — for now we read the
/// active tenant/site/user from --dart-define values.
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
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('fr'), Locale('en')],
      home: _Home(
        tenantId: tenantId,
        siteId: siteId,
        userId: userId,
      ),
    );
  }
}

class _Home extends StatefulWidget {
  const _Home({
    required this.tenantId,
    required this.siteId,
    required this.userId,
  });

  final String tenantId;
  final String siteId;
  final String userId;

  @override
  State<_Home> createState() => _HomeState();
}

class _HomeState extends State<_Home> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      ActivityLogScreen(
        tenantId: widget.tenantId,
        siteId: widget.siteId,
        authorUserId: widget.userId,
      ),
      const _PlaceholderTab(label: 'Reports (Phase 3)'),
      const _PlaceholderTab(label: 'Settings (Phase 1 W2-P04)'),
    ];
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            labelType: NavigationRailLabelType.all,
            destinations: const [
              NavigationRailDestination(
                icon: Icon(Icons.edit_note),
                label: Text('Journal'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.bar_chart),
                label: Text('Reports'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.settings),
                label: Text('Settings'),
              ),
            ],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: pages[_index]),
        ],
      ),
    );
  }
}

class _PlaceholderTab extends StatelessWidget {
  const _PlaceholderTab({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(label)),
      body: Center(child: Text('$label — not yet implemented')),
    );
  }
}
