import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Three discrete sync states surfaced to the operator. Matches the
/// `sync_state` column of `daily_activity_log` rows in the local DB.
enum SyncBadgeState { synced, pending, error }

/// Provider overridden in main.dart to expose a real Stream backed by
/// PowerSync StatusStream + Drift queries. Tests override directly.
final syncBadgeStateProvider = StreamProvider<SyncBadgeState>((ref) async* {
  yield SyncBadgeState.synced;
});

/// A small icon-only badge showing one of three states. Pure widget (no
/// implicit data fetching) so it's trivially widget-testable.
class SyncStatusBadge extends ConsumerWidget {
  const SyncStatusBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncState = ref.watch(syncBadgeStateProvider);
    return asyncState.when(
      data: (state) => _icon(state),
      loading: () => const Padding(
        padding: EdgeInsets.all(8),
        child: SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (_, __) => _icon(SyncBadgeState.error),
    );
  }

  Widget _icon(SyncBadgeState state) {
    final (icon, color, semantic) = switch (state) {
      SyncBadgeState.synced => (Icons.cloud_done, Colors.green, 'synced'),
      SyncBadgeState.pending => (Icons.cloud_upload, Colors.amber, 'pending'),
      SyncBadgeState.error => (Icons.cloud_off, Colors.red, 'error'),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Semantics(
        label: 'sync-$semantic',
        child: Icon(icon, color: color, key: ValueKey('sync-badge-$semantic')),
      ),
    );
  }
}
