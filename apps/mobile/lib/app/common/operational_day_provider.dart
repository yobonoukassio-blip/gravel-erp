import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme.dart';

/// Active operational day across the mobile app.
///
/// Used by every list-view / form that needs to filter by the current shift
/// (extraction, transport, HSE incidents, RH pointage, tir, fuel refuel).
///
/// `null` means "not yet selected" — list-views render an empty-day prompt
/// instead of a list. The user picks via [OperationalDayPicker] in the
/// AppBar of any screen that needs context.
///
/// Phase 7 will fetch the active day from the API based on user role + site
/// + clock; for now the user picks manually.
final operationalDayProvider =
    NotifierProvider<OperationalDayNotifier, OperationalDay?>(
  OperationalDayNotifier.new,
);

class OperationalDayNotifier extends Notifier<OperationalDay?> {
  @override
  OperationalDay? build() => null;

  void set(OperationalDay day) => state = day;
  void clear() => state = null;
}

@immutable
class OperationalDay {
  const OperationalDay({
    required this.id,
    required this.dayLocal,
    required this.label,
  });

  /// Operational day UUID (server-issued).
  final String id;

  /// Local date (YYYY-MM-DD).
  final DateTime dayLocal;

  /// Display label (e.g. "Jour J · 16 mai 2026").
  final String label;
}

/// Reusable picker — drop into an AppBar `actions` slot.
///
/// Renders a compact chip showing the active day, opens a date picker on tap.
/// In production this will hit `/api/operational-days?date=...` to resolve
/// the server-side day id; for now we synthesize an id from the date so
/// list-view filtering works against the local Drift db.
class OperationalDayPicker extends ConsumerWidget {
  const OperationalDayPicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = ref.watch(operationalDayProvider);
    final label = day == null
        ? 'Choisir une journée'
        : _formatLabel(day.dayLocal);

    return Padding(
      padding: const EdgeInsets.only(right: GravelTokens.space2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: day?.dayLocal ?? DateTime.now(),
              firstDate: DateTime(2025),
              lastDate: DateTime.now().add(const Duration(days: 1)),
              helpText: 'Journée opérationnelle',
              cancelText: 'Annuler',
              confirmText: 'Valider',
            );
            if (picked == null) return;
            ref.read(operationalDayProvider.notifier).set(
                  OperationalDay(
                    id: 'opday-${picked.toIso8601String().split('T')[0]}',
                    dayLocal: picked,
                    label: _formatLabel(picked),
                  ),
                );
          },
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: GravelTokens.space3,
              vertical: 6,
            ),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: day == null
                    ? Colors.white.withValues(alpha: 0.18)
                    : GravelTokens.gold.withValues(alpha: 0.5),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.calendar_today,
                  size: 14,
                  color: day == null
                      ? GravelTokens.textOnNavy.withValues(alpha: 0.7)
                      : GravelTokens.goldBright,
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: day == null
                        ? GravelTokens.textOnNavy.withValues(alpha: 0.9)
                        : GravelTokens.goldBright,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatLabel(DateTime d) {
    const months = [
      'janv',
      'févr',
      'mars',
      'avr',
      'mai',
      'juin',
      'juil',
      'août',
      'sept',
      'oct',
      'nov',
      'déc',
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }
}

/// Empty state shown when no operational day is selected — guides the user
/// toward the picker.
class NoDaySelected extends StatelessWidget {
  const NoDaySelected({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(GravelTokens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: GravelTokens.goldSoft,
                borderRadius: BorderRadius.circular(GravelTokens.radiusLg),
                border: Border.all(color: GravelTokens.gold),
              ),
              child: const Icon(
                Icons.calendar_today,
                size: 36,
                color: GravelTokens.goldDeep,
              ),
            ),
            const SizedBox(height: GravelTokens.space4),
            const Text(
              "Aucune journée sélectionnée",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: GravelTokens.text,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: GravelTokens.space2),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: GravelTokens.textMuted,
                height: 1.5,
              ),
            ),
            const SizedBox(height: GravelTokens.space3),
            const Text(
              "Touchez la pastille calendrier en haut à droite pour choisir.",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: GravelTokens.textSoft,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
