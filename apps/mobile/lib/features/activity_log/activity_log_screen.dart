import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/db/database.dart';
import 'activity_log_form.dart';
import 'activity_log_repository.dart';
import 'sync_status_badge.dart';

class ActivityLogScreen extends ConsumerWidget {
  const ActivityLogScreen({
    super.key,
    required this.tenantId,
    required this.siteId,
    required this.authorUserId,
  });

  final String tenantId;
  final String siteId;
  final String authorUserId;

  void _openForm(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: ActivityLogForm(
          tenantId: tenantId,
          siteId: siteId,
          authorUserId: authorUserId,
          onSubmitted: (_) => Navigator.of(sheetContext).pop(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(activityLogRepositoryProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text("Journal d'activité"),
        actions: const [SyncStatusBadge()],
      ),
      body: StreamBuilder<List<DailyActivityLogRow>>(
        stream: repo.watchAll(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final rows = snapshot.data ?? const [];
          if (rows.isEmpty) {
            return const Center(child: Text('No entries yet — tap + to add.'));
          }
          return ListView.separated(
            itemCount: rows.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final r = rows[i];
              return ListTile(
                key: ValueKey('activity-row-${r.id}'),
                title: Text(r.notes),
                subtitle: Text(r.capturedAtLocal.toIso8601String()),
                trailing: _stateChip(r.syncState),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        key: const ValueKey('activity-log-fab'),
        onPressed: () => _openForm(context),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _stateChip(String state) {
    return switch (state) {
      'synced' => const Chip(
          label: Text('synced'),
          avatar: Icon(Icons.cloud_done, size: 16),
        ),
      'error' => const Chip(
          label: Text('error'),
          avatar: Icon(Icons.cloud_off, size: 16),
        ),
      _ => const Chip(
          label: Text('pending'),
          avatar: Icon(Icons.cloud_upload, size: 16),
        ),
    };
  }
}
