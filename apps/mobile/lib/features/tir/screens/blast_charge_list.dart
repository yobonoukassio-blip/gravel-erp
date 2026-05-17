import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme.dart';
import '../repositories/blast_charge_repository.dart';

/// Recent blast-charge feed across all plans (TIR-04 mobile, light view).
///
/// A plan picker is intentionally out of scope here — the operator records
/// from the existing BlastChargeFormScreen with full context. This list is
/// the at-a-glance feed showing the last 50 charges with variance per row.
class BlastChargeListScreen extends ConsumerStatefulWidget {
  const BlastChargeListScreen({super.key});

  @override
  ConsumerState<BlastChargeListScreen> createState() =>
      _BlastChargeListScreenState();
}

class _BlastChargeListScreenState extends ConsumerState<BlastChargeListScreen> {
  Future<List<BlastCharge>> _rowsFuture = Future.value(const <BlastCharge>[]);

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    final repo = ref.read(blastChargeRepositoryProvider);
    setState(() {
      _rowsFuture = repo.listRecent();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chargements récents'),
        actions: [
          IconButton(
            tooltip: 'Rafraîchir',
            icon: const Icon(Icons.refresh),
            onPressed: _reload,
          ),
        ],
      ),
      body: FutureBuilder<List<BlastCharge>>(
        future: _rowsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final rows = snapshot.data ?? const <BlastCharge>[];
          if (rows.isEmpty) {
            return const _EmptyState();
          }
          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(
                vertical: GravelTokens.space2,
              ),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const Divider(
                height: 1,
                color: GravelTokens.border,
              ),
              itemBuilder: (context, i) => _ChargeTile(row: rows[i]),
            ),
          );
        },
      ),
    );
  }
}

class _ChargeTile extends StatelessWidget {
  const _ChargeTile({required this.row});
  final BlastCharge row;

  @override
  Widget build(BuildContext context) {
    final variance = row.variancePct;
    final tone = variance.abs() < 5
        ? GravelTokens.success
        : variance.abs() < 15
            ? GravelTokens.warning
            : GravelTokens.danger;

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
        child: Icon(Icons.bolt, size: 20, color: tone),
      ),
      title: Row(
        children: [
          Text(
            row.productType,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: GravelTokens.text,
            ),
          ),
          const SizedBox(width: GravelTokens.space2),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: tone.withValues(alpha: 0.5)),
            ),
            child: Text(
              '${variance >= 0 ? '+' : ''}${variance.toStringAsFixed(1)} %',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: tone,
                fontVariantNumeric: FontVariantNumeric.tabularNums,
                letterSpacing: 0.3,
              ),
            ),
          ),
          const Spacer(),
          if (row.pendingSync) const _SyncChip(),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Row(
          children: [
            Text(
              'Trou ${row.holeId.substring(0, row.holeId.length.clamp(0, 8))}',
              style: const TextStyle(
                fontSize: 11,
                fontFamily: 'monospace',
                color: GravelTokens.textMuted,
              ),
            ),
            const SizedBox(width: GravelTokens.space3),
            Text(
              '${(row.actualQtyG / 1000).toStringAsFixed(2)} kg',
              style: const TextStyle(
                fontSize: 11,
                fontVariantNumeric: FontVariantNumeric.tabularNums,
                color: GravelTokens.text,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: GravelTokens.space3),
            if (row.detonatorSerial != null) ...[
              const Icon(
                Icons.confirmation_number,
                size: 12,
                color: GravelTokens.textSoft,
              ),
              const SizedBox(width: 4),
              Text(
                row.detonatorSerial!,
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: GravelTokens.textMuted,
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
              Icons.bolt,
              size: 56,
              color: GravelTokens.borderStrong,
            ),
            const SizedBox(height: GravelTokens.space3),
            const Text(
              'Aucun chargement récent',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: GravelTokens.text,
              ),
            ),
            const SizedBox(height: GravelTokens.space2),
            const Text(
              'Les chargements créés depuis un plan de tir validé '
              'apparaîtront ici en temps réel.',
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
