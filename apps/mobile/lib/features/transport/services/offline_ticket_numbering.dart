// Offline ticket numbering (TRP-02, ADR-0009).
//
// Format: <SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>
//   e.g. CIV01-20260615-MOB42-0007
//
// - SITE_CODE comes from the active Site context (auth/CLS).
// - YYYYMMDD is the calendar date of the OperationalDay (NOT device clock).
// - DEVICE_SHORT_ID is loaded once from flutter_secure_storage; on first
//   call we generate `MOB` + 5 random hex chars and persist it.
// - LOCAL_SEQ is an SQLite-persisted counter scoped to (device, date).
//   For Phase 2 the counter is held in an in-memory map keyed by
//   (deviceShortId, yyyymmdd). The Drift wiring is a follow-up chore.

import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const String _kDeviceShortIdKey = 'gravel.device_short_id';
final RegExp ticketNumberRegExp =
    RegExp(r'^[A-Z0-9]{2,10}-\d{8}-[A-Z0-9]{2,10}-\d{4,}$');

/// Pattern for the format `${siteCode}-${yyyymmdd}-${deviceId}-${seq}`.
String formatTicketNumber({
  required String siteCode,
  required String yyyymmdd,
  required String deviceId,
  required int seq,
}) {
  final seqStr = seq.toString().padLeft(4, '0');
  return '$siteCode-$yyyymmdd-$deviceId-$seqStr';
}

class OfflineTicketNumbering {
  OfflineTicketNumbering({
    FlutterSecureStorage? storage,
    Map<String, int>? seedCounters,
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _counters = seedCounters ?? <String, int>{};

  final FlutterSecureStorage _storage;
  final Map<String, int> _counters; // key: "$deviceId-$yyyymmdd"

  String? _cachedDeviceShortId;

  /// Returns the device's short id. Generates one on first call and
  /// persists it in flutter_secure_storage.
  Future<String> deviceShortId() async {
    if (_cachedDeviceShortId != null) return _cachedDeviceShortId!;
    final stored = await _storage.read(key: _kDeviceShortIdKey);
    if (stored != null && stored.isNotEmpty) {
      _cachedDeviceShortId = stored;
      return stored;
    }
    final rng = Random.secure();
    final hex = List<int>.generate(5, (_) => rng.nextInt(16))
        .map((n) => n.toRadixString(16).toUpperCase())
        .join();
    final id = 'MOB$hex';
    await _storage.write(key: _kDeviceShortIdKey, value: id);
    _cachedDeviceShortId = id;
    return id;
  }

  /// Generate a fresh ticket number for `siteCode` and the operational day
  /// represented by `date`. Strictly local — never round-trips to the
  /// server. Server validates uniqueness on insert.
  Future<String> generate({
    required String siteCode,
    required DateTime date,
  }) async {
    final deviceId = await deviceShortId();
    final yyyymmdd =
        '${date.year.toString().padLeft(4, '0')}${date.month.toString().padLeft(2, '0')}${date.day.toString().padLeft(2, '0')}';
    final key = '$deviceId-$yyyymmdd';
    final next = (_counters[key] ?? 0) + 1;
    _counters[key] = next;
    final out = formatTicketNumber(
      siteCode: siteCode,
      yyyymmdd: yyyymmdd,
      deviceId: deviceId,
      seq: next,
    );
    assert(
      ticketNumberRegExp.hasMatch(out),
      'Generated ticket number $out does not match format',
    );
    return out;
  }

  /// Testing/debug helper — current sequence for a (device, date) pair.
  int currentSeq({required String deviceId, required String yyyymmdd}) {
    return _counters['$deviceId-$yyyymmdd'] ?? 0;
  }
}

final offlineTicketNumberingProvider = Provider<OfflineTicketNumbering>(
  (ref) => OfflineTicketNumbering(),
);
