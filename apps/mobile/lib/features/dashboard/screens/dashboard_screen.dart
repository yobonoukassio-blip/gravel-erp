import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// DashboardScreen — landing/home for the mobile app.
///
/// Phase 1: hero card with site identity + quick-action tiles routing to
/// the key field-entry modules. Real KPIs land when DashboardApi service
/// + SSE wiring ports from the web app (Phase 5).
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.onNavigate,
  });

  final String tenantId;
  final String siteId;
  final void Function(String routeId) onNavigate;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tableau de bord'),
        actions: [
          IconButton(
            tooltip: 'Synchroniser',
            icon: const Icon(Icons.sync),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Synchronisation manuelle (à brancher)')),
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(GravelTokens.space4),
        children: [
          _HeroCard(siteId: siteId),
          const SizedBox(height: GravelTokens.space5),
          const _SectionTitle(label: 'SAISIE TERRAIN'),
          const SizedBox(height: GravelTokens.space2),
          _QuickActionGrid(
            actions: const [
              _Action('foration', 'Foration', Icons.construction),
              _Action('extraction', 'Extraction', Icons.landscape),
              _Action('transport', 'Transport', Icons.local_shipping),
              _Action('fuel', 'Carburant', Icons.local_gas_station),
              _Action('tir', 'Tir de mine', Icons.bolt),
              _Action('hse', 'HSE', Icons.health_and_safety),
            ],
            onTap: onNavigate,
          ),
          const SizedBox(height: GravelTokens.space5),
          const _SectionTitle(label: 'JOURNAL & RH'),
          const SizedBox(height: GravelTokens.space2),
          _QuickActionGrid(
            actions: const [
              _Action('activity', 'Journal', Icons.edit_note),
              _Action('rh', 'Pointage', Icons.badge),
              _Action('alerts', 'Alertes', Icons.notifications_active),
              _Action('settings', 'Paramètres', Icons.settings),
            ],
            onTap: onNavigate,
          ),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.siteId});

  final String siteId;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(GravelTokens.space5),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [GravelTokens.navy900, GravelTokens.navy700],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(GravelTokens.radiusLg),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          const GravelBrandMark(size: 44),
          const SizedBox(width: GravelTokens.space4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'TABLEAU DE BORD',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2.5,
                    color: GravelTokens.goldBright,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Gravel Ivoire',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                    color: GravelTokens.textOnNavy,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Site ${siteId.isEmpty ? '—' : siteId.substring(0, 8)}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.white.withValues(alpha: 0.7),
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: GravelTokens.space2,
              vertical: 4,
            ),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: const [
                _PulsingDot(),
                SizedBox(width: 6),
                Text(
                  'Live',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: GravelTokens.textOnNavy,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.4, end: 1.0).animate(_ctrl),
      child: Container(
        width: 6,
        height: 6,
        decoration: const BoxDecoration(
          color: GravelTokens.success,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(color: GravelTokens.success, blurRadius: 6),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 3,
          height: 14,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [GravelTokens.goldBright, GravelTokens.goldDeep],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: GravelTokens.space2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.6,
            color: GravelTokens.textMuted,
          ),
        ),
        const SizedBox(width: GravelTokens.space2),
        const Expanded(child: Divider(color: GravelTokens.border)),
      ],
    );
  }
}

class _Action {
  const _Action(this.id, this.label, this.icon);
  final String id;
  final String label;
  final IconData icon;
}

class _QuickActionGrid extends StatelessWidget {
  const _QuickActionGrid({required this.actions, required this.onTap});
  final List<_Action> actions;
  final void Function(String routeId) onTap;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: GravelTokens.space2,
        crossAxisSpacing: GravelTokens.space2,
        childAspectRatio: 2.6,
      ),
      itemCount: actions.length,
      itemBuilder: (context, i) {
        final a = actions[i];
        return Material(
          color: GravelTokens.surface,
          borderRadius: BorderRadius.circular(GravelTokens.radiusMd),
          child: InkWell(
            onTap: () => onTap(a.id),
            borderRadius: BorderRadius.circular(GravelTokens.radiusMd),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: GravelTokens.space4,
                vertical: GravelTokens.space3,
              ),
              decoration: BoxDecoration(
                border: Border.all(color: GravelTokens.border),
                borderRadius: BorderRadius.circular(GravelTokens.radiusMd),
              ),
              child: Row(
                children: [
                  Icon(a.icon, size: 22, color: GravelTokens.goldDeep),
                  const SizedBox(width: GravelTokens.space3),
                  Expanded(
                    child: Text(
                      a.label,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: GravelTokens.text,
                      ),
                    ),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 18, color: GravelTokens.textSoft),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
