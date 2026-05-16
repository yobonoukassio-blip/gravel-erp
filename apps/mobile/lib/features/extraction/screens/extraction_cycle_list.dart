import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/common/operational_day_provider.dart';
import '../../../app/theme.dart';
import '../repositories/extraction_cycle_repository.dart';

/// Read-only list of extraction cycles for the active operational day.
///
/// Tapping the FAB opens [ExtractionCycleForm] pre-filled with the active
/// day's context. Tapping a row shows the cycle details (read-only).
class ExtractionCycleListScreen extends ConsumerStatefulWidget {
  const ExtractionCycleListScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.operatorId,
  });

  final String tenantId;
  final String siteId;
  final String operatorId;

  @override
  ConsumerState<ExtractionCycleListScreen> createState() =>
      _ExtractionCycleListScreenState();
}

class _ExtractionCycleListScreenState
    extends ConsumerState<ExtractionCycleListScreen> {
  late Future<List<ExtractionCycleRow>> _rowsFuture;
  String? _loadedForDayId;

  @override
  void initState() {
    super.initState();
    _rowsFuture = Future.value(<ExtractionCycleRow>[]);
  }

  void _reload(String dayId) {
    final repo = ref.read(extractionCycleRepositoryProvider);
    setState(() {
      _loadedForDayId = dayId;
      _rowsFuture = repo.listForOperationalDay(dayId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final day = ref.watch(operationalDayProvider);

    // Sync the future when day changes
    if (day != null && _loadedForDayId != day.id) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _reload(day.id));
    } else if (day == null && _loadedForDayId != null) {
      _loadedForDayId = null;
      _rowsFuture = Future.value(<ExtractionCycleRow>[]);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cycles d\'extraction'),
        actions: const [OperationalDayPicker()],
      ),
      body: day == null
          ? const NoDaySelected(
              message:
                  'Sélectionnez la journée opérationnelle pour voir les cycles enregistrés.',
            )
          : FutureBuilder<List<ExtractionCycleRow>>(
              future: _rowsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return _ErrorState(message: snapshot.error.toString());
                }
                final rows = snapshot.data ?? const <ExtractionCycleRow>[];
                if (rows.isEmpty) {
                  return _EmptyState(
                    onAdd: () => _openForm(context, day.id),
                  );
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
                    itemBuilder: (context, i) => _CycleTile(row: rows[i]),
                  ),
                );
              },
            ),
      floatingActionButton: day == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openForm(context, day.id),
              icon: const Icon(Icons.add),
              label: const Text('Nouveau cycle'),
            ),
    );
  }

  void _openForm(BuildContext context, String dayId) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Formulaire à brancher (déjà existant — wiring suivant)'),
      ),
    );
  }
}

class _CycleTile extends StatelessWidget {
  const _CycleTile({required this.row});
  final ExtractionCycleRow row;

  @override
  Widget build(BuildContext context) {
    final pending = row.pendingSync;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: GravelTokens.space4,
        vertical: GravelTokens.space1,
      ),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: _materialColor(row.materialType).withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(GravelTokens.radius),
        ),
        child: Icon(
          Icons.landscape,
          size: 20,
          color: _materialColor(row.materialType),
        ),
      ),
      title: Row(
        children: [
          Text(
            '${row.estimatedTonnageT.toStringAsFixed(1)} t',
            style: const TextStyle(
              fontFamily: 'monospace',
              fontWeight: FontWeight.w700,
              fontSize: 14,
              color: GravelTokens.text,
            ),
          ),
          const SizedBox(width: GravelTokens.space2),
          Text(
            _materialLabel(row.materialType),
            style: TextStyle(
              fontSize: 12,
              color: _materialColor(row.materialType),
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          if (pending) const _SyncPendingChip(),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Row(
          children: [
            Icon(
              Icons.schedule,
              size: 12,
              color: GravelTokens.textSoft,
            ),
            const SizedBox(width: 4),
            Text(
              _formatTime(row.cycleStartedAtLocal),
              style: const TextStyle(
                fontSize: 11,
                color: GravelTokens.textMuted,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(width: GravelTokens.space3),
            if (row.downtimeMinutes != null && row.downtimeMinutes! > 0) ...[
              Icon(
                Icons.warning_amber,
                size: 12,
                color: GravelTokens.danger,
              ),
              const SizedBox(width: 4),
              Text(
                '${row.downtimeMinutes} min arrêt',
                style: const TextStyle(
                  fontSize: 11,
                  color: GravelTokens.danger,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
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

  Color _materialColor(String type) {
    switch (type) {
      case 'granite_brut':
        return GravelTokens.navy600;
      case 'tout_venant':
        return GravelTokens.info;
      case 'sterile':
        return GravelTokens.textMuted;
      default:
        return GravelTokens.textMuted;
    }
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
}

class _SyncPendingChip extends StatelessWidget {
  const _SyncPendingChip();

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
  const _EmptyState({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(GravelTokens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.landscape,
              size: 56,
              color: GravelTokens.borderStrong,
            ),
            const SizedBox(height: GravelTokens.space3),
            const Text(
              'Aucun cycle pour cette journée',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: GravelTokens.text,
              ),
            ),
            const SizedBox(height: GravelTokens.space2),
            const Text(
              'Tapez le bouton + pour enregistrer le premier cycle d\'extraction.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: GravelTokens.textMuted,
                height: 1.5,
              ),
            ),
            const SizedBox(height: GravelTokens.space4),
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add),
              label: const Text('Nouveau cycle'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(GravelTokens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline,
              size: 48,
              color: GravelTokens.danger,
            ),
            const SizedBox(height: GravelTokens.space3),
            const Text(
              'Erreur de chargement',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: GravelTokens.text,
              ),
            ),
            const SizedBox(height: GravelTokens.space2),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12,
                color: GravelTokens.textMuted,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
