// HSE Incident list screen (HSE-01). Mobile read-only incident list.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../repositories/incident_repository.dart';

class IncidentListScreen extends ConsumerStatefulWidget {
  const IncidentListScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.operationalDayId,
  });

  final String tenantId;
  final String siteId;
  final String operationalDayId;

  @override
  ConsumerState<IncidentListScreen> createState() => _IncidentListScreenState();
}

class _IncidentListScreenState extends ConsumerState<IncidentListScreen> {
  List<HseIncident> _incidents = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(incidentRepositoryProvider);
    final list = await repo.listForOperationalDay(widget.operationalDayId);
    if (mounted) {
      setState(() {
        _incidents = list;
        _loading = false;
      });
    }
  }

  String _severityLabel(int s) => switch (s) {
        1 => 'Mineur',
        2 => 'Faible',
        3 => 'Modéré',
        4 => 'Grave',
        5 => 'Fatal',
        _ => 'Sévérité $s',
      };

  Color _severityColor(int s) => switch (s) {
        1 => Colors.green,
        2 => Colors.lightGreen,
        3 => Colors.orange,
        4 => Colors.red,
        5 => Colors.red.shade900,
        _ => Colors.grey,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Incidents HSE'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() => _loading = true);
              _load();
            },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _incidents.isEmpty
              ? const Center(child: Text('Aucun incident enregistré aujourd\'hui.'))
              : ListView.separated(
                  itemCount: _incidents.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (ctx, i) {
                    final inc = _incidents[i];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: _severityColor(inc.severity),
                        child: Text(
                          '${inc.severity}',
                          style: const TextStyle(
                              color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ),
                      title: Text(inc.locationText),
                      subtitle: Text(
                        '${_categoryLabel(inc.category)} — ${_severityLabel(inc.severity)}'
                        '${inc.pendingSync ? ' · En attente de sync' : ''}',
                      ),
                      trailing: inc.pendingSync
                          ? const Icon(Icons.cloud_upload_outlined,
                              color: Colors.orange)
                          : const Icon(Icons.cloud_done, color: Colors.green),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => Container(), // placeholder — real nav in app shell
            ),
          );
          await _load();
        },
        child: const Icon(Icons.add),
        tooltip: 'Nouvel incident',
      ),
    );
  }

  String _categoryLabel(HseCategory cat) => switch (cat) {
        HseCategory.accident_personnel => 'Acc. personnel',
        HseCategory.accident_materiel => 'Acc. matériel',
        HseCategory.near_miss => 'Presqu\'accident',
        HseCategory.environnement => 'Environnement',
        HseCategory.securite => 'Sécurité',
        HseCategory.autre => 'Autre',
      };
}
