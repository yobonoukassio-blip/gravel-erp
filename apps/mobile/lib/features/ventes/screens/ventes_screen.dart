// Ventes screen (VTE-03) — Bon de Livraison list with status filters.
//
// MVP v1.2 promotion from placeholder: lists today's BLs with sign/sync
// indicators and a FAB to create a new BL. Real offline numbering, signature
// capture and outbox sync are wired separately in
// `apps/mobile/lib/features/transport/widgets/signature_pad.dart` +
// `offline_ticket_numbering.dart` — this screen is the entry point that will
// stitch them together once the BL repository lands.

import 'package:flutter/material.dart';

import '../../../app/theme.dart';

enum _BlStatus { draft, signedLocal, syncing, synced, rejected }

class _BlItem {
  const _BlItem({
    required this.number,
    required this.customer,
    required this.calibre,
    required this.tonnageKg,
    required this.truck,
    required this.driver,
    required this.status,
    required this.createdAt,
  });

  final String number;
  final String customer;
  final String calibre;
  final double tonnageKg;
  final String truck;
  final String driver;
  final _BlStatus status;
  final DateTime createdAt;
}

class VentesScreen extends StatefulWidget {
  const VentesScreen({super.key});

  @override
  State<VentesScreen> createState() => _VentesScreenState();
}

class _VentesScreenState extends State<VentesScreen> {
  _BlFilter _filter = _BlFilter.today;

  // TODO(VTE-03): replace by repository fetch
  // (apps/api GET /api/ventes/bon-de-livraison?delivery_date=today).
  static final List<_BlItem> _seed = [
    _BlItem(
      number: 'BL-2026-04129',
      customer: 'SCB Béton — Abidjan',
      calibre: '0/31',
      tonnageKg: 24500,
      truck: 'CI-3421-AA',
      driver: 'K. Diabaté',
      status: _BlStatus.synced,
      createdAt: DateTime.now().subtract(const Duration(hours: 1, minutes: 12)),
    ),
    _BlItem(
      number: 'BL-2026-04130',
      customer: 'Bouygues TP — Bingerville',
      calibre: '5/15',
      tonnageKg: 31200,
      truck: 'CI-7782-DC',
      driver: 'A. Touré',
      status: _BlStatus.signedLocal,
      createdAt: DateTime.now().subtract(const Duration(minutes: 38)),
    ),
    _BlItem(
      number: 'BL-2026-04131',
      customer: 'PFO Africa — Yamoussoukro',
      calibre: '15/25',
      tonnageKg: 28100,
      truck: 'CI-1109-EE',
      driver: 'M. Koné',
      status: _BlStatus.syncing,
      createdAt: DateTime.now().subtract(const Duration(minutes: 14)),
    ),
    _BlItem(
      number: 'BL-2026-04132',
      customer: 'CIM Métal — San Pédro',
      calibre: '25/40',
      tonnageKg: 26800,
      truck: 'CI-2240-AB',
      driver: 'S. Ouattara',
      status: _BlStatus.draft,
      createdAt: DateTime.now().subtract(const Duration(minutes: 3)),
    ),
  ];

  Iterable<_BlItem> get _visible {
    final now = DateTime.now();
    return _seed.where((b) {
      switch (_filter) {
        case _BlFilter.today:
          return b.createdAt.year == now.year &&
              b.createdAt.month == now.month &&
              b.createdAt.day == now.day;
        case _BlFilter.pendingSync:
          return b.status == _BlStatus.signedLocal ||
              b.status == _BlStatus.syncing ||
              b.status == _BlStatus.draft;
        case _BlFilter.synced:
          return b.status == _BlStatus.synced;
        case _BlFilter.rejected:
          return b.status == _BlStatus.rejected;
      }
    }).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  double get _totalTons {
    return _visible.fold(0.0, (sum, b) => sum + b.tonnageKg) / 1000.0;
  }

  @override
  Widget build(BuildContext context) {
    final items = _visible.toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ventes & BL'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Rafraîchir',
            onPressed: () => setState(() {}),
          ),
        ],
      ),
      body: Column(
        children: [
          _SummaryBanner(count: items.length, totalTons: _totalTons),
          _FilterBar(
            current: _filter,
            onChanged: (f) => setState(() => _filter = f),
          ),
          Expanded(
            child: items.isEmpty
                ? const _EmptyState()
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(
                      vertical: GravelTokens.space2,
                    ),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (ctx, i) => _BlTile(item: items[i]),
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showNewBlSheet(context),
        icon: const Icon(Icons.add),
        label: const Text('Nouveau BL'),
      ),
    );
  }

  void _showNewBlSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _NewBlSheet(),
    );
  }
}

enum _BlFilter { today, pendingSync, synced, rejected }

class _SummaryBanner extends StatelessWidget {
  const _SummaryBanner({required this.count, required this.totalTons});

  final int count;
  final double totalTons;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: GravelTokens.space4,
        vertical: GravelTokens.space3,
      ),
      decoration: BoxDecoration(
        color: GravelTokens.goldSoft,
        border: Border(
          bottom: BorderSide(color: GravelTokens.gold.withValues(alpha: 0.4)),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$count BL',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: GravelTokens.goldDeep,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const Text('dans la vue',
                  style: TextStyle(fontSize: 11, color: Colors.black54)),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${totalTons.toStringAsFixed(1)} t',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: GravelTokens.goldDeep,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const Text('tonnage cumulé',
                  style: TextStyle(fontSize: 11, color: Colors.black54)),
            ],
          ),
        ],
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.current, required this.onChanged});

  final _BlFilter current;
  final ValueChanged<_BlFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final entries = <(_BlFilter, String)>[
      (_BlFilter.today, 'Aujourd\'hui'),
      (_BlFilter.pendingSync, 'En attente sync'),
      (_BlFilter.synced, 'Synchronisés'),
      (_BlFilter.rejected, 'Rejetés'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
        horizontal: GravelTokens.space4,
        vertical: GravelTokens.space2,
      ),
      child: Row(
        children: [
          for (final e in entries) ...[
            ChoiceChip(
              label: Text(e.$2),
              selected: current == e.$1,
              onSelected: (_) => onChanged(e.$1),
            ),
            const SizedBox(width: GravelTokens.space2),
          ],
        ],
      ),
    );
  }
}

class _BlTile extends StatelessWidget {
  const _BlTile({required this.item});

  final _BlItem item;

  (IconData, Color, String) get _statusBadge => switch (item.status) {
        _BlStatus.draft => (Icons.edit_note, Colors.grey, 'Brouillon'),
        _BlStatus.signedLocal => (
            Icons.fingerprint,
            Colors.orange,
            'Signé local',
          ),
        _BlStatus.syncing => (
            Icons.sync,
            Colors.blue,
            'Sync en cours',
          ),
        _BlStatus.synced => (
            Icons.cloud_done,
            Colors.green,
            'Synchronisé',
          ),
        _BlStatus.rejected => (Icons.error, Colors.red, 'Rejeté serveur'),
      };

  String _formatRelative(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return 'il y a ${diff.inMinutes} min';
    if (diff.inHours < 24) return 'il y a ${diff.inHours}h';
    return 'il y a ${diff.inDays}j';
  }

  @override
  Widget build(BuildContext context) {
    final (icon, color, label) = _statusBadge;
    return ListTile(
      onTap: () => _showDetail(context),
      leading: CircleAvatar(
        backgroundColor: color.withValues(alpha: 0.15),
        child: Icon(icon, color: color),
      ),
      title: Text(
        item.customer,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${item.number} · ${item.calibre} · ${(item.tonnageKg / 1000).toStringAsFixed(2)} t',
          ),
          const SizedBox(height: 2),
          Text(
            '${item.truck} · ${item.driver} · $label',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
        ],
      ),
      trailing: Text(
        _formatRelative(item.createdAt),
        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
      ),
    );
  }

  void _showDetail(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _BlDetailSheet(item: item),
    );
  }
}

class _BlDetailSheet extends StatelessWidget {
  const _BlDetailSheet({required this.item});

  final _BlItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: GravelTokens.space4,
        right: GravelTokens.space4,
        top: GravelTokens.space4,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.number,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: GravelTokens.space2),
          Text(item.customer,
              style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: GravelTokens.space3),
          _DetailRow(label: 'Calibre', value: item.calibre),
          _DetailRow(
            label: 'Tonnage',
            value: '${(item.tonnageKg / 1000).toStringAsFixed(2)} t',
          ),
          _DetailRow(label: 'Camion', value: item.truck),
          _DetailRow(label: 'Chauffeur', value: item.driver),
          const SizedBox(height: GravelTokens.space4),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                  label: const Text('Fermer'),
                ),
              ),
              const SizedBox(width: GravelTokens.space2),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                            'TODO(VTE-03): signature pad → outbox sync via /api/ventes/bon-de-livraison'),
                      ),
                    );
                  },
                  icon: const Icon(Icons.draw),
                  label: const Text('Signer'),
                ),
              ),
            ],
          ),
          const SizedBox(height: GravelTokens.space4),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _NewBlSheet extends StatelessWidget {
  const _NewBlSheet();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: GravelTokens.space4,
        right: GravelTokens.space4,
        top: GravelTokens.space4,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Nouveau Bon de Livraison',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: GravelTokens.space3),
          const Text(
            'Le flow complet (sélection client, calibre, ticket de pesée, '
            'signature chauffeur+client) sera câblé contre la plage de '
            'numérotation offline (`offline_ticket_numbering.dart`) et le '
            'signature pad (`signature_pad.dart`) déjà disponibles.',
          ),
          const SizedBox(height: GravelTokens.space4),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Compris'),
          ),
          const SizedBox(height: GravelTokens.space4),
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
            Icon(Icons.receipt_long, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: GravelTokens.space3),
            Text(
              'Aucun bon de livraison pour ce filtre.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}
