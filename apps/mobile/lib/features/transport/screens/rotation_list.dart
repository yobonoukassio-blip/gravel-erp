import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/common/operational_day_provider.dart';
import '../../../app/theme.dart';
import '../repositories/rotation_repository.dart';

/// Read-only list of truck rotations for the active operational day (TRP-01).
///
/// Each tile shows: bench → zone, material type, status (loaded vs unloaded),
/// loaded time, and a sync-pending chip on rows the device hasn't ACK'd yet.
class RotationListScreen extends ConsumerStatefulWidget {
  const RotationListScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.operatorId,
  });

  final String tenantId;
  final String siteId;
  final String operatorId;

  @override
  ConsumerState<RotationListScreen> createState() => _RotationListScreenState();
}

class _RotationListScreenState extends ConsumerState<RotationListScreen> {
  Future<List<TruckRotation>> _rowsFuture = Future.value(<TruckRotation>[]);
  String? _loadedForDayId;

  void _reload(String dayId) {
    final repo = ref.read(rotationRepositoryProvider);
    setState(() {
      _loadedForDayId = dayId;
      _rowsFuture = repo.listForOperationalDay(dayId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final day = ref.watch(operationalDayProvider);

    if (day != null && _loadedForDayId != day.id) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _reload(day.id));
    } else if (day == null && _loadedForDayId != null) {
      _loadedForDayId = null;
      _rowsFuture = Future.value(<TruckRotation>[]);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rotations camion'),
        actions: const [OperationalDayPicker()],
      ),
      body: day == null
          ? const NoDaySelected(
              message:
                  "Sélectionnez la journée opérationnelle pour voir les rotations "
                  'enregistrées.',
            )
          : FutureBuilder<List<TruckRotation>>(
              future: _rowsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final rows = snapshot.data ?? const <TruckRotation>[];
                if (rows.isEmpty) {
                  return const _EmptyState();
                }
                return RefreshIndicator(
                  onRefresh: () async => _reload(day.id),
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(
                      vertical: GravelTokens.space2,
                    ),
                    itemCount: rows.length,
                    separatorBuilder: (_, __) => const Divider(
                      height: 1,
                      color: GravelTokens.border,
                    ),
                    itemBuilder: (context, i) => _RotationTile(row: rows[i]),
                  ),
                );
              },
            ),
      floatingActionButton: day == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _comingSoon(context),
              icon: const Icon(Icons.add),
              label: const Text('Nouvelle rotation'),
            ),
    );
  }

  void _comingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Création depuis ticket de pesée (RotationFormScreen existant)',
        ),
      ),
    );
  }
}

class _RotationTile extends StatelessWidget {
  const _RotationTile({required this.row});
  final TruckRotation row;

  @override
  Widget build(BuildContext context) {
    final completed = row.unloadedAtUtc != null;
    final tone = completed ? GravelTokens.success : GravelTokens.warning;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: GravelTokens.space4,
        vertical: GravelTokens.space1,
      ),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(GravelTokens.radius),
        ),
        child: Icon(
          completed ? Icons.check_circle : Icons.local_shipping,
          size: 20,
          color: tone,
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              _materialLabel(row.materialType),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: GravelTokens.text,
              ),
            ),
          ),
          _StatusPill(
            label: completed ? 'Terminée' : 'En transit',
            tone: tone,
          ),
          if (row.pendingSync) ...[
            const SizedBox(width: 4),
            const _SyncChip(),
          ],
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 2),
            Row(
              children: [
                const Icon(
                  Icons.flag,
                  size: 12,
                  color: GravelTokens.textSoft,
                ),
                const SizedBox(width: 4),
                Text(
                  'Banc ${row.loadedAtBenchId.substring(0, row.loadedAtBenchId.length.clamp(0, 6))}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: GravelTokens.textMuted,
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(
                  Icons.arrow_forward,
                  size: 11,
                  color: GravelTokens.textSoft,
                ),
                const SizedBox(width: 4),
                Text(
                  'Zone ${row.unloadedAtZoneId.substring(0, row.unloadedAtZoneId.length.clamp(0, 6))}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: GravelTokens.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(
                  Icons.schedule,
                  size: 12,
                  color: GravelTokens.textSoft,
                ),
                const SizedBox(width: 4),
                Text(
                  'Chargé ${_formatTime(row.loadedAtUtc)}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: GravelTokens.textMuted,
                  ),
                ),
                if (row.unloadedAtUtc != null) ...[
                  const SizedBox(width: GravelTokens.space3),
                  Text(
                    '· ${_formatDuration(row.loadedAtUtc, row.unloadedAtUtc!)}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: GravelTokens.textMuted,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
      trailing: const Icon(
        Icons.chevron_right,
        size: 18,
        color: GravelTokens.textSoft,
      ),
    );
  }

  String _materialLabel(String type) {
    switch (type) {
      case 'granite_brut':
        return 'Granite brut';
      case 'tout_venant':
        return 'Tout-venant';
      case 'sterile':
        return 'Stérile';
      default:
        return type;
    }
  }

  String _formatTime(DateTime d) {
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  String _formatDuration(DateTime start, DateTime end) {
    final m = end.difference(start).inMinutes;
    if (m < 60) return '$m min';
    final h = m ~/ 60;
    final mm = m % 60;
    return '${h}h${mm.toString().padLeft(2, '0')}';
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.tone});
  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.withValues(alpha: 0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: tone,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class _SyncChip extends StatelessWidget {
  const _SyncChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: GravelTokens.warningSoft,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: GravelTokens.warning),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_upload, size: 10, color: GravelTokens.warning),
          SizedBox(width: 3),
          Text(
            'sync',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: GravelTokens.warning,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(GravelTokens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.local_shipping,
              size: 56,
              color: GravelTokens.borderStrong,
            ),
            const SizedBox(height: GravelTokens.space3),
            const Text(
              'Aucune rotation enregistrée',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: GravelTokens.text,
              ),
            ),
            const SizedBox(height: GravelTokens.space2),
            const Text(
              "Les rotations sont créées depuis un ticket de pesée signé.",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: GravelTokens.textMuted,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
