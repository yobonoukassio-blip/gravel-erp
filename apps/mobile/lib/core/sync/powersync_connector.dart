// PowerSync ↔ NestJS bridge. Source: D-10, D-14.
//
// Per RESEARCH.md (Pattern 4), writes go through the NestJS proxy (so RLS +
// validation + audit remain centralized). PowerSync handles only the
// pull/replication side of the equation against the Postgres logical slot.
//
// D-14 invariant: this file MUST NOT use `DateTime.now()` to seed any
// ordering field. The server stamps `server_received_at` + `sequence`.
// `captured_at_local` is set by the form widget for human display only.

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:powersync/powersync.dart';

import '../db/database.dart';

const String kPowerSyncUrlEnv =
    String.fromEnvironment('GRAVEL_POWERSYNC_URL', defaultValue: '');
const String kApiBaseUrlEnv =
    String.fromEnvironment('GRAVEL_API_BASE_URL', defaultValue: '');
const String kFakeTokenEnv =
    String.fromEnvironment('GRAVEL_FAKE_TOKEN', defaultValue: '');

/// PowerSync backend connector that uploads pending mutations through the
/// NestJS write proxy (`POST /api/sync/activity-log`).
class GravelBackendConnector extends PowerSyncBackendConnector {
  GravelBackendConnector({
    required this.db,
    required this.appDb,
    Dio? dio,
    FlutterSecureStorage? storage,
  })  : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: kApiBaseUrlEnv,
              connectTimeout: const Duration(seconds: 10),
              sendTimeout: const Duration(seconds: 20),
              receiveTimeout: const Duration(seconds: 30),
            )),
        _storage = storage ?? const FlutterSecureStorage();

  final PowerSyncDatabase db;
  final AppDatabase appDb;
  final Dio _dio;
  final FlutterSecureStorage _storage;

  @override
  Future<PowerSyncCredentials?> fetchCredentials() async {
    // Plan 04 will replace the fake-token path with the real Keycloak flow.
    final fromSecure = await _storage.read(key: 'access_token');
    final token = (fromSecure != null && fromSecure.isNotEmpty)
        ? fromSecure
        : kFakeTokenEnv;
    if (token.isEmpty || kPowerSyncUrlEnv.isEmpty) return null;
    return PowerSyncCredentials(endpoint: kPowerSyncUrlEnv, token: token);
  }

  @override
  Future<void> uploadData(PowerSyncDatabase database) async {
    final batch = await database.getCrudBatch();
    if (batch == null) return;

    final activityMutations = <Map<String, dynamic>>[];
    final preferenceMutations = <Map<String, dynamic>>[];

    for (final entry in batch.crud) {
      switch (entry.table) {
        case 'daily_activity_log':
          if (entry.op == UpdateType.put) {
            activityMutations.add(_activityEnvelope(entry.opData ?? const {}));
          }
          // append_only_event semantics: ignore UPDATE/DELETE on this table.
          break;
        case 'user_preferences':
          if (entry.opData != null) {
            preferenceMutations.add(_preferenceEnvelope(entry.opData!));
          }
          break;
        default:
          // Unknown table — drop silently (Phase 1 scope per D-12).
          break;
      }
    }

    try {
      if (activityMutations.isNotEmpty) {
        await _dio.post<dynamic>(
          '/api/sync/activity-log',
          data: {'mutations': activityMutations},
        );
        for (final m in activityMutations) {
          await appDb.markSynced(m['id'] as String);
        }
      }
      for (final p in preferenceMutations) {
        await _dio.put<dynamic>('/api/sync/preferences', data: p);
      }
      await batch.complete();
    } on DioException catch (e) {
      // Mark errored rows so the badge can flip and the user can retry.
      for (final m in activityMutations) {
        await appDb.markError(m['id'] as String);
      }
      throw GravelSyncUploadException(
        'Upload failed: ${e.response?.statusCode ?? e.type.name}',
      );
    }
  }
}

Map<String, dynamic> _activityEnvelope(Map<String, dynamic> data) {
  return <String, dynamic>{
    'id': data['id'],
    'tenantId': data['tenant_id'],
    'siteId': data['site_id'],
    'shiftId': data['shift_id'],
    'operationalDayId': data['operational_day_id'],
    'authorUserId': data['author_user_id'],
    // captured_at_local is local wall-clock, encoded as ISO without offset.
    'capturedAtLocal': data['captured_at_local'],
    'clientId': data['client_id'],
    'clientSeq': data['client_seq'],
    'notes': data['notes'],
    'photoSha256': data['photo_sha256'],
    // NOTE (D-14): no `sequence`, no `serverReceivedAt`, no `DateTime.now()`.
  };
}

Map<String, dynamic> _preferenceEnvelope(Map<String, dynamic> data) {
  return <String, dynamic>{
    'userId': data['user_id'],
    'tenantId': data['tenant_id'],
    'key': data['key'],
    'value': jsonDecode(data['value'] as String? ?? 'null'),
    'clientId': data['client_id'],
    'clientSeq': data['client_seq'],
  };
}

class GravelSyncUploadException implements Exception {
  GravelSyncUploadException(this.message);
  final String message;
  @override
  String toString() => 'GravelSyncUploadException: $message';
}
