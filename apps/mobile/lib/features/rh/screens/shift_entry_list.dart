import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/common/operational_day_provider.dart';
import '../../../app/theme.dart';
import '../repositories/shift_entry_repository.dart';

/// Read-only list of shift entries (pointage RH) for the active operational
/// day. Built around the append-only [ShiftEntry] model: an open shift (no
/// check_out) shows as "En poste", a closed one as "Terminée". Correction
/// supersedes are flagged.
class ShiftEntryListScreen extends ConsumerStatefulWidget {
  const ShiftEntryListScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.supervisorId,
  });

  final String tenantId;
  final String siteId;
  final String supervisorId;

  @override
  ConsumerState<ShiftEntryListScreen> createState() =>
      _ShiftEntryListScreenState();
}

class _ShiftEntryListScreenState extends ConsumerState<ShiftEntryListScreen> {
  Future<List<ShiftEntry>> _rowsFuture = Future.value(<ShiftEntry>[]);
  String? _loadedForDayId;

  void _reload(String dayId) {
    final repo = ref.read(shiftEntryRepositoryProvider);
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
      _rowsFuture = Future.value(<ShiftEntry>[]);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pointage RH'),
        actions: const [OperationalDayPicker()],
      ),
      body: day == null
          ? const NoDaySelected(
              message:
                  'Sélectionnez la journée opérationnelle pour voir les pointages.',
            )
          : FutureBuilder<List<ShiftEntry>>(
              future: _rowsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final rows = snapshot.data ?? const <ShiftEntry>[];
                if (rows.isEmpty) {
                  return const _EmptyState();
                }
                final open = rows.where((r) => r.checkOutUtc == null).length;
                final closed = rows.length - open;
                return RefreshIndicator(
                  onRefresh: () async => _reload(day.id),
                  child: ListView(
                    padding: const EdgeInsets.symmetric(
                      vertical: GravelTokens.space2,
                    ),
                    children: [
                      _SummaryBanner(open: open, closed: closed),
                      ...rows.map((r) => _ShiftTile(row: r)),
                    ],
                  ),
                );
              },
            ),
      floatingActionButton: day == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _comingSoon(context),
              icon: const Icon(Icons.person_add_alt),
              label: const Text('Nouveau pointage'),
            ),
    );
  }

  void _comingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('ShiftEntryFormScreen existant — wiring à venir'),
      ),
    );
  }
}

class _SummaryBanner extends StatelessWidget {
  const _SummaryBanner({required this.open, required this.closed});
  final int open;
  final int closed;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(
        GravelTokens.space4,
        GravelTokens.space2,
        GravelTokens.space4,
        GravelTokens.space3,
      ),
      padding: const EdgeInsets.all(GravelTokens.space4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [GravelTokens.navy900, GravelTokens.navy700],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(GravelTokens.radiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'EN POSTE',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: GravelTokens.goldBright,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$open',
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    fontFamily: 'monospace',
                    letterSpacing: -0.5,
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 1,
            height: 36,
            color: Colors.white.withValues(alpha: 0.15),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(left: GravelTokens.space4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'TERMINÉES',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: GravelTokens.textOnNavy,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$closed',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: GravelTokens.textOnNavy,
                      fontFamily: 'monospace',
                      letterSpacing: -0.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ShiftTile extends StatelessWidget {
  const _ShiftTile({required this.row});
  final ShiftEntry row;

  @override
  Widget build(BuildContext context) {
    final open = row.checkOutUtc == null;
    final tone = open ? GravelTokens.success : GravelTokens.textMuted;

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
          open ? Icons.work : Icons.work_off,
          size: 18,
          color: tone,
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              'Employé ${row.employeeId.substring(0, row.employeeId.length.clamp(0, 8))}',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                fontFamily: 'monospace',
                color: GravelTokens.text,
              ),
            ),
          ),
          if (row.supersedesId != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: GravelTokens.infoSoft,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: GravelTokens.info),
              ),
              child: const Text(
                'CORR.',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: GravelTokens.info,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            const SizedBox(width: 4),
          ],
          if (row.pendingSync) const _SyncChip(),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Row(
          children: [
            const Icon(
              Icons.login,
              size: 12,
              color: GravelTokens.textSoft,
            ),
            const SizedBox(width: 4),
            Text(
              _formatTime(row.checkInUtc),
              style: const TextStyle(
                fontSize: 11,
                fontFamily: 'monospace',
                color: GravelTokens.textMuted,
              ),
            ),
            const SizedBox(width: GravelTokens.space3),
            if (row.checkOutUtc != null) ...[
              const Icon(
                Icons.logout,
                size: 12,
                color: GravelTokens.textSoft,
              ),
              const SizedBox(width: 4),
              Text(
                _formatTime(row.checkOutUtc!),
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: GravelTokens.textMuted,
                ),
              ),
              const SizedBox(width: GravelTokens.space3),
              Text(
                '· ${_duration(row.checkInUtc, row.checkOutUtc!)}',
                style: TextStyle(
                  fontSize: 11,
                  color: GravelTokens.textMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ] else
              const Text(
                '· en poste',
                style: TextStyle(
                  fontSize: 11,
                  color: GravelTokens.success,
                  fontWeight: FontWeight.w600,
                ),
              ),
            if (row.positionCode != null) ...[
              const SizedBox(width: GravelTokens.space3),
              const Text(
                '·',
                style: TextStyle(color: GravelTokens.textSoft),
              ),
              const SizedBox(width: 4),
              Text(
                row.positionCode!,
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: GravelTokens.textSoft,
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

  String _formatTime(DateTime d) {
    final l = d.toLocal();
    final hh = l.hour.toString().padLeft(2, '0');
    final mm = l.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  String _duration(DateTime start, DateTime end) {
    final m = end.difference(start).inMinutes;
    if (m < 60) return '$m min';
    final h = m ~/ 60;
    final mm = m % 60;
    return '${h}h${mm.toString().padLeft(2, '0')}';
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
              Icons.badge,
              size: 56,
              color: GravelTokens.borderStrong,
            ),
            const SizedBox(height: GravelTokens.space3),
            const Text(
              'Aucun pointage pour cette journée',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: GravelTokens.text,
              ),
            ),
            const SizedBox(height: GravelTokens.space2),
            const Text(
              "Tapez + pour enregistrer le check-in du premier employé.",
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
