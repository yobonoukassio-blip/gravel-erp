// Maintenance screen (MNT-03) — Work Orders list with filters.
//
// MVP v1.2 promotion from placeholder: shows a curated list of open work
// orders (preventive + corrective) with filter chips and a FAB to open a new
// WO. Backend wiring to /api/maintenance/work-orders is left as the next
// integration step — UI is built against `_WorkOrderItem` mock data so the
// shell is fully operable on device today.

import 'package:flutter/material.dart';

import '../../../app/theme.dart';

enum _WoStatus { open, inProgress, closed }

enum _WoType { preventive, corrective }

enum _WoSeverity { warning, high, critical }

class _WorkOrderItem {
  const _WorkOrderItem({
    required this.code,
    required this.equipment,
    required this.type,
    required this.status,
    required this.severity,
    required this.openedAt,
    required this.diagnosis,
  });

  final String code;
  final String equipment;
  final _WoType type;
  final _WoStatus status;
  final _WoSeverity severity;
  final DateTime openedAt;
  final String diagnosis;
}

class MaintenanceScreen extends StatefulWidget {
  const MaintenanceScreen({super.key});

  @override
  State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends State<MaintenanceScreen> {
  _StatusFilter _filter = _StatusFilter.openAndInProgress;

  // TODO(MNT-03): replace by repository fetch
  // (apps/api GET /api/maintenance/work-orders?site_id=...&status=open).
  static final List<_WorkOrderItem> _seed = [
    _WorkOrderItem(
      code: 'WO-2026-0188',
      equipment: 'CAT 320D — EX-04',
      type: _WoType.preventive,
      status: _WoStatus.open,
      severity: _WoSeverity.critical,
      openedAt: DateTime.now().subtract(const Duration(hours: 3)),
      diagnosis: 'Révision 500h dépassée de 23h',
    ),
    _WorkOrderItem(
      code: 'WO-2026-0187',
      equipment: 'Volvo A40 — DT-12',
      type: _WoType.corrective,
      status: _WoStatus.inProgress,
      severity: _WoSeverity.high,
      openedAt: DateTime.now().subtract(const Duration(hours: 26)),
      diagnosis: 'Fuite hydraulique bras de levage',
    ),
    _WorkOrderItem(
      code: 'WO-2026-0186',
      equipment: 'Atlas Copco D65 — DR-03',
      type: _WoType.preventive,
      status: _WoStatus.open,
      severity: _WoSeverity.warning,
      openedAt: DateTime.now().subtract(const Duration(days: 1, hours: 2)),
      diagnosis: 'Graissage périodique 250h',
    ),
    _WorkOrderItem(
      code: 'WO-2026-0185',
      equipment: 'Sandvik CH660 — CR-01',
      type: _WoType.corrective,
      status: _WoStatus.closed,
      severity: _WoSeverity.high,
      openedAt: DateTime.now().subtract(const Duration(days: 2)),
      diagnosis: 'Remplacement mâchoire fixe',
    ),
    _WorkOrderItem(
      code: 'WO-2026-0184',
      equipment: 'CAT 988K — LD-02',
      type: _WoType.preventive,
      status: _WoStatus.inProgress,
      severity: _WoSeverity.warning,
      openedAt: DateTime.now().subtract(const Duration(days: 1, hours: 18)),
      diagnosis: 'Vidange moteur 1000h',
    ),
  ];

  Iterable<_WorkOrderItem> get _visible {
    return _seed.where((wo) {
      switch (_filter) {
        case _StatusFilter.all:
          return true;
        case _StatusFilter.openAndInProgress:
          return wo.status != _WoStatus.closed;
        case _StatusFilter.preventive:
          return wo.type == _WoType.preventive;
        case _StatusFilter.closed:
          return wo.status == _WoStatus.closed;
      }
    }).toList()
      ..sort((a, b) => b.openedAt.compareTo(a.openedAt));
  }

  @override
  Widget build(BuildContext context) {
    final items = _visible.toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Maintenance'),
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
                    itemBuilder: (ctx, i) => _WorkOrderTile(item: items[i]),
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showNewWorkOrderSheet(context),
        icon: const Icon(Icons.add),
        label: const Text('Nouveau WO'),
      ),
    );
  }

  void _showNewWorkOrderSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _NewWorkOrderSheet(),
    );
  }
}

enum _StatusFilter { all, openAndInProgress, preventive, closed }

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.current, required this.onChanged});

  final _StatusFilter current;
  final ValueChanged<_StatusFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final entries = <(_StatusFilter, String)>[
      (_StatusFilter.openAndInProgress, 'Ouverts'),
      (_StatusFilter.preventive, 'Préventifs'),
      (_StatusFilter.closed, 'Clôturés'),
      (_StatusFilter.all, 'Tous'),
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

class _WorkOrderTile extends StatelessWidget {
  const _WorkOrderTile({required this.item});

  final _WorkOrderItem item;

  Color get _severityColor => switch (item.severity) {
        _WoSeverity.warning => Colors.orange,
        _WoSeverity.high => Colors.deepOrange,
        _WoSeverity.critical => Colors.red.shade700,
      };

  IconData get _typeIcon => switch (item.type) {
        _WoType.preventive => Icons.event_repeat,
        _WoType.corrective => Icons.build_circle,
      };

  String get _statusLabel => switch (item.status) {
        _WoStatus.open => 'Ouvert',
        _WoStatus.inProgress => 'En cours',
        _WoStatus.closed => 'Clôturé',
      };

  String get _typeLabel => switch (item.type) {
        _WoType.preventive => 'Préventif',
        _WoType.corrective => 'Curatif',
      };

  String _formatRelative(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return 'il y a ${diff.inMinutes} min';
    if (diff.inHours < 24) return 'il y a ${diff.inHours}h';
    return 'il y a ${diff.inDays}j';
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () => _showDetail(context),
      leading: CircleAvatar(
        backgroundColor: _severityColor,
        child: Icon(_typeIcon, color: Colors.white),
      ),
      title: Text(
        item.equipment,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.diagnosis),
          const SizedBox(height: 2),
          Row(
            children: [
              Text(
                '${item.code} · $_typeLabel · $_statusLabel',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ],
      ),
      trailing: Text(
        _formatRelative(item.openedAt),
        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
      ),
    );
  }

  void _showDetail(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WorkOrderDetailSheet(item: item),
    );
  }
}

class _WorkOrderDetailSheet extends StatelessWidget {
  const _WorkOrderDetailSheet({required this.item});

  final _WorkOrderItem item;

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
            item.code,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: GravelTokens.space2),
          Text(item.equipment,
              style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: GravelTokens.space2),
          Text(item.diagnosis),
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
                        content:
                            Text('TODO(MNT-03): clôture WO via /api/maintenance/work-orders/:id/close'),
                      ),
                    );
                  },
                  icon: const Icon(Icons.check_circle),
                  label: const Text('Clôturer'),
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

class _NewWorkOrderSheet extends StatelessWidget {
  const _NewWorkOrderSheet();

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
            'Nouveau Work Order',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: GravelTokens.space3),
          const Text(
            'Le formulaire complet (sélection équipement, type, diagnostic, '
            'technicien assigné) sera câblé contre POST /api/maintenance/work-orders '
            'dans la prochaine itération.',
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
            Icon(Icons.task_alt, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: GravelTokens.space3),
            Text(
              'Aucun work order pour ce filtre.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}
