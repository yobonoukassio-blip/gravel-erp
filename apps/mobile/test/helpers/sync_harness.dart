// Split-brain sync chaos harness (D-13). Source: W2-P03-T03.
//
// This harness exposes the offline/online toggles + a tiny HTTP shim
// used by the integration test. The full backend (Postgres + PowerSync +
// NestJS API) is expected to be launched by CI via docker-compose; the
// harness only orchestrates client-side state transitions and reads the
// API's row count over HTTP.
//
// Local-dev usage:
//   docker compose -f infra/dev/docker-compose.yml up -d postgres api powersync
//   flutter test integration_test/sync_offline_test.dart \
//     --dart-define GRAVEL_API_BASE_URL=http://localhost:3000 \
//     --dart-define GRAVEL_POWERSYNC_URL=http://localhost:8080 \
//     --dart-define GRAVEL_FAKE_TOKEN=...

import 'dart:async';
import 'dart:convert';
import 'dart:io';

class SyncChaosHarness {
  SyncChaosHarness({
    required this.apiBaseUrl,
    HttpClient? client,
  }) : _client = client ?? HttpClient();

  final String apiBaseUrl;
  final HttpClient _client;
  bool _offline = false;

  bool get isOffline => _offline;

  /// Simulate WAN loss — flip the harness flag and instruct callers to
  /// disconnect their PowerSync database via `db.disconnect()`.
  Future<void> bringOffline() async {
    _offline = true;
  }

  /// Restore connectivity. Callers should call `db.connect(connector: ...)`.
  Future<void> bringOnline() async {
    _offline = false;
  }

  /// Count rows on the server for a given table via the read API.
  /// In Phase 1 we don't have a "list" endpoint yet — for now we hit a
  /// debug endpoint that exposes a count. Until that endpoint lands, the
  /// integration test reads the local Drift DB after the ack instead.
  Future<int> serverRowCount(String table, {required String tenantId}) async {
    if (_offline) {
      throw StateError('Harness is offline — cannot query server');
    }
    final uri = Uri.parse(
      '$apiBaseUrl/api/sync/__debug/count?table=$table&tenant=$tenantId',
    );
    final req = await _client.getUrl(uri);
    final resp = await req.close();
    if (resp.statusCode != 200) {
      throw StateError(
        'serverRowCount: HTTP ${resp.statusCode} for $table',
      );
    }
    final body = await resp.transform(utf8.decoder).join();
    final json = jsonDecode(body) as Map<String, dynamic>;
    return json['count'] as int;
  }

  void dispose() {
    _client.close(force: true);
  }
}
